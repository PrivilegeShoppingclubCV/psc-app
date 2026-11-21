-- Dati dei soci più puliti (richiesta di Daniele, 2026-11-21).
--
-- 1. Niente più TUTTO MAIUSCOLO: nome, cognome, città e indirizzo scritti tutti in
--    maiuscolo diventano "Mario Rossi", "Via Roma 12". Lo fa un trigger, quindi vale
--    per l'import da ReadyPro, l'iscrizione, il profilo e il pannello. I soci che ci
--    sono già si sistemano qui sotto (senza rimandarli a ReadyPro).
-- 2. Il socio può correggere nome e cognome dal profilo (aggiorna_profilo); come
--    per i recapiti, un import da ReadyPro subito dopo non li riporta indietro.
-- 3. Segnalazioni di dati errati: il socio scrive dall'app cosa non va (es. l'email),
--    gli admin le vedono nel pannello e le segnano come risolte.
-- 4. admin_clienti_da_completare: i clienti di ReadyPro con nome, cognome ed email
--    ma senza cellulare e/o codice tessera, iscritti da una data in poi, letti
--    dall'ultimo file clienti ricevuto.

-- ---------------------------------------------------------------------------
-- 1. Maiuscole
-- ---------------------------------------------------------------------------

-- "MARIO  ROSSI" -> "Mario Rossi", "D'ANGELO" -> "D'Angelo", "VIA ROMA 12/A" ->
-- "Via Roma 12/A". Un testo che ha già delle minuscole resta com'è (spazi a parte).
create function interno.testo_elegante(p_testo text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when t is null then null
    when t = upper(t) and t <> lower(t) then initcap(lower(t))
    else t
  end
  from (select nullif(btrim(regexp_replace(p_testo, '\s+', ' ', 'g')), '') as t) x;
$$;

-- Per città e indirizzi: come sopra, con le preposizioni minuscole dopo la prima
-- parola ("San Giovanni in Marignano", "Via della Repubblica").
create function interno.luogo_elegante(p_testo text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    -- Già scritto a mano con le minuscole: si lascia com'è.
    when e is not distinct from nullif(btrim(regexp_replace(p_testo, '\s+', ' ', 'g')), '') then e
    else (
      select string_agg(
        case when n > 1 and lower(w) = any (array['in', 'di', 'del', 'dello', 'della', 'dei', 'degli', 'delle', 'da', 'dal',
          'dalla', 'dai', 'e', 'ed', 'sul', 'sulla', 'al', 'alla', 'allo', 'agli', 'alle', 'con', 'su', 'per'])
        then lower(w) else w end, ' ' order by n)
      from unnest(string_to_array(e, ' ')) with ordinality as u(w, n)
    )
  end
  from (select interno.testo_elegante(p_testo) as e) x;
$$;

create function interno.soci_testi_eleganti()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.nome := interno.testo_elegante(new.nome);
  new.cognome := interno.testo_elegante(new.cognome);
  new.citta := interno.luogo_elegante(new.citta);
  new.indirizzo := interno.luogo_elegante(new.indirizzo);
  return new;
end;
$$;

create trigger soci_testi_eleganti
  before insert or update of nome, cognome, citta, indirizzo on public.soci
  for each row execute function interno.soci_testi_eleganti();

-- Soci già presenti. Non tocca profilo_modificato_il: non riparte nulla verso ReadyPro.
update public.soci set nome = nome, cognome = cognome, citta = citta, indirizzo = indirizzo
where (nome, cognome, citta, indirizzo) is distinct from
      (interno.testo_elegante(nome), interno.testo_elegante(cognome), interno.luogo_elegante(citta), interno.luogo_elegante(indirizzo));

-- ---------------------------------------------------------------------------
-- 2. Nome e cognome dal profilo
-- ---------------------------------------------------------------------------

drop function public.aggiorna_profilo(text, date, text, text, uuid, text);

create function public.aggiorna_profilo(
  p_telefono             text,
  p_data_nascita         date,
  p_cap                  text,
  p_citta                text,
  p_negozio_preferito_id uuid,
  p_indirizzo            text default null,
  p_nome                 text default null,
  p_cognome              text default null
)
returns public.soci
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_telefono text := interno.pulisci_telefono(p_telefono);
  v_socio    public.soci;
  v_nome     text;
  v_cognome  text;
begin
  if v_telefono is null then
    raise exception 'Il numero di telefono è obbligatorio.';
  end if;
  perform interno.controlla_recapiti(p_data_nascita, p_cap, p_citta);
  perform interno.controlla_indirizzo(p_indirizzo);

  select * into v_socio from public.soci where user_id = auth.uid() and stato = 'attivo' for update;
  if not found then
    raise exception 'Nessuna tessera collegata al tuo account.';
  end if;
  -- Nome e cognome: null = lasciali come sono; vuoti non si possono salvare.
  v_nome := coalesce(interno.testo_elegante(p_nome), case when p_nome is null then v_socio.nome end);
  v_cognome := coalesce(interno.testo_elegante(p_cognome), case when p_cognome is null then v_socio.cognome end);
  if v_nome is null or v_cognome is null then
    raise exception 'Nome e cognome sono obbligatori.';
  end if;
  if length(v_nome) > 80 or length(v_cognome) > 80 then
    raise exception 'Nome o cognome troppo lungo.';
  end if;

  update public.soci s set
    nome = v_nome,
    cognome = v_cognome,
    telefono = v_telefono,
    data_nascita = p_data_nascita,
    cap = nullif(btrim(p_cap), ''),
    citta = nullif(btrim(p_citta), ''),
    indirizzo = nullif(btrim(p_indirizzo), ''),
    negozio_preferito_id = p_negozio_preferito_id,
    profilo_modificato_il = now(),
    profilo_lotto_id = null
  where s.id = v_socio.id
    and (s.nome, s.cognome, s.telefono, s.data_nascita, s.cap, s.citta, s.indirizzo, s.negozio_preferito_id) is distinct from
        (v_nome, v_cognome, v_telefono, p_data_nascita, nullif(btrim(p_cap), ''), interno.luogo_elegante(p_citta),
         interno.luogo_elegante(p_indirizzo), p_negozio_preferito_id)
  returning * into v_socio;

  if not found then
    select * into v_socio from public.soci where user_id = auth.uid() and stato = 'attivo';
  end if;
  return v_socio;
end;
$$;

revoke execute on function public.aggiorna_profilo(text, date, text, text, uuid, text, text, text) from public, anon;
grant execute on function public.aggiorna_profilo(text, date, text, text, uuid, text, text, text) to authenticated;

-- L'import da ReadyPro non riporta indietro nome e cognome corretti in app da poco
-- (stessa regola dei recapiti, interno.profilo_recente).
create or replace function public.importa_soci(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch       public.import_batch := interno.apri_batch(p_batch_id, 'soci');
  v_mappa       jsonb := v_batch.mappatura_colonne;
  v_versione    text := (select valore #>> '{}' from public.impostazioni where chiave = 'versione_consensi_import');
  r             public.import_righe;
  v_tessera     text;
  v_altra       text;
  v_livello     text;
  v_negozio     text;
  v_negozio_id  uuid;
  v_iscritto_il date;
  v_punti       integer;
  v_consenso    boolean;
  v_tipo        text;
  v_socio_id    uuid;
  v_nuovo       boolean;
  v_avvisi      text[];
  v_avviso      text;
  v_app         boolean;
begin
  for r in
    select * from public.import_righe
    where batch_id = p_batch_id and stato = 'in_attesa'
    order by numero_riga
  loop
    begin
      v_avvisi := '{}';
      v_tessera := interno.pulisci_codice(interno.import_tessera(r.dati, v_mappa));
      v_altra := interno.pulisci_codice(interno.import_testo(r.dati, v_mappa, 'altra_tessera'));
      if v_altra = v_tessera then
        v_altra := null;
      end if;

      v_livello := lower(interno.import_testo(r.dati, v_mappa, 'livello'));
      if v_livello is not null and not exists (select 1 from public.livelli where codice = v_livello) then
        v_avvisi := v_avvisi || format('Livello "%s" sconosciuto: ignorato.', v_livello);
        v_livello := null;
      end if;

      v_negozio := interno.import_testo(r.dati, v_mappa, 'negozio');
      v_negozio_id := (select id from public.negozi where codice_gestionale = v_negozio);
      if v_negozio is not null and v_negozio_id is null then
        v_avvisi := v_avvisi || format('Negozio "%s" non trovato: ignorato.', v_negozio);
      end if;

      v_iscritto_il := interno.import_data(interno.import_testo(r.dati, v_mappa, 'iscritto_il'));

      v_socio_id := coalesce(interno.socio_da_tessera(v_tessera), interno.socio_da_tessera(v_altra));
      v_nuovo := v_socio_id is null;

      -- Tessera mai vista: se la persona si era già iscritta dall'app (stessa email
      -- o stesso cellulare, nessuna tessera fisica), la tessera va sulla sua scheda
      -- invece di crearne una seconda. La digitale viene sostituita dalla fisica.
      if v_nuovo then
        v_socio_id := interno.socio_da_contatti(
          interno.import_testo(r.dati, v_mappa, 'email'),
          interno.import_testo(r.dati, v_mappa, 'telefono'));
        if v_socio_id is not null then
          v_nuovo := false;
          v_avvisi := v_avvisi || format('Tessera %s collegata alla scheda già iscritta dall''app (stessa email o cellulare).', v_tessera);
        end if;
      end if;

      -- Il gestionale è la fonte dei dati anagrafici: un valore presente nel file
      -- sovrascrive quello salvato, una cella vuota non cancella nulla.
      if v_nuovo then
        insert into public.soci (
          nome, cognome, email, telefono, data_nascita, indirizzo, cap, citta,
          livello, negozio_preferito_id, iscritto_il, origine, dati_gestionale, ultimo_import_id
        ) values (
          interno.import_testo(r.dati, v_mappa, 'nome'),
          interno.import_testo(r.dati, v_mappa, 'cognome'),
          lower(interno.import_testo(r.dati, v_mappa, 'email')),
          interno.import_testo(r.dati, v_mappa, 'telefono'),
          interno.import_data(interno.import_testo(r.dati, v_mappa, 'data_nascita')),
          interno.import_testo(r.dati, v_mappa, 'indirizzo'),
          interno.import_testo(r.dati, v_mappa, 'cap'),
          interno.import_testo(r.dati, v_mappa, 'citta'),
          coalesce(v_livello, 'classic'),
          v_negozio_id,
          coalesce(v_iscritto_il, current_date),
          'import',
          r.dati - array(select value from jsonb_each_text(v_mappa)),
          p_batch_id
        )
        returning id into v_socio_id;
      else
        v_app := interno.profilo_recente(v_socio_id, v_batch.creato_il);
        if v_app then
          v_avvisi := v_avvisi || 'Dati modificati di recente in app: tenuti quelli dell''app.'::text;
        end if;
        update public.soci s set
          nome                 = case when v_app then s.nome else coalesce(interno.import_testo(r.dati, v_mappa, 'nome'), s.nome) end,
          cognome              = case when v_app then s.cognome else coalesce(interno.import_testo(r.dati, v_mappa, 'cognome'), s.cognome) end,
          email                = coalesce(lower(interno.import_testo(r.dati, v_mappa, 'email')), s.email),
          telefono             = case when v_app then s.telefono else coalesce(interno.import_testo(r.dati, v_mappa, 'telefono'), s.telefono) end,
          data_nascita         = case when v_app then s.data_nascita else coalesce(interno.import_data(interno.import_testo(r.dati, v_mappa, 'data_nascita')), s.data_nascita) end,
          indirizzo            = case when v_app then s.indirizzo else coalesce(interno.import_testo(r.dati, v_mappa, 'indirizzo'), s.indirizzo) end,
          cap                  = case when v_app then s.cap else coalesce(interno.import_testo(r.dati, v_mappa, 'cap'), s.cap) end,
          citta                = case when v_app then s.citta else coalesce(interno.import_testo(r.dati, v_mappa, 'citta'), s.citta) end,
          livello              = coalesce(v_livello, s.livello),
          negozio_preferito_id = coalesce(v_negozio_id, s.negozio_preferito_id),
          iscritto_il          = coalesce(v_iscritto_il, s.iscritto_il),
          dati_gestionale      = s.dati_gestionale || (r.dati - array(select value from jsonb_each_text(v_mappa))),
          ultimo_import_id     = p_batch_id
        where s.id = v_socio_id;
      end if;

      v_avviso := interno.import_aggancia_tessera(v_socio_id, v_tessera, p_batch_id);
      if v_avviso is not null then
        v_avvisi := v_avvisi || v_avviso;
      end if;

      -- Saldo iniziale: solo al primo import. Dopo, i punti cambiano con i movimenti.
      v_punti := round(interno.import_numero(interno.import_testo(r.dati, v_mappa, 'punti')));
      if coalesce(v_punti, 0) <> 0 then
        if exists (select 1 from public.movimenti_punti where socio_id = v_socio_id and tipo = 'saldo_iniziale') then
          v_avvisi := v_avvisi || format('Saldo iniziale già importato: i %s punti del file non sono stati aggiunti.', v_punti);
        else
          insert into public.movimenti_punti (socio_id, punti, tipo, descrizione, fonte, import_batch_id, creato_da)
          values (v_socio_id, v_punti, 'saldo_iniziale', 'Saldo importato dal gestionale', 'import', p_batch_id, auth.uid());
        end if;
      end if;

      -- Consensi: si importano solo se il socio non ne ha ancora per quel tipo.
      -- Una scelta fatta poi in app non viene mai sovrascritta dal gestionale.
      foreach v_tipo in array array['privacy', 'marketing', 'profilazione'] loop
        v_consenso := interno.import_booleano(interno.import_testo(r.dati, v_mappa, 'consenso_' || v_tipo));
        if v_consenso is not null
           and not exists (select 1 from public.consensi where socio_id = v_socio_id and tipo = v_tipo) then
          insert into public.consensi (socio_id, tipo, concesso, versione_testo, canale, registrato_da)
          values (v_socio_id, v_tipo, v_consenso, v_versione, 'import', auth.uid());
        end if;
      end loop;

      update public.import_righe set
        stato = case when v_nuovo then 'importata' else 'aggiornata' end,
        socio_id = v_socio_id,
        errore = null,
        avviso = nullif(array_to_string(v_avvisi, ' '), '')
      where id = r.id;
    exception when others then
      update public.import_righe set stato = 'errore', errore = sqlerrm where id = r.id;
    end;
  end loop;

  return interno.chiudi_batch(p_batch_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Segnalazioni di dati errati
-- ---------------------------------------------------------------------------

create table public.segnalazioni_dati (
  id          uuid primary key default gen_random_uuid(),
  socio_id    uuid not null references public.soci (id) on delete cascade,
  campo       text not null check (campo in ('nome', 'cognome', 'email', 'telefono', 'data_nascita', 'indirizzo', 'tessera', 'punti', 'altro')),
  messaggio   text not null check (length(btrim(messaggio)) between 3 and 1000),
  stato       text not null default 'aperta' check (stato in ('aperta', 'risolta')),
  nota_admin  text,
  creato_il   timestamptz not null default now(),
  risolta_il  timestamptz,
  risolta_da  uuid references auth.users (id) on delete set null
);
comment on table public.segnalazioni_dati is 'Dati sbagliati segnalati dai soci in app, da sistemare nel pannello o in ReadyPro.';
create index segnalazioni_dati_aperte_idx on public.segnalazioni_dati (creato_il) where stato = 'aperta';
create index segnalazioni_dati_socio_idx on public.segnalazioni_dati (socio_id);

alter table public.segnalazioni_dati enable row level security;
create policy "segnalazioni: il socio vede le sue" on public.segnalazioni_dati
  for select to authenticated
  using (socio_id in (select id from public.soci where user_id = auth.uid()));
create policy "segnalazioni: admin" on public.segnalazioni_dati
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, update on public.segnalazioni_dati to authenticated;

create function public.segnala_dato_errato(p_campo text, p_messaggio text)
returns public.segnalazioni_dati
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_socio_id uuid := (select id from public.soci where user_id = auth.uid() and stato <> 'cessato');
  v_riga     public.segnalazioni_dati;
begin
  if v_socio_id is null then
    raise exception 'Nessuna tessera collegata al tuo account.' using errcode = 'insufficient_privilege';
  end if;
  if (select count(*) from public.segnalazioni_dati where socio_id = v_socio_id and stato = 'aperta') >= 5 then
    raise exception 'Hai già 5 segnalazioni in attesa: le stiamo guardando.';
  end if;
  if length(btrim(coalesce(p_messaggio, ''))) < 3 then
    raise exception 'Scrivi cosa non è corretto.';
  end if;
  if length(btrim(p_messaggio)) > 1000 then
    raise exception 'Il messaggio è troppo lungo (al massimo 1000 caratteri).';
  end if;
  insert into public.segnalazioni_dati (socio_id, campo, messaggio)
  values (v_socio_id, coalesce(nullif(p_campo, ''), 'altro'), btrim(p_messaggio))
  returning * into v_riga;
  return v_riga;
end;
$$;

create function public.admin_risolvi_segnalazione(p_id uuid, p_nota text default null)
returns public.segnalazioni_dati
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_riga public.segnalazioni_dati;
begin
  perform interno.richiedi_admin();
  update public.segnalazioni_dati set
    stato = 'risolta', risolta_il = now(), risolta_da = auth.uid(),
    nota_admin = nullif(btrim(coalesce(p_nota, '')), '')
  where id = p_id
  returning * into v_riga;
  if not found then
    raise exception 'Segnalazione non trovata.';
  end if;
  return v_riga;
end;
$$;

revoke execute on function public.segnala_dato_errato(text, text), public.admin_risolvi_segnalazione(uuid, text) from public, anon;
grant execute on function public.segnala_dato_errato(text, text), public.admin_risolvi_segnalazione(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Clienti di ReadyPro da completare
-- ---------------------------------------------------------------------------

-- Come interno.import_data, ma una data illeggibile diventa null invece di un errore.
create function interno.data_o_null(p_valore text)
returns date
language plpgsql
immutable
set search_path = ''
as $$
begin
  return interno.import_data(p_valore);
exception when others then
  return null;
end;
$$;

-- Dall'ultimo file clienti ricevuto (righe degli ultimi 30 giorni, l'invio completo
-- arriva ogni 7): un cliente per ID ReadyPro, con la versione più recente.
-- Servono nome, cognome ed email (non quelle finte di Amazon ed eBay); manca il cellulare e/o il codice tessera; la data
-- d'iscrizione (colonna mappata come "iscritto_il", altrimenti "Dett.") è dal p_dal
-- in poi. telefono_app: il cellulare che il socio ha scritto in app, se c'è.
create function public.admin_clienti_da_completare(p_dal date default '2023-12-07')
returns table (
  id_readypro text, cognome text, nome text, email text, cellulare text,
  tessera text, iscritto_il date, manca text, telefono_app text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_mappa jsonb := coalesce(
    nullif((select valore from public.impostazioni where chiave = 'gestionale_mappatura_soci'), '{}'::jsonb),
    (select mappatura_colonne from public.import_batch where tipo = 'soci' order by creato_il desc limit 1),
    '{}');
begin
  perform interno.richiedi_admin();
  if v_mappa ->> 'iscritto_il' is null then
    v_mappa := v_mappa || '{"iscritto_il": "Dett."}';
  end if;
  return query
  with ultime as (
    select distinct on (coalesce(r.dati ->> 'ID', r.id::text)) r.dati
    from public.import_righe r
    join public.import_batch b on b.id = r.batch_id
    where b.tipo = 'soci'
    order by coalesce(r.dati ->> 'ID', r.id::text), b.creato_il desc, r.numero_riga desc
  ),
  c as (
    select
      u.dati ->> 'ID' as id_rp,
      interno.import_testo(u.dati, v_mappa, 'cognome') as cog,
      interno.import_testo(u.dati, v_mappa, 'nome') as nom,
      lower(interno.import_testo(u.dati, v_mappa, 'email')) as mail,
      interno.import_testo(u.dati, v_mappa, 'telefono') as tel,
      interno.pulisci_codice(interno.import_testo(u.dati, v_mappa, 'numero_tessera')) as tes,
      interno.data_o_null(interno.import_testo(u.dati, v_mappa, 'iscritto_il')) as dal
    from ultime u
  )
  select c.id_rp, interno.testo_elegante(c.cog), interno.testo_elegante(c.nom), c.mail, c.tel, c.tes, c.dal,
    concat_ws(' e ', case when c.tel is null then 'cellulare' end, case when c.tes is null then 'tessera' end),
    (select s.telefono from public.tessere t join public.soci s on s.id = t.socio_id where t.codice = c.tes limit 1)
  from c
  where c.cog is not null and c.nom is not null and c.mail is not null
    -- Ordini dei marketplace: ReadyPro li registra come clienti con un'email finta.
    and c.mail !~ '@(marketplace\.amazon\.|members\.ebay\.)'
    and (c.tel is null or c.tes is null)
    and c.dal >= p_dal
  order by c.dal desc, c.cog, c.nom;
end;
$$;

revoke execute on function public.admin_clienti_da_completare(date) from public, anon;
grant execute on function public.admin_clienti_da_completare(date) to authenticated;
