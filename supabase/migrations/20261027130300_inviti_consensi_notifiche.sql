-- Inviti (referral), consensi GDPR e iscrizioni alle notifiche push.

-- ---------------------------------------------------------------------------
-- Inviti
-- Si registra chi ha invitato chi al momento dell'iscrizione. Quando un invito
-- diventa "qualificato" (es. prima spesa) e quanti punti vale è ancora da
-- decidere: i punti si assegnano con movimenti di tipo 'invito'.
-- ---------------------------------------------------------------------------

create table public.inviti (
  id             uuid primary key default gen_random_uuid(),
  invitante_id   uuid not null references public.soci (id) on delete cascade,
  -- Ogni socio può essere stato invitato una volta sola.
  invitato_id    uuid not null unique references public.soci (id) on delete cascade,
  stato          text not null default 'registrato'
                   check (stato in ('registrato', 'qualificato', 'premiato', 'annullato')),
  qualificato_il timestamptz,
  premiato_il    timestamptz,
  creato_il      timestamptz not null default now(),
  check (invitante_id <> invitato_id)
);

create index inviti_invitante_idx on public.inviti (invitante_id);

-- ---------------------------------------------------------------------------
-- Consensi GDPR
-- Registro in sola aggiunta: ogni scelta del socio è una riga nuova, con la
-- versione del testo che ha visto. Lo stato attuale è l'ultima riga per tipo.
-- Il consenso marketing è separato e facoltativo: senza, il socio usa
-- comunque tessera e punti ma non riceve offerte via email o notifica.
-- ---------------------------------------------------------------------------

create table public.consensi (
  id             bigint generated always as identity primary key,
  socio_id       uuid not null references public.soci (id) on delete cascade,
  tipo           text not null check (tipo in (
                   'privacy',      -- presa visione dell'informativa
                   'regolamento',  -- accettazione del regolamento del club
                   'marketing',    -- offerte e comunicazioni commerciali
                   'profilazione'  -- offerte personalizzate sulle abitudini di acquisto
                 )),
  concesso       boolean not null,
  versione_testo text not null,
  canale         text not null check (canale in ('app', 'negozio', 'import', 'admin')),
  user_agent     text,
  registrato_il  timestamptz not null default now(),
  registrato_da  uuid references auth.users (id) on delete set null
);

create index consensi_socio_tipo_idx on public.consensi (socio_id, tipo, registrato_il desc);

create view public.consensi_attuali
with (security_invoker = true)
as
select distinct on (socio_id, tipo)
  socio_id, tipo, concesso, versione_testo, canale, registrato_il
from public.consensi
order by socio_id, tipo, registrato_il desc, id desc;

-- ---------------------------------------------------------------------------
-- Notifiche push (Web Push della PWA)
-- Le notifiche di servizio (punti accreditati) si possono mandare a tutti;
-- quelle con offerte solo a chi ha il consenso marketing attivo.
-- ---------------------------------------------------------------------------

create table public.notifiche_dispositivi (
  id         uuid primary key default gen_random_uuid(),
  socio_id   uuid not null references public.soci (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  creato_il  timestamptz not null default now()
);

create index notifiche_dispositivi_socio_idx on public.notifiche_dispositivi (socio_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.inviti enable row level security;
alter table public.consensi enable row level security;
alter table public.notifiche_dispositivi enable row level security;

-- Gli inviti si creano con iscriviti(); il socio vede quelli che ha fatto.
create policy "inviti: il socio vede i propri inviti" on public.inviti
  for select to authenticated
  using (invitante_id = public.socio_corrente_id() or invitato_id = public.socio_corrente_id());
create policy "inviti: gestione admin" on public.inviti
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "consensi: il socio vede i propri" on public.consensi
  for select to authenticated using (socio_id = public.socio_corrente_id());
create policy "consensi: il socio registra le proprie scelte dall'app" on public.consensi
  for insert to authenticated
  with check (
    socio_id = public.socio_corrente_id()
    and canale = 'app'
    and registrato_da = auth.uid()
  );
create policy "consensi: lo staff vede tutti" on public.consensi
  for select to authenticated using (public.is_staff());
-- Consenso raccolto su carta in negozio e registrato dallo staff.
create policy "consensi: lo staff registra quelli raccolti in negozio" on public.consensi
  for insert to authenticated
  with check (public.is_staff() and canale in ('negozio', 'admin') and registrato_da = auth.uid());
-- Nessuna policy di update o delete: il registro è in sola aggiunta.

create policy "notifiche_dispositivi: il socio gestisce i propri" on public.notifiche_dispositivi
  for all to authenticated
  using (socio_id = public.socio_corrente_id())
  with check (socio_id = public.socio_corrente_id());
create policy "notifiche_dispositivi: lettura admin" on public.notifiche_dispositivi
  for select to authenticated using (public.is_admin());

grant select, insert, update, delete on public.inviti, public.notifiche_dispositivi to authenticated;
grant select, insert on public.consensi to authenticated;
grant select on public.consensi_attuali to authenticated;
