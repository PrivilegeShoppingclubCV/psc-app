-- Soci e tessere, livelli, premi del catalogo punti, offerte.

-- ---------------------------------------------------------------------------
-- Livelli (Classic, Gold, ...)
-- Come si passa di livello non è ancora deciso: per ora il livello è un campo
-- del socio, impostato dall'import o da un admin.
-- ---------------------------------------------------------------------------

create table public.livelli (
  codice       text primary key,
  nome         text not null,
  -- Punti indicativi per raggiungere il livello (facoltativo).
  soglia_punti integer,
  ordine       integer not null default 0,
  vantaggi     text
);

insert into public.livelli (codice, nome, ordine) values
  ('classic', 'Classic', 0),
  ('gold', 'Gold', 10);

-- ---------------------------------------------------------------------------
-- Soci
-- Il numero tessera è la chiave che arriva dal gestionale: è testo (gli zeri
-- iniziali contano), è unico e non si cambia mai dopo la creazione.
-- Le tessere create dall'app ricevono un numero con prefisso (APP000001).
-- ---------------------------------------------------------------------------

create sequence public.tessere_app_seq;

-- Codice invito leggibile: 6 caratteri senza lettere ambigue (niente 0/O, 1/I/L).
create function public.genera_codice_invito()
returns text
language sql
volatile
set search_path = ''
as $$
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1), '')
  from generate_series(1, 6);
$$;

create table public.soci (
  id                   uuid primary key default gen_random_uuid(),
  numero_tessera       text not null unique
                         check (numero_tessera <> '' and numero_tessera = btrim(numero_tessera)),
  -- Account dell'app. Vuoto finché il socio importato non collega la tessera.
  user_id              uuid unique references auth.users (id) on delete set null,
  nome                 text,
  cognome              text,
  -- Non unica: in negozio capita che più tessere abbiano la stessa email.
  email                text,
  telefono             text,
  data_nascita         date,
  cap                  text,
  citta                text,
  livello              text not null default 'classic' references public.livelli (codice) on update cascade,
  stato                text not null default 'attivo' check (stato in ('attivo', 'sospeso', 'cessato')),
  origine              text not null check (origine in ('import', 'app', 'negozio')),
  negozio_preferito_id uuid references public.negozi (id) on delete set null,
  codice_invito        text not null unique default public.genera_codice_invito(),
  iscritto_il          date not null default current_date,
  -- Colonne del gestionale non ancora mappate: si conservano qui per non perderle.
  dati_gestionale      jsonb not null default '{}',
  ultimo_import_id     uuid,
  creato_il            timestamptz not null default now(),
  aggiornato_il        timestamptz not null default now()
);

create index soci_email_idx on public.soci (lower(email));
create index soci_cognome_nome_idx on public.soci (lower(cognome), lower(nome));

create trigger soci_aggiornato_il
  before update on public.soci
  for each row execute function public.imposta_aggiornato_il();

-- Il numero tessera non si rigenera mai. Per correggere un errore di battitura
-- serve un gesto esplicito dal SQL editor:
--   set local psc.consenti_modifica_tessera = 'on'; update public.soci ...
create function public.blocca_modifica_tessera()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.numero_tessera is distinct from old.numero_tessera
     and coalesce(current_setting('psc.consenti_modifica_tessera', true), '') <> 'on' then
    raise exception 'Il numero tessera non si può modificare (%).', old.numero_tessera
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger soci_blocca_modifica_tessera
  before update of numero_tessera on public.soci
  for each row execute function public.blocca_modifica_tessera();

-- Il socio collegato all'utente che sta usando l'app (null se non c'è o non è attivo).
create function public.socio_corrente_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.soci where user_id = auth.uid() and stato = 'attivo';
$$;

create function public.livello_corrente_ordine()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select l.ordine
  from public.soci s
  join public.livelli l on l.codice = s.livello
  where s.user_id = auth.uid() and s.stato = 'attivo';
$$;

-- ---------------------------------------------------------------------------
-- Premi del catalogo punti (buoni sconto, omaggi)
-- ---------------------------------------------------------------------------

create table public.premi (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  descrizione   text,
  soglia_punti  integer not null check (soglia_punti > 0),
  valore_euro   numeric(10, 2),
  -- Percorso dell'immagine nel bucket pubblico "premi".
  immagine_path text,
  attivo        boolean not null default true,
  ordine        integer not null default 0,
  creato_il     timestamptz not null default now(),
  aggiornato_il timestamptz not null default now()
);

create trigger premi_aggiornato_il
  before update on public.premi
  for each row execute function public.imposta_aggiornato_il();

-- ---------------------------------------------------------------------------
-- Offerte
-- ---------------------------------------------------------------------------

create table public.offerte (
  id              uuid primary key default gen_random_uuid(),
  titolo          text not null,
  marca           text,
  descrizione     text,
  prezzo_soci     numeric(10, 2),
  prezzo_listino  numeric(10, 2),
  -- Per le offerte senza prezzo: "-30%", "2x1", "Omaggio con la spesa".
  etichetta       text,
  -- Percorso dell'immagine nel bucket pubblico "offerte".
  immagine_path   text,
  valida_dal      timestamptz not null default now(),
  valida_al       timestamptz,
  -- true = visibile solo ai soci con l'app; false = anche a chi non ha fatto l'accesso.
  solo_tesserati  boolean not null default true,
  -- Livello minimo per vederla (vuoto = tutti i livelli).
  livello_minimo  text references public.livelli (codice) on update cascade,
  pubblicata      boolean not null default false,
  in_evidenza     boolean not null default false,
  ordine          integer not null default 0,
  creato_da       uuid references auth.users (id) on delete set null,
  creato_il       timestamptz not null default now(),
  aggiornato_il   timestamptz not null default now(),
  check (valida_al is null or valida_al > valida_dal)
);

create index offerte_pubblicate_idx on public.offerte (valida_dal, valida_al) where pubblicata;

create trigger offerte_aggiornato_il
  before update on public.offerte
  for each row execute function public.imposta_aggiornato_il();

-- In quali negozi vale l'offerta. Nessuna riga = in tutti i negozi.
create table public.offerte_negozi (
  offerta_id uuid not null references public.offerte (id) on delete cascade,
  negozio_id uuid not null references public.negozi (id) on delete cascade,
  primary key (offerta_id, negozio_id)
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.livelli enable row level security;
alter table public.soci enable row level security;
alter table public.premi enable row level security;
alter table public.offerte enable row level security;
alter table public.offerte_negozi enable row level security;

create policy "livelli: lettura per tutti" on public.livelli
  for select to anon, authenticated using (true);
create policy "livelli: gestione admin" on public.livelli
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Il socio legge solo la propria scheda e la modifica con aggiorna_profilo().
-- Lo staff le legge tutte (ricerca in cassa); solo l'admin le modifica.
create policy "soci: il socio vede la propria scheda" on public.soci
  for select to authenticated using (user_id = auth.uid());
create policy "soci: lo staff vede tutti" on public.soci
  for select to authenticated using (public.is_staff());
create policy "soci: gestione admin" on public.soci
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "premi: lettura dei premi attivi" on public.premi
  for select to anon, authenticated using (attivo or public.is_staff());
create policy "premi: gestione admin" on public.premi
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "offerte: lettura delle offerte in corso" on public.offerte
  for select to anon, authenticated
  using (
    public.is_staff()
    or (
      pubblicata
      and valida_dal <= now()
      and (valida_al is null or valida_al > now())
      and (not solo_tesserati or public.socio_corrente_id() is not null)
      and (
        livello_minimo is null
        or coalesce(public.livello_corrente_ordine(), -1)
           >= (select l.ordine from public.livelli l where l.codice = livello_minimo)
      )
    )
  );
create policy "offerte: gestione admin" on public.offerte
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Righe visibili solo se l'offerta stessa è visibile (la policy di offerte si applica alla subquery).
create policy "offerte_negozi: lettura" on public.offerte_negozi
  for select to anon, authenticated
  using (exists (select 1 from public.offerte o where o.id = offerta_id));
create policy "offerte_negozi: gestione admin" on public.offerte_negozi
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select on public.livelli, public.premi, public.offerte, public.offerte_negozi to anon;
grant select, insert, update, delete
  on public.livelli, public.soci, public.premi, public.offerte, public.offerte_negozi
  to authenticated;
