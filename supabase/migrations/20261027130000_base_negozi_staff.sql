-- Base: funzioni di servizio, impostazioni, negozi e ruoli dello staff.
--
-- Convenzioni di tutto lo schema:
-- - nomi in italiano, come nel resto dell'app;
-- - ogni tabella ha RLS attivo: senza una policy esplicita nessuno legge o scrive
--   (tranne la service role, che resta solo lato server);
-- - le funzioni "security definer" fissano search_path = '' e usano nomi completi.

-- ---------------------------------------------------------------------------
-- Funzioni di servizio
-- ---------------------------------------------------------------------------

create function public.imposta_aggiornato_il()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.aggiornato_il := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Impostazioni del club
-- Valori che cambiano senza toccare il codice (prefisso tessere create dall'app,
-- versioni dei testi legali, punti per gli inviti, ...).
-- ---------------------------------------------------------------------------

create table public.impostazioni (
  chiave        text primary key,
  valore        jsonb not null,
  descrizione   text,
  aggiornato_il timestamptz not null default now()
);

create trigger impostazioni_aggiornato_il
  before update on public.impostazioni
  for each row execute function public.imposta_aggiornato_il();

insert into public.impostazioni (chiave, valore, descrizione) values
  ('tessera_app_prefisso', '"APP"', 'Prefisso dei numeri tessera creati dall''app, per non scontrarsi con quelli del gestionale'),
  ('tessera_app_cifre', '6', 'Cifre del numero progressivo delle tessere create dall''app (APP000001)'),
  ('versione_privacy', '"2026-10"', 'Versione dell''informativa privacy mostrata in app'),
  ('versione_marketing', '"2026-10"', 'Versione del testo del consenso marketing mostrato in app'),
  ('versione_consensi_import', '"gestionale"', 'Versione registrata per i consensi arrivati dall''import del gestionale'),
  ('punti_invito_invitante', '0', 'Punti a chi invita, quando l''invito è premiato (regola da decidere)'),
  ('punti_invito_invitato', '0', 'Punti a chi è stato invitato, quando l''invito è premiato (regola da decidere)');

-- ---------------------------------------------------------------------------
-- Negozi
-- ---------------------------------------------------------------------------

create table public.negozi (
  id                uuid primary key default gen_random_uuid(),
  -- Codice del negozio nel gestionale: serve ad abbinare scontrini e import.
  codice_gestionale text unique,
  nome              text not null,
  indirizzo         text,
  cap               text,
  citta             text,
  provincia         text,
  telefono          text,
  email             text,
  -- Orari strutturati, es. {"lun": ["09:30-13:00", "15:30-19:30"], "dom": []}
  orari             jsonb,
  -- Orari come testo libero da mostrare così com'è ("Lun–Sab 9:30–19:30").
  orari_testo       text,
  latitudine        numeric(9, 6),
  longitudine       numeric(9, 6),
  -- Percorso dell'immagine nel bucket pubblico "negozi".
  immagine_path     text,
  attivo            boolean not null default true,
  ordine            integer not null default 0,
  creato_il         timestamptz not null default now(),
  aggiornato_il     timestamptz not null default now()
);

create trigger negozi_aggiornato_il
  before update on public.negozi
  for each row execute function public.imposta_aggiornato_il();

-- ---------------------------------------------------------------------------
-- Staff e ruoli
-- admin:     gestisce tutto (offerte, negozi, soci, import, staff).
-- operatore: personale di cassa; vede i soci e registra punti nel suo negozio.
-- Il primo admin si crea a mano dal SQL editor (vedi docs/database.md).
-- ---------------------------------------------------------------------------

create table public.staff (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  ruolo      text not null check (ruolo in ('admin', 'operatore')),
  -- Negozio dell'operatore. Vuoto = tutti i negozi.
  negozio_id uuid references public.negozi (id) on delete set null,
  nome       text,
  creato_il  timestamptz not null default now()
);

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.staff where user_id = auth.uid() and ruolo = 'admin'
  );
$$;

create function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.staff where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.impostazioni enable row level security;
alter table public.negozi enable row level security;
alter table public.staff enable row level security;

create policy "impostazioni: lettura staff" on public.impostazioni
  for select to authenticated using (public.is_staff());
create policy "impostazioni: gestione admin" on public.impostazioni
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "negozi: lettura dei negozi attivi" on public.negozi
  for select to anon, authenticated using (attivo or public.is_staff());
create policy "negozi: gestione admin" on public.negozi
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "staff: ognuno vede la propria riga" on public.staff
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "staff: gestione admin" on public.staff
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select on public.negozi to anon;
grant select, insert, update, delete on public.impostazioni, public.negozi, public.staff to authenticated;
