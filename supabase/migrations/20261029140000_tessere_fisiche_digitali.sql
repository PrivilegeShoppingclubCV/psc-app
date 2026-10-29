-- Tessere fisiche e digitali.
--
-- Fino a qui un socio era una tessera (soci.numero_tessera). Da qui il socio è
-- la persona (punti, livello, consensi e, se vuole, l'account dell'app) e le
-- tessere sono i codici che la cassa legge, in una tabella a parte:
-- - fisica: codice già stampato sulla plastica. Si carica nel magazzino e si
--   consegna in negozio, anche a chi non ha l'app (es. clienti anziani);
-- - digitale: APP000123, creata dall'app.
-- Ogni socio ha al massimo una fisica e una digitale attive, entrambe valide in
-- cassa. I punti sono del socio, quindi gli stessi qualunque tessera passi.
--
-- Le tessere già presenti diventano: create in app -> digitali, le altre -> fisiche.

-- ---------------------------------------------------------------------------
-- Tabella
-- ---------------------------------------------------------------------------

create table public.tessere (
  id                   uuid primary key default gen_random_uuid(),
  codice               text not null unique
                         check (codice <> '' and codice !~ '\s'),
  tipo                 text not null check (tipo in ('fisica', 'digitale')),
  -- Vuoto = tessera fisica nel magazzino, non ancora consegnata.
  socio_id             uuid references public.soci (id) on delete cascade,
  stato                text not null default 'attiva'
                         check (stato in ('da_consegnare', 'attiva', 'bloccata')),
  -- in_attivazione = ReadyPro non la conosce ancora (non è ancora comparsa
  -- nell'export dei clienti); attiva = la cassa la riconosce.
  stato_cassa          text not null default 'attiva'
                         check (stato_cassa in ('in_attivazione', 'attiva')),
  attivata_in_cassa_il timestamptz,
  -- Ultimo lotto con cui la tessera è stata mandata a ReadyPro.
  lotto_cassa_id       uuid references public.gestionale_lotti (id) on delete set null,
  ultimo_import_id     uuid references public.import_batch (id) on delete set null,
  consegnata_il        timestamptz,
  consegnata_da        uuid references auth.users (id) on delete set null,
  bloccata_il          timestamptz,
  motivo_blocco        text,
  creato_il            timestamptz not null default now(),
  aggiornato_il        timestamptz not null default now(),
  check ((stato = 'da_consegnare') = (socio_id is null)),
  check (tipo = 'fisica' or stato <> 'da_consegnare')
);

create unique index tessere_una_attiva_per_tipo on public.tessere (socio_id, tipo) where stato = 'attiva';
create index tessere_socio_idx on public.tessere (socio_id);
create index tessere_in_attivazione_idx on public.tessere (creato_il) where stato_cassa = 'in_attivazione';

create trigger tessere_aggiornato_il
  before update on public.tessere
  for each row execute function public.imposta_aggiornato_il();

-- Il codice non si cambia mai: è stampato o è già nella cassa. Per correggere un
-- errore di battitura serve un gesto esplicito dal SQL editor:
--   set local psc.consenti_modifica_tessera = 'on'; update public.tessere ...
create or replace function public.blocca_modifica_tessera()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.codice is distinct from old.codice
     and coalesce(current_setting('psc.consenti_modifica_tessera', true), '') <> 'on' then
    raise exception 'Il codice della tessera non si può modificare (%).', old.codice
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger tessere_blocca_modifica_codice
  before update of codice on public.tessere
  for each row execute function public.blocca_modifica_tessera();

-- ---------------------------------------------------------------------------
-- Dalle vecchie colonne di soci alle tessere
-- ---------------------------------------------------------------------------

insert into public.tessere (
  codice, tipo, socio_id, stato, stato_cassa, attivata_in_cassa_il, lotto_cassa_id,
  ultimo_import_id, consegnata_il, creato_il
)
select
  regexp_replace(numero_tessera, '\s', '', 'g'),
  case when origine = 'app' then 'digitale' else 'fisica' end,
  id, 'attiva', stato_cassa, attivata_in_cassa_il, lotto_cassa_id,
  ultimo_import_id, creato_il, creato_il
from public.soci;

drop view public.soci_in_attesa_cassa;
drop trigger soci_stato_cassa_iniziale on public.soci;
drop trigger soci_attiva_in_cassa on public.soci;
drop trigger soci_blocca_modifica_tessera on public.soci;
drop function public.soci_stato_cassa_iniziale();
drop function public.soci_attiva_in_cassa();

alter table public.soci
  drop column numero_tessera,
  drop column stato_cassa,
  drop column attivata_in_cassa_il,
  drop column lotto_cassa_id;

insert into public.impostazioni (chiave, valore, descrizione) values
  ('tessera_fisica_formato', '""',
   'Espressione regolare che i codici delle tessere fisiche devono rispettare, es. "^[0-9]{6}$". Vuota = qualsiasi codice senza spazi.'),
  ('tessere_fisiche_solo_magazzino', 'false',
   'true = si possono consegnare solo tessere fisiche caricate nel magazzino (un codice digitato male viene rifiutato)')
on conflict (chiave) do nothing;

-- ---------------------------------------------------------------------------
-- Funzioni interne
-- ---------------------------------------------------------------------------

-- Il codice come lo scrive il commesso o il socio: via gli spazi ("0047 18").
create function interno.pulisci_codice(p_codice text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(regexp_replace(coalesce(p_codice, ''), '\s', '', 'g'), '');
$$;

create function interno.nuovo_codice_app()
returns text
language sql
volatile
set search_path = ''
as $$
  select coalesce((select valore #>> '{}' from public.impostazioni where chiave = 'tessera_app_prefisso'), 'APP')
    || lpad(nextval('public.tessere_app_seq')::text,
            coalesce((select (valore #>> '{}')::int from public.impostazioni where chiave = 'tessera_app_cifre'), 6), '0');
$$;

-- Il tipo di un codice arrivato dal gestionale: quelli col prefisso dell'app sono digitali.
create function interno.tipo_da_codice(p_codice text)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_codice like coalesce((select valore #>> '{}' from public.impostazioni where chiave = 'tessera_app_prefisso'), 'APP') || '%'
      then 'digitale'
    else 'fisica'
  end;
$$;

-- Il socio di una tessera, anche bloccata: uno scontrino passato con una
-- tessera poi persa resta di quel socio.
create function interno.socio_da_tessera(p_codice text)
returns uuid
language sql
stable
set search_path = ''
as $$
  select socio_id from public.tessere where codice = interno.pulisci_codice(p_codice);
$$;

create function interno.richiedi_staff()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not (public.is_staff() or session_user <> 'authenticator') then
    raise exception 'Solo lo staff può gestire le tessere.' using errcode = 'insufficient_privilege';
  end if;
end;
$$;

create function interno.richiedi_admin()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not (public.is_admin() or session_user <> 'authenticator') then
    raise exception 'Solo un admin può farlo.' using errcode = 'insufficient_privilege';
  end if;
end;
$$;

-- Una tessera fisica pronta da consegnare: dal magazzino o, se il magazzino non
-- è obbligatorio, creata al volo. Rifiuta codici già consegnati o bloccati.
create function interno.prendi_tessera_fisica(p_codice text)
returns public.tessere
language plpgsql
set search_path = ''
as $$
declare
  v_codice  text := interno.pulisci_codice(p_codice);
  v_formato text := (select valore #>> '{}' from public.impostazioni where chiave = 'tessera_fisica_formato');
  v_solo    boolean := coalesce((select (valore #>> '{}')::boolean from public.impostazioni where chiave = 'tessere_fisiche_solo_magazzino'), false);
  v_tessera public.tessere;
begin
  if v_codice is null then
    raise exception 'Scrivi o scansiona il codice della tessera.';
  end if;

  select * into v_tessera from public.tessere where codice = v_codice for update;
  if found then
    if v_tessera.tipo <> 'fisica' then
      raise exception 'Il codice % è di una tessera digitale, non di una fisica.', v_codice;
    elsif v_tessera.stato = 'bloccata' then
      raise exception 'La tessera % è bloccata (%): usane un''altra.', v_codice, coalesce(v_tessera.motivo_blocco, 'senza motivo');
    elsif v_tessera.stato = 'attiva' then
      raise exception 'La tessera % è già stata consegnata a un socio.', v_codice;
    end if;
    return v_tessera;
  end if;

  if v_solo then
    raise exception 'La tessera % non è nel magazzino: controlla il codice.', v_codice;
  elsif interno.tipo_da_codice(v_codice) = 'digitale' then
    raise exception 'Il codice % ha il prefisso delle tessere digitali.', v_codice;
  elsif coalesce(v_formato, '') <> '' and v_codice !~ v_formato then
    raise exception 'Il codice % non ha il formato delle tessere fisiche: controllalo.', v_codice;
  end if;

  insert into public.tessere (codice, tipo, stato) values (v_codice, 'fisica', 'da_consegnare')
  returning * into v_tessera;
  return v_tessera;
end;
$$;

-- Consegna una tessera fisica presa con prendi_tessera_fisica(). La cassa non
-- la conosce ancora per quel socio: va a ReadyPro col prossimo lotto.
create function interno.consegna_tessera_fisica(p_tessera_id uuid, p_socio_id uuid)
returns public.tessere
language sql
set search_path = ''
as $$
  update public.tessere set
    socio_id = p_socio_id,
    stato = 'attiva',
    stato_cassa = 'in_attivazione',
    attivata_in_cassa_il = null,
    lotto_cassa_id = null,
    consegnata_il = now(),
    consegnata_da = auth.uid()
  where id = p_tessera_id
  returning *;
$$;

-- ---------------------------------------------------------------------------
-- Funzioni dell'app (socio)
-- ---------------------------------------------------------------------------

-- "Ho già la tessera": codice di una tessera attiva (fisica o digitale) + email
-- del login uguale a quella del socio.
create or replace function public.collega_tessera(p_numero_tessera text)
returns public.soci
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(auth.jwt() ->> 'email');
  v_socio public.soci;
begin
  if auth.uid() is null or v_email is null then
    raise exception 'Accedi prima di collegare la tessera.' using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from public.soci where user_id = auth.uid()) then
    raise exception 'Il tuo account è già collegato a una tessera.';
  end if;

  select s.* into v_socio
  from public.tessere t
  join public.soci s on s.id = t.socio_id
  where t.codice = interno.pulisci_codice(p_numero_tessera)
    and t.stato = 'attiva'
    and lower(s.email) = v_email
    and s.stato = 'attivo'
  for update of s;

  -- Stesso messaggio per tessera inesistente ed email diversa: non si rivela
  -- quali numeri tessera esistono.
  if not found then
    raise exception 'Numero tessera ed email non corrispondono. Se in negozio non hai lasciato questa email, chiedi il codice da mostrare alla cassa.';
  end if;
  if v_socio.user_id is not null then
    raise exception 'Questa tessera è già collegata a un altro account. Chiedi in negozio.';
  end if;

  update public.soci set user_id = auth.uid() where id = v_socio.id returning * into v_socio;
  return v_socio;
end;
$$;

-- "Voglio iscrivermi": il socio nasce con la tessera digitale.
create or replace function public.iscriviti(
  p_nome               text,
  p_cognome            text,
  p_accetta_privacy    boolean,
  p_consenso_marketing boolean default false,
  p_telefono           text default null,
  p_codice_invito      text default null,
  p_user_agent         text default null
)
returns public.soci
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email     text := lower(auth.jwt() ->> 'email');
  v_privacy   text := (select valore #>> '{}' from public.impostazioni where chiave = 'versione_privacy');
  v_marketing text := (select valore #>> '{}' from public.impostazioni where chiave = 'versione_marketing');
  v_invitante uuid;
  v_socio     public.soci;
begin
  if auth.uid() is null or v_email is null then
    raise exception 'Accedi prima di iscriverti.' using errcode = 'insufficient_privilege';
  end if;
  if not coalesce(p_accetta_privacy, false) then
    raise exception 'Per iscriversi serve la presa visione dell''informativa privacy.';
  end if;
  if nullif(btrim(p_nome), '') is null or nullif(btrim(p_cognome), '') is null then
    raise exception 'Nome e cognome sono obbligatori.';
  end if;
  if exists (select 1 from public.soci where user_id = auth.uid()) then
    raise exception 'Hai già una tessera.';
  end if;

  if nullif(btrim(p_codice_invito), '') is not null then
    select id into v_invitante
    from public.soci
    where codice_invito = upper(btrim(p_codice_invito)) and stato = 'attivo';
    if v_invitante is null then
      raise exception 'Codice invito non valido.';
    end if;
  end if;

  insert into public.soci (user_id, nome, cognome, email, telefono, origine)
  values (auth.uid(), btrim(p_nome), btrim(p_cognome), v_email, nullif(btrim(p_telefono), ''), 'app')
  returning * into v_socio;

  insert into public.tessere (codice, tipo, socio_id, stato_cassa, consegnata_il)
  values (interno.nuovo_codice_app(), 'digitale', v_socio.id, 'in_attivazione', now());

  insert into public.consensi (socio_id, tipo, concesso, versione_testo, canale, user_agent, registrato_da) values
    (v_socio.id, 'privacy', true, v_privacy, 'app', p_user_agent, auth.uid()),
    (v_socio.id, 'marketing', coalesce(p_consenso_marketing, false), v_marketing, 'app', p_user_agent, auth.uid());

  if v_invitante is not null then
    insert into public.inviti (invitante_id, invitato_id) values (v_invitante, v_socio.id);
  end if;

  return v_socio;
end;
$$;

-- Chi ha solo la tessera fisica e ha collegato l'app può aggiungere la digitale.
create function public.attiva_tessera_digitale()
returns public.tessere
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_socio_id uuid := public.socio_corrente_id();
  v_tessera  public.tessere;
begin
  if v_socio_id is null then
    raise exception 'Nessuna tessera collegata al tuo account.';
  end if;
  perform 1 from public.soci where id = v_socio_id for update;
  if exists (select 1 from public.tessere where socio_id = v_socio_id and tipo = 'digitale' and stato = 'attiva') then
    raise exception 'Hai già la tessera digitale.';
  end if;
  insert into public.tessere (codice, tipo, socio_id, stato_cassa, consegnata_il)
  values (interno.nuovo_codice_app(), 'digitale', v_socio_id, 'in_attivazione', now())
  returning * into v_tessera;
  return v_tessera;
end;
$$;

-- ---------------------------------------------------------------------------
-- Collegare l'app a un socio senza email (es. anziano con la sola tessera
-- fisica): il socio, dopo l'accesso, chiede un codice di 6 caratteri valido 15
-- minuti e lo mostra in negozio; il commesso lo scrive nella scheda del socio.
-- Così nessuno si prende una tessera solo perché ne conosce il numero.
-- ---------------------------------------------------------------------------

create table public.codici_collegamento (
  codice    text primary key,
  user_id   uuid not null unique references auth.users (id) on delete cascade,
  email     text,
  scade_il  timestamptz not null
);

-- Nessuna policy: si usa solo dalle funzioni qui sotto.
alter table public.codici_collegamento enable row level security;

create function public.crea_codice_collegamento()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_codice text;
  v_scade  timestamptz := now() + interval '15 minutes';
begin
  if auth.uid() is null then
    raise exception 'Accedi prima di chiedere il codice.' using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from public.soci where user_id = auth.uid()) then
    raise exception 'Il tuo account è già collegato a una tessera.';
  end if;
  delete from public.codici_collegamento where user_id = auth.uid() or scade_il < now();
  loop
    v_codice := public.genera_codice_invito();
    begin
      insert into public.codici_collegamento (codice, user_id, email, scade_il)
      values (v_codice, auth.uid(), lower(auth.jwt() ->> 'email'), v_scade);
      exit;
    exception when unique_violation then
      -- Codice già usato da un altro in questi 15 minuti: se ne prova un altro.
    end;
  end loop;
  return jsonb_build_object('codice', v_codice, 'scade_il', v_scade);
end;
$$;

-- Il commesso collega l'account che ha mostrato il codice. Se il socio non ha
-- un'email, prende quella del login.
create function public.staff_collega_account(p_socio_id uuid, p_codice text)
returns public.soci
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_richiesta public.codici_collegamento;
  v_socio     public.soci;
begin
  perform interno.richiedi_staff();
  select * into v_richiesta from public.codici_collegamento
  where codice = upper(interno.pulisci_codice(p_codice)) and scade_il > now()
  for update;
  if not found then
    raise exception 'Codice sbagliato o scaduto: fallo rigenerare nell''app.';
  end if;
  if exists (select 1 from public.soci where user_id = v_richiesta.user_id) then
    raise exception 'Questo account è già collegato a un altro socio.';
  end if;

  select * into v_socio from public.soci where id = p_socio_id for update;
  if not found then
    raise exception 'Socio non trovato.';
  elsif v_socio.user_id is not null then
    raise exception 'Questo socio ha già un account dell''app: scollegalo prima.';
  end if;

  update public.soci set
    user_id = v_richiesta.user_id,
    email = coalesce(email, v_richiesta.email)
  where id = p_socio_id
  returning * into v_socio;
  delete from public.codici_collegamento where codice = v_richiesta.codice;
  return v_socio;
end;
$$;

-- ---------------------------------------------------------------------------
-- Funzioni dello staff: magazzino, consegna, blocco, unione di due soci
-- ---------------------------------------------------------------------------

-- Carica nel magazzino i codici stampati. Restituisce quanti sono entrati,
-- quanti c'erano già e quali sono stati rifiutati.
create function public.staff_carica_tessere_fisiche(p_codici text[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_formato   text := (select valore #>> '{}' from public.impostazioni where chiave = 'tessera_fisica_formato');
  v_codice    text;
  v_caricate  int := 0;
  v_presenti  int := 0;
  v_rifiutati text[] := '{}';
begin
  perform interno.richiedi_admin();
  foreach v_codice in array coalesce(p_codici, '{}') loop
    v_codice := interno.pulisci_codice(v_codice);
    continue when v_codice is null;
    if interno.tipo_da_codice(v_codice) = 'digitale'
       or (coalesce(v_formato, '') <> '' and v_codice !~ v_formato) then
      v_rifiutati := v_rifiutati || v_codice;
      continue;
    end if;
    insert into public.tessere (codice, tipo, stato) values (v_codice, 'fisica', 'da_consegnare')
    on conflict (codice) do nothing;
    if found then v_caricate := v_caricate + 1; else v_presenti := v_presenti + 1; end if;
  end loop;
  return jsonb_build_object('caricate', v_caricate, 'gia_presenti', v_presenti, 'rifiutati', to_jsonb(v_rifiutati));
end;
$$;

-- Toglie dal magazzino un codice mai consegnato (caricato per errore).
create function public.staff_togli_dal_magazzino(p_codice text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform interno.richiedi_admin();
  delete from public.tessere where codice = interno.pulisci_codice(p_codice) and stato = 'da_consegnare';
  if not found then
    raise exception 'La tessera % non è nel magazzino (o è già stata consegnata).', p_codice;
  end if;
end;
$$;

-- Cliente nuovo, in negozio, con la tessera fisica e senza app. La privacy è
-- il modulo firmato su carta: il commesso conferma di averlo raccolto.
create function public.staff_nuovo_socio_fisica(
  p_codice             text,
  p_nome               text,
  p_cognome            text,
  p_privacy_firmata    boolean,
  p_consenso_marketing boolean default false,
  p_telefono           text default null,
  p_email              text default null,
  p_data_nascita       date default null,
  p_negozio_id         uuid default null
)
returns public.soci
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_privacy   text := (select valore #>> '{}' from public.impostazioni where chiave = 'versione_privacy');
  v_marketing text := (select valore #>> '{}' from public.impostazioni where chiave = 'versione_marketing');
  v_tessera   public.tessere;
  v_socio     public.soci;
begin
  perform interno.richiedi_staff();
  if not coalesce(p_privacy_firmata, false) then
    raise exception 'Serve il modulo privacy firmato dal cliente.';
  end if;
  if nullif(btrim(p_nome), '') is null or nullif(btrim(p_cognome), '') is null then
    raise exception 'Nome e cognome sono obbligatori.';
  end if;
  v_tessera := interno.prendi_tessera_fisica(p_codice);

  insert into public.soci (nome, cognome, email, telefono, data_nascita, negozio_preferito_id, origine)
  values (btrim(p_nome), btrim(p_cognome), lower(nullif(btrim(p_email), '')), nullif(btrim(p_telefono), ''),
          p_data_nascita, coalesce(p_negozio_id, public.staff_negozio_id()), 'negozio')
  returning * into v_socio;

  perform interno.consegna_tessera_fisica(v_tessera.id, v_socio.id);

  insert into public.consensi (socio_id, tipo, concesso, versione_testo, canale, registrato_da) values
    (v_socio.id, 'privacy', true, v_privacy, 'negozio', auth.uid()),
    (v_socio.id, 'marketing', coalesce(p_consenso_marketing, false), v_marketing, 'negozio', auth.uid());

  return v_socio;
end;
$$;

-- Dà la tessera fisica a un socio che esiste già (es. ha solo l'app). Se ne ha
-- già una attiva serve il motivo (persa, rovinata): quella vecchia si blocca.
create function public.staff_assegna_tessera_fisica(p_socio_id uuid, p_codice text, p_motivo_sostituzione text default null)
returns public.tessere
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vecchia public.tessere;
  v_tessera public.tessere;
begin
  perform interno.richiedi_staff();
  perform 1 from public.soci where id = p_socio_id and stato = 'attivo' for update;
  if not found then
    raise exception 'Socio non trovato o non attivo.';
  end if;
  v_tessera := interno.prendi_tessera_fisica(p_codice);

  select * into v_vecchia from public.tessere
  where socio_id = p_socio_id and tipo = 'fisica' and stato = 'attiva' for update;
  if found then
    if nullif(btrim(p_motivo_sostituzione), '') is null then
      raise exception 'Il socio ha già la tessera fisica %: indica perché la sostituisci.', v_vecchia.codice;
    end if;
    update public.tessere set stato = 'bloccata', bloccata_il = now(), motivo_blocco = btrim(p_motivo_sostituzione)
    where id = v_vecchia.id;
  end if;

  return interno.consegna_tessera_fisica(v_tessera.id, p_socio_id);
end;
$$;

-- Tessera persa o rubata: smette di valere in app. In cassa va bloccata anche
-- in ReadyPro. Una tessera bloccata non torna attiva: se ne consegna un'altra.
create function public.staff_blocca_tessera(p_tessera_id uuid, p_motivo text)
returns public.tessere
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tessera public.tessere;
begin
  perform interno.richiedi_staff();
  if nullif(btrim(p_motivo), '') is null then
    raise exception 'Indica perché blocchi la tessera.';
  end if;
  update public.tessere set stato = 'bloccata', bloccata_il = now(), motivo_blocco = btrim(p_motivo)
  where id = p_tessera_id and stato = 'attiva'
  returning * into v_tessera;
  if not found then
    raise exception 'Tessera non trovata o non attiva.';
  end if;
  return v_tessera;
end;
$$;

-- Due schede per la stessa persona (es. tessera fisica fatta in negozio e
-- iscrizione da casa): tessere, punti, consensi e inviti passano a p_tieni,
-- i dati mancanti si completano con quelli di p_togli, poi p_togli sparisce.
-- È l'unico caso in cui movimenti e consensi cambiano socio: le righe restano
-- identiche, cambia solo a chi appartengono.
create function public.admin_unisci_soci(p_tieni uuid, p_togli uuid)
returns public.soci
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tieni public.soci;
  v_togli public.soci;
begin
  perform interno.richiedi_admin();
  if p_tieni = p_togli then
    raise exception 'È lo stesso socio.';
  end if;
  -- Sempre nello stesso ordine, per non bloccarsi con un'unione al contrario.
  perform 1 from public.soci where id in (p_tieni, p_togli) order by id for update;
  select * into v_tieni from public.soci where id = p_tieni;
  select * into v_togli from public.soci where id = p_togli;
  if v_tieni.id is null or v_togli.id is null then
    raise exception 'Socio non trovato.';
  end if;
  if v_tieni.user_id is not null and v_togli.user_id is not null then
    raise exception 'Tutti e due hanno un account dell''app: scollega prima quello che non serve.';
  end if;
  if exists (
    select 1 from public.tessere a join public.tessere b on a.tipo = b.tipo
    where a.socio_id = p_tieni and b.socio_id = p_togli and a.stato = 'attiva' and b.stato = 'attiva'
  ) then
    raise exception 'Tutti e due hanno una tessera dello stesso tipo attiva: blocca prima quella da non tenere.';
  end if;

  update public.tessere set socio_id = p_tieni where socio_id = p_togli;

  -- Un solo saldo iniziale per socio: quello in più diventa una rettifica.
  if exists (select 1 from public.movimenti_punti where socio_id = p_tieni and tipo = 'saldo_iniziale') then
    update public.movimenti_punti
    set tipo = 'rettifica', descrizione = concat_ws(' ', descrizione, '(saldo iniziale di una scheda unita)')
    where socio_id = p_togli and tipo = 'saldo_iniziale';
  end if;
  update public.movimenti_punti set socio_id = p_tieni where socio_id = p_togli;
  update public.consensi set socio_id = p_tieni where socio_id = p_togli;
  update public.notifiche_dispositivi set socio_id = p_tieni where socio_id = p_togli;
  update public.import_righe set socio_id = p_tieni where socio_id = p_togli;

  delete from public.inviti
  where (invitante_id = p_togli and invitato_id = p_tieni) or (invitante_id = p_tieni and invitato_id = p_togli);
  if exists (select 1 from public.inviti where invitato_id = p_tieni) then
    delete from public.inviti where invitato_id = p_togli;
  else
    update public.inviti set invitato_id = p_tieni where invitato_id = p_togli;
  end if;
  update public.inviti set invitante_id = p_tieni where invitante_id = p_togli;

  delete from public.soci where id = p_togli;

  update public.soci set
    user_id              = coalesce(user_id, v_togli.user_id),
    nome                 = coalesce(nome, v_togli.nome),
    cognome              = coalesce(cognome, v_togli.cognome),
    email                = coalesce(email, v_togli.email),
    telefono             = coalesce(telefono, v_togli.telefono),
    data_nascita         = coalesce(data_nascita, v_togli.data_nascita),
    cap                  = coalesce(cap, v_togli.cap),
    citta                = coalesce(citta, v_togli.citta),
    negozio_preferito_id = coalesce(negozio_preferito_id, v_togli.negozio_preferito_id),
    iscritto_il          = least(iscritto_il, v_togli.iscritto_il),
    dati_gestionale      = v_togli.dati_gestionale || dati_gestionale
  where id = p_tieni
  returning * into v_tieni;
  return v_tieni;
end;
$$;

-- ---------------------------------------------------------------------------
-- Import dal gestionale: il socio si riconosce da qualunque sua tessera
-- ---------------------------------------------------------------------------

-- Lega al socio il codice letto in un import: la cassa lo conosce, quindi la
-- tessera è attiva in cassa. Restituisce un avviso, o null.
create function interno.import_aggancia_tessera(p_socio_id uuid, p_codice text, p_batch_id uuid)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_tessera public.tessere;
  v_tipo    text;
  v_avviso  text;
begin
  select * into v_tessera from public.tessere where codice = p_codice for update;

  if found and v_tessera.socio_id is distinct from p_socio_id and v_tessera.socio_id is not null then
    return format('La tessera %s è di un altro socio: non spostata.', p_codice);
  end if;

  if found and v_tessera.socio_id = p_socio_id then
    update public.tessere set
      stato_cassa = 'attiva',
      attivata_in_cassa_il = coalesce(attivata_in_cassa_il, now()),
      ultimo_import_id = p_batch_id
    where id = v_tessera.id;
    return null;
  end if;

  -- Codice nuovo o ancora nel magazzino: il gestionale dice che è di questo
  -- socio. Se ne aveva un'altra dello stesso tipo, è stata sostituita in cassa.
  v_tipo := coalesce(v_tessera.tipo, interno.tipo_da_codice(p_codice));
  update public.tessere set stato = 'bloccata', bloccata_il = now(), motivo_blocco = 'Sostituita nel gestionale da ' || p_codice
  where socio_id = p_socio_id and tipo = v_tipo and stato = 'attiva'
  returning format('Tessera %s sostituita da %s.', codice, p_codice) into v_avviso;

  if v_tessera.id is null then
    insert into public.tessere (codice, tipo, socio_id, stato, attivata_in_cassa_il, ultimo_import_id, consegnata_il)
    values (p_codice, v_tipo, p_socio_id, 'attiva', now(), p_batch_id, now());
  else
    update public.tessere set
      socio_id = p_socio_id, stato = 'attiva', stato_cassa = 'attiva',
      attivata_in_cassa_il = now(), ultimo_import_id = p_batch_id, consegnata_il = now()
    where id = v_tessera.id;
  end if;
  return v_avviso;
end;
$$;

-- Campi mappabili: come prima, più altra_tessera (un secondo codice dello
-- stesso cliente, se ReadyPro ne esporta uno). Il socio si cerca prima per
-- numero_tessera, poi per altra_tessera; se nessuna delle due esiste è nuovo.
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

      -- Il gestionale è la fonte dei dati anagrafici: un valore presente nel file
      -- sovrascrive quello salvato, una cella vuota non cancella nulla.
      if v_nuovo then
        insert into public.soci (
          nome, cognome, email, telefono, data_nascita, cap, citta,
          livello, negozio_preferito_id, iscritto_il, origine, dati_gestionale, ultimo_import_id
        ) values (
          interno.import_testo(r.dati, v_mappa, 'nome'),
          interno.import_testo(r.dati, v_mappa, 'cognome'),
          lower(interno.import_testo(r.dati, v_mappa, 'email')),
          interno.import_testo(r.dati, v_mappa, 'telefono'),
          interno.import_data(interno.import_testo(r.dati, v_mappa, 'data_nascita')),
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
        update public.soci s set
          nome                 = coalesce(interno.import_testo(r.dati, v_mappa, 'nome'), s.nome),
          cognome              = coalesce(interno.import_testo(r.dati, v_mappa, 'cognome'), s.cognome),
          email                = coalesce(lower(interno.import_testo(r.dati, v_mappa, 'email')), s.email),
          telefono             = coalesce(interno.import_testo(r.dati, v_mappa, 'telefono'), s.telefono),
          data_nascita         = coalesce(interno.import_data(interno.import_testo(r.dati, v_mappa, 'data_nascita')), s.data_nascita),
          cap                  = coalesce(interno.import_testo(r.dati, v_mappa, 'cap'), s.cap),
          citta                = coalesce(interno.import_testo(r.dati, v_mappa, 'citta'), s.citta),
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
      if v_altra is not null then
        v_avviso := interno.import_aggancia_tessera(v_socio_id, v_altra, p_batch_id);
        if v_avviso is not null then
          v_avvisi := v_avvisi || v_avviso;
        end if;
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

-- Uguale a prima, ma il socio si trova da qualunque sua tessera.
create or replace function public.importa_movimenti_punti(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch       public.import_batch := interno.apri_batch(p_batch_id, 'movimenti_punti');
  v_mappa       jsonb := v_batch.mappatura_colonne;
  r             public.import_righe;
  v_tessera     text;
  v_socio_id    uuid;
  v_punti       integer;
  v_tipo        text;
  v_negozio     text;
  v_negozio_id  uuid;
  v_riferimento text;
  v_avviso      text;
  v_id          uuid;
begin
  for r in
    select * from public.import_righe
    where batch_id = p_batch_id and stato = 'in_attesa'
    order by numero_riga
  loop
    begin
      v_avviso := null;
      v_tessera := interno.import_tessera(r.dati, v_mappa);
      v_socio_id := interno.socio_da_tessera(v_tessera);
      if v_socio_id is null then
        raise exception 'Tessera % non trovata: importa prima i soci.', v_tessera;
      end if;

      v_punti := round(interno.import_numero(interno.import_testo(r.dati, v_mappa, 'punti')));
      if coalesce(v_punti, 0) = 0 then
        raise exception 'Punti mancanti o a zero.';
      end if;

      v_tipo := coalesce(lower(interno.import_testo(r.dati, v_mappa, 'tipo')), 'acquisto');
      if v_tipo not in ('acquisto', 'bonus', 'rettifica', 'storno', 'riscatto', 'scadenza') then
        raise exception 'Tipo di movimento "%" non previsto.', v_tipo;
      end if;

      v_negozio := interno.import_testo(r.dati, v_mappa, 'negozio');
      v_negozio_id := (select id from public.negozi where codice_gestionale = v_negozio);
      if v_negozio is not null and v_negozio_id is null then
        v_avviso := format('Negozio "%s" non trovato.', v_negozio);
      end if;

      v_riferimento := interno.import_testo(r.dati, v_mappa, 'riferimento');
      if v_riferimento is null then
        v_avviso := concat_ws(' ', v_avviso, 'Senza riferimento: reimportando il file questo movimento verrebbe duplicato.');
      end if;

      insert into public.movimenti_punti (
        socio_id, punti, tipo, descrizione, negozio_id, importo_spesa,
        fonte, riferimento_esterno, import_batch_id, data_movimento, creato_da
      ) values (
        v_socio_id, v_punti, v_tipo,
        interno.import_testo(r.dati, v_mappa, 'descrizione'),
        v_negozio_id,
        interno.import_numero(interno.import_testo(r.dati, v_mappa, 'importo')),
        'gestionale', v_riferimento, p_batch_id,
        coalesce(interno.import_data(interno.import_testo(r.dati, v_mappa, 'data'))::timestamptz, now()),
        auth.uid()
      )
      on conflict (fonte, riferimento_esterno) do nothing
      returning id into v_id;

      update public.import_righe set
        stato = case when v_id is null then 'saltata' else 'importata' end,
        socio_id = v_socio_id,
        errore = null,
        avviso = case when v_id is null then 'Movimento già importato.' else v_avviso end
      where id = r.id;
    exception when others then
      update public.import_righe set stato = 'errore', errore = sqlerrm where id = r.id;
    end;
  end loop;

  return interno.chiudi_batch(p_batch_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- app -> ReadyPro: si mandano le tessere, non i soci. Una riga per tessera in
-- attivazione (digitale nata in app o fisica consegnata dal pannello), con
-- altra_tessera = l'altro codice attivo dello stesso socio, se c'è: è lo stesso
-- cliente e in ReadyPro va abbinato a quello, non creato doppio.
-- ---------------------------------------------------------------------------

create or replace function public.gestionale_nuovi_iscritti(p_chiave text)
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
  perform 1 from public.tessere t
  join public.soci s on s.id = t.socio_id
  where t.stato_cassa = 'in_attivazione' and t.stato = 'attiva' and s.stato = 'attivo'
    and (t.lotto_cassa_id is null
         or exists (select 1 from public.gestionale_lotti l where l.id = t.lotto_cassa_id and l.confermato_il is null))
  for update of t;
  if not found then
    return jsonb_build_object('lotto', null, 'righe', '[]'::jsonb);
  end if;

  insert into public.gestionale_lotti (chiave_id, righe) values (v_chiave_id, 0) returning id into v_lotto_id;

  update public.tessere t set lotto_cassa_id = v_lotto_id
  from public.soci s
  where s.id = t.socio_id
    and t.stato_cassa = 'in_attivazione' and t.stato = 'attiva' and s.stato = 'attivo'
    and (t.lotto_cassa_id is null
         or exists (select 1 from public.gestionale_lotti l where l.id = t.lotto_cassa_id and l.confermato_il is null));

  select coalesce(jsonb_agg(jsonb_build_object(
      'numero_tessera', t.codice,
      'tipo_tessera', t.tipo,
      'altra_tessera', a.codice,
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
    ) order by t.creato_il), '[]'::jsonb)
  into v_righe
  from public.tessere t
  join public.soci s on s.id = t.socio_id
  left join public.tessere a on a.socio_id = t.socio_id and a.id <> t.id and a.stato = 'attiva'
  left join public.negozi n on n.id = s.negozio_preferito_id
  left join public.consensi_attuali cp on cp.socio_id = s.id and cp.tipo = 'privacy'
  left join public.consensi_attuali cm on cm.socio_id = s.id and cm.tipo = 'marketing'
  where t.lotto_cassa_id = v_lotto_id;

  update public.gestionale_lotti set righe = jsonb_array_length(v_righe) where id = v_lotto_id;
  return jsonb_build_object('lotto', v_lotto_id, 'righe', v_righe);
end;
$$;

-- Per il pannello admin: tessere date dall'app che la cassa non conosce ancora.
create view public.tessere_in_attesa_cassa
with (security_invoker = true)
as
select
  t.id, t.codice, t.tipo, t.socio_id, s.nome, s.cognome, s.email,
  coalesce(t.consegnata_il, t.creato_il) as creata_il,
  round(extract(epoch from now() - coalesce(t.consegnata_il, t.creato_il)) / 3600, 1) as ore_di_attesa,
  l.creato_il     as inviata_il,
  l.confermato_il as ritirata_il
from public.tessere t
join public.soci s on s.id = t.socio_id
left join public.gestionale_lotti l on l.id = t.lotto_cassa_id
where t.stato_cassa = 'in_attivazione' and t.stato = 'attiva' and s.stato = 'attivo'
order by coalesce(t.consegnata_il, t.creato_il);

-- Per l'elenco soci del pannello: le tessere attive in una colonna sola, per
-- cercare un socio da qualunque suo codice.
create view public.soci_con_tessere
with (security_invoker = true)
as
select
  s.id, s.nome, s.cognome, s.email, s.telefono, s.livello, s.stato, s.origine, s.user_id, s.iscritto_il,
  t.fisica, t.digitale,
  concat_ws(' ', t.fisica, t.digitale) as codici,
  coalesce(t.in_attivazione, false) as in_attivazione
from public.soci s
left join lateral (
  select
    max(codice) filter (where tipo = 'fisica') as fisica,
    max(codice) filter (where tipo = 'digitale') as digitale,
    bool_or(stato_cassa = 'in_attivazione') as in_attivazione
  from public.tessere where socio_id = s.id and stato = 'attiva'
) t on true;

-- ---------------------------------------------------------------------------
-- RLS e permessi
-- ---------------------------------------------------------------------------

alter table public.tessere enable row level security;

create policy "tessere: il socio vede le proprie" on public.tessere
  for select to authenticated using (socio_id is not null and socio_id = public.socio_corrente_id());
create policy "tessere: lo staff vede tutte" on public.tessere
  for select to authenticated using (public.is_staff());

-- Si scrive solo con le funzioni qui sopra.
grant select on public.tessere, public.tessere_in_attesa_cassa, public.soci_con_tessere to authenticated;

revoke execute on all functions in schema interno from public;
revoke execute on function
  public.attiva_tessera_digitale(),
  public.crea_codice_collegamento(),
  public.staff_collega_account(uuid, text),
  public.staff_carica_tessere_fisiche(text[]),
  public.staff_togli_dal_magazzino(text),
  public.staff_nuovo_socio_fisica(text, text, text, boolean, boolean, text, text, date, uuid),
  public.staff_assegna_tessera_fisica(uuid, text, text),
  public.staff_blocca_tessera(uuid, text),
  public.admin_unisci_soci(uuid, uuid)
from public, anon;
grant execute on function
  public.attiva_tessera_digitale(),
  public.crea_codice_collegamento(),
  public.staff_collega_account(uuid, text),
  public.staff_carica_tessere_fisiche(text[]),
  public.staff_togli_dal_magazzino(text),
  public.staff_nuovo_socio_fisica(text, text, text, boolean, boolean, text, text, date, uuid),
  public.staff_assegna_tessera_fisica(uuid, text, text),
  public.staff_blocca_tessera(uuid, text),
  public.admin_unisci_soci(uuid, uuid)
to authenticated;
