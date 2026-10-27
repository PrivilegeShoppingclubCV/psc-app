-- Sincronizzazione con il gestionale dei negozi (ReadyPro).
--
-- ReadyPro non ha un'API: è il server dei negozi a parlare con l'app, sempre in
-- uscita e via HTTPS, con una chiave dedicata (tools/readypro/). Nel server non
-- entra nessuno e nel database di ReadyPro non si scrive mai direttamente.
--
-- Due flussi:
-- 1. ReadyPro -> app: il CSV dei clienti esportato da ReadyPro arriva a
--    gestionale_ricevi_soci() e passa dal solito importa_soci().
-- 2. app -> ReadyPro: le tessere create in app nascono "in attivazione"; il server
--    le scarica a lotti con gestionale_nuovi_iscritti(), le importa in ReadyPro e
--    conferma il lotto. La tessera diventa "attiva" quando il suo numero ricompare
--    nel CSV dei clienti: è la prova che la cassa la conosce.

-- ---------------------------------------------------------------------------
-- Chiavi del server dei negozi
-- Si salva solo l'impronta SHA-256: la chiave in chiaro si vede una volta sola,
-- quando si crea. Una chiave revocata smette subito di funzionare.
-- ---------------------------------------------------------------------------

create table public.gestionale_chiavi (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null,
  -- Primi caratteri della chiave, per riconoscerla senza conoscerla tutta.
  prefisso     text not null,
  impronta     text not null unique,
  creata_da    uuid references auth.users (id) on delete set null,
  creata_il    timestamptz not null default now(),
  ultimo_uso   timestamptz,
  revocata_il  timestamptz
);

alter table public.gestionale_chiavi enable row level security;
create policy "gestionale_chiavi: lettura admin" on public.gestionale_chiavi
  for select to authenticated using (public.is_admin());
grant select (id, nome, prefisso, creata_il, ultimo_uso, revocata_il) on public.gestionale_chiavi to authenticated;

-- Restituisce la chiave in chiaro: copiala subito nello script del server.
create function public.gestionale_crea_chiave(p_nome text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chiave text := 'psc_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  if not (public.is_admin() or session_user <> 'authenticator') then
    raise exception 'Solo un admin può creare chiavi.' using errcode = 'insufficient_privilege';
  end if;
  insert into public.gestionale_chiavi (nome, prefisso, impronta, creata_da)
  values (coalesce(nullif(btrim(p_nome), ''), 'Server negozi'), left(v_chiave, 10),
          encode(sha256(convert_to(v_chiave, 'UTF8')), 'hex'), auth.uid());
  return v_chiave;
end;
$$;

create function public.gestionale_revoca_chiave(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (public.is_admin() or session_user <> 'authenticator') then
    raise exception 'Solo un admin può revocare chiavi.' using errcode = 'insufficient_privilege';
  end if;
  update public.gestionale_chiavi set revocata_il = now() where id = p_id and revocata_il is null;
end;
$$;

-- Stesso errore per chiave sbagliata, revocata o mancante.
create function interno.gestionale_verifica_chiave(p_chiave text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
begin
  update public.gestionale_chiavi set ultimo_uso = now()
  where impronta = encode(sha256(convert_to(coalesce(p_chiave, ''), 'UTF8')), 'hex')
    and revocata_il is null
  returning id into v_id;
  if v_id is null then
    raise exception 'Chiave del gestionale non valida.' using errcode = 'insufficient_privilege';
  end if;
  return v_id;
end;
$$;

-- Gli import partiti da una chiave valida passano il controllo di interno.puo_importare().
-- psc.import_gestionale si imposta solo dentro le funzioni qui sotto: dalle API
-- di Supabase non si possono impostare parametri di sessione arbitrari.
create or replace function interno.puo_importare()
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.is_admin()
    or coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    or session_user <> 'authenticator'
    or coalesce(current_setting('psc.import_gestionale', true), '') = 'on';
$$;

-- ---------------------------------------------------------------------------
-- Stato della tessera in cassa
-- ---------------------------------------------------------------------------

create table public.gestionale_lotti (
  id            uuid primary key default gen_random_uuid(),
  chiave_id     uuid references public.gestionale_chiavi (id) on delete set null,
  righe         integer not null,
  creato_il     timestamptz not null default now(),
  -- Il server ha salvato il file nella cartella da cui ReadyPro importa.
  confermato_il timestamptz
);

alter table public.gestionale_lotti enable row level security;
create policy "gestionale_lotti: lettura admin" on public.gestionale_lotti
  for select to authenticated using (public.is_admin());
grant select on public.gestionale_lotti to authenticated;

alter table public.soci
  add column stato_cassa text not null default 'attiva'
    check (stato_cassa in ('in_attivazione', 'attiva')),
  add column attivata_in_cassa_il timestamptz,
  -- Ultimo lotto con cui la tessera è stata mandata a ReadyPro.
  add column lotto_cassa_id uuid references public.gestionale_lotti (id) on delete set null;

create index soci_in_attivazione_idx on public.soci (creato_il) where stato_cassa = 'in_attivazione';

-- Le tessere create in app la cassa non le conosce ancora; quelle importate sì.
create function public.soci_stato_cassa_iniziale()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.stato_cassa := case when new.origine = 'app' then 'in_attivazione' else 'attiva' end;
  new.attivata_in_cassa_il := case when new.stato_cassa = 'attiva' then now() end;
  return new;
end;
$$;

create trigger soci_stato_cassa_iniziale
  before insert on public.soci
  for each row execute function public.soci_stato_cassa_iniziale();

-- Una tessera che ricompare in un import del gestionale è nota alla cassa.
-- importa_soci() aggiorna ultimo_import_id su ogni socio che trova nel file.
create function public.soci_attiva_in_cassa()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.stato_cassa = 'in_attivazione'
     and new.ultimo_import_id is not null
     and new.ultimo_import_id is distinct from old.ultimo_import_id then
    new.stato_cassa := 'attiva';
    new.attivata_in_cassa_il := now();
  end if;
  return new;
end;
$$;

create trigger soci_attiva_in_cassa
  before update of ultimo_import_id on public.soci
  for each row execute function public.soci_attiva_in_cassa();

-- Per il pannello admin: tessere create in app che la cassa non conosce ancora.
create view public.soci_in_attesa_cassa
with (security_invoker = true)
as
select
  s.id, s.numero_tessera, s.nome, s.cognome, s.email, s.creato_il,
  round(extract(epoch from now() - s.creato_il) / 3600, 1) as ore_di_attesa,
  l.creato_il     as inviata_il,
  l.confermato_il as ritirata_il
from public.soci s
left join public.gestionale_lotti l on l.id = s.lotto_cassa_id
where s.stato_cassa = 'in_attivazione' and s.stato = 'attivo'
order by s.creato_il;

grant select on public.soci_in_attesa_cassa to authenticated;

-- ---------------------------------------------------------------------------
-- ReadyPro -> app: CSV dei clienti
-- ---------------------------------------------------------------------------

alter table public.import_batch
  add column chiave_id uuid references public.gestionale_chiavi (id) on delete set null,
  -- Impronta del file: lo stesso file inviato due volte non si rielabora.
  add column impronta_file text;

insert into public.impostazioni (chiave, valore, descrizione) values
  ('gestionale_mappatura_soci', '{}',
   'Colonne del CSV clienti di ReadyPro, es. {"numero_tessera": "Codice a barre", "nome": "Nome"}. Vuota = i file arrivano ma restano da elaborare.'),
  ('gestionale_giorni_righe', '30',
   'Giorni dopo cui si cancellano le righe degli invii automatici andati a buon fine (gli errori restano)');

-- p_righe: array di oggetti {intestazione: valore}, tutti testo, letto dal CSV
-- in src/app/api/gestionale/. Restituisce l'esito dell'import.
create function public.gestionale_ricevi_soci(
  p_chiave        text,
  p_nome_file     text,
  p_impronta_file text,
  p_righe         jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chiave_id uuid := interno.gestionale_verifica_chiave(p_chiave);
  v_mappa     jsonb := coalesce((select valore from public.impostazioni where chiave = 'gestionale_mappatura_soci'), '{}');
  v_giorni    int := coalesce((select (valore #>> '{}')::int from public.impostazioni where chiave = 'gestionale_giorni_righe'), 30);
  v_batch_id  uuid;
  v_esito     jsonb;
begin
  if jsonb_typeof(p_righe) is distinct from 'array' then
    raise exception 'Le righe devono essere un elenco.';
  end if;

  -- Stesso file dell'ultimo invio elaborato: niente da fare.
  if p_impronta_file is not null and p_impronta_file = (
    select impronta_file from public.import_batch
    where chiave_id is not null and tipo = 'soci' and stato = 'elaborato'
    order by creato_il desc limit 1
  ) then
    return jsonb_build_object('esito', 'invariato');
  end if;

  insert into public.import_batch (tipo, nome_file, mappatura_colonne, righe_totali, note, chiave_id, impronta_file)
  values ('soci', coalesce(nullif(btrim(p_nome_file), ''), 'clienti.csv'), v_mappa,
          jsonb_array_length(p_righe), 'Invio automatico dal server dei negozi', v_chiave_id, p_impronta_file)
  returning id into v_batch_id;

  insert into public.import_righe (batch_id, numero_riga, dati)
  select v_batch_id, n::int, r
  from jsonb_array_elements(p_righe) with ordinality as e(r, n);

  -- Finché la mappatura non è impostata il file resta "caricato": un admin
  -- guarda le intestazioni in import_righe, imposta gestionale_mappatura_soci,
  -- aggiorna mappatura_colonne del batch e lancia importa_soci().
  if v_mappa ->> 'numero_tessera' is null then
    return jsonb_build_object('esito', 'da_mappare', 'batch_id', v_batch_id, 'righe', jsonb_array_length(p_righe));
  end if;

  perform set_config('psc.import_gestionale', 'on', true);
  v_esito := public.importa_soci(v_batch_id);
  perform set_config('psc.import_gestionale', '', true);

  -- Pulizia: gli invii orari ripetono tutto il file, le righe riuscite non servono a lungo.
  delete from public.import_righe r
  using public.import_batch b
  where r.batch_id = b.id
    and b.chiave_id is not null
    and b.creato_il < now() - make_interval(days => v_giorni)
    and r.stato in ('importata', 'aggiornata', 'saltata');

  return jsonb_build_object('esito', 'elaborato', 'batch_id', v_batch_id) || v_esito;
end;
$$;

-- ---------------------------------------------------------------------------
-- app -> ReadyPro: nuovi iscritti
-- ---------------------------------------------------------------------------

-- Crea un lotto con le tessere ancora in attivazione mai mandate o mandate in
-- un lotto non confermato (il server non ha salvato il file: si riprova).
-- Nessuna tessera da mandare: restituisce lotto null e nessuna riga.
create function public.gestionale_nuovi_iscritti(p_chiave text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chiave_id uuid := interno.gestionale_verifica_chiave(p_chiave);
  v_lotto_id  uuid;
  v_righe     jsonb;
begin
  perform 1 from public.soci s
  where s.stato_cassa = 'in_attivazione' and s.stato = 'attivo'
    and (s.lotto_cassa_id is null
         or exists (select 1 from public.gestionale_lotti l where l.id = s.lotto_cassa_id and l.confermato_il is null))
  for update;
  if not found then
    return jsonb_build_object('lotto', null, 'righe', '[]'::jsonb);
  end if;

  insert into public.gestionale_lotti (chiave_id, righe) values (v_chiave_id, 0) returning id into v_lotto_id;

  update public.soci s set lotto_cassa_id = v_lotto_id
  where s.stato_cassa = 'in_attivazione' and s.stato = 'attivo'
    and (s.lotto_cassa_id is null
         or exists (select 1 from public.gestionale_lotti l where l.id = s.lotto_cassa_id and l.confermato_il is null));

  select coalesce(jsonb_agg(jsonb_build_object(
      'numero_tessera', s.numero_tessera,
      'cognome', s.cognome,
      'nome', s.nome,
      'email', s.email,
      'telefono', s.telefono,
      'data_nascita', to_char(s.data_nascita, 'DD/MM/YYYY'),
      'cap', s.cap,
      'citta', s.citta,
      'negozio', n.codice_gestionale,
      'iscritto_il', to_char(s.iscritto_il, 'DD/MM/YYYY'),
      'consenso_privacy', case cp.concesso when true then 'SI' when false then 'NO' end,
      'consenso_marketing', case cm.concesso when true then 'SI' when false then 'NO' end
    ) order by s.creato_il), '[]'::jsonb)
  into v_righe
  from public.soci s
  left join public.negozi n on n.id = s.negozio_preferito_id
  left join public.consensi_attuali cp on cp.socio_id = s.id and cp.tipo = 'privacy'
  left join public.consensi_attuali cm on cm.socio_id = s.id and cm.tipo = 'marketing'
  where s.lotto_cassa_id = v_lotto_id;

  update public.gestionale_lotti set righe = jsonb_array_length(v_righe) where id = v_lotto_id;
  return jsonb_build_object('lotto', v_lotto_id, 'righe', v_righe);
end;
$$;

create function public.gestionale_conferma_lotto(p_chiave text, p_lotto uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform interno.gestionale_verifica_chiave(p_chiave);
  update public.gestionale_lotti set confermato_il = coalesce(confermato_il, now()) where id = p_lotto;
  if not found then
    raise exception 'Lotto % non trovato.', p_lotto;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permessi
-- Le funzioni con la chiave sono aperte ad anon: la chiave è il controllo.
-- ---------------------------------------------------------------------------

revoke execute on all functions in schema interno from public;
revoke execute on function
  public.gestionale_crea_chiave(text),
  public.gestionale_revoca_chiave(uuid),
  public.gestionale_ricevi_soci(text, text, text, jsonb),
  public.gestionale_nuovi_iscritti(text),
  public.gestionale_conferma_lotto(text, uuid)
from public;
grant execute on function public.gestionale_crea_chiave(text), public.gestionale_revoca_chiave(uuid) to authenticated;
grant execute on function
  public.gestionale_ricevi_soci(text, text, text, jsonb),
  public.gestionale_nuovi_iscritti(text),
  public.gestionale_conferma_lotto(text, uuid)
to anon, authenticated;
