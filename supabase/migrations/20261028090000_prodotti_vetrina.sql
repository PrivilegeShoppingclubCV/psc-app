-- Catalogo prodotti dal gestionale e vetrina giornaliera delle offerte.
--
-- Le offerte dell'app sono di due tipi:
-- - offerte dello staff (tabella offerte): scritte a mano, anche programmate;
-- - prodotti (questa tabella): le righe del magazzino incollate dall'Excel di
--   ReadyPro. Ogni giorno la vetrina sceglie i prodotti con il valore fermo più
--   alto (pezzi × prezzo tesserati), spinti dalla scadenza vicina, senza
--   ripetere quelli usciti nei giorni precedenti.
-- Un prodotto va in vetrina solo se ha una foto, che si salva per codice EAN.

create table public.prodotti (
  id             uuid primary key default gen_random_uuid(),
  -- Chiave del prodotto: è testo perché gli zeri iniziali contano.
  ean            text not null unique check (ean <> '' and ean = btrim(ean)),
  sku            text,
  marca          text,
  descrizione    text not null,
  colore         text,
  taglia         text,
  disponibilita  integer not null default 0,
  prezzo_listino numeric(10, 2),
  -- Prezzo tesserato cliente.
  prezzo_soci    numeric(10, 2),
  iva            numeric(5, 2),
  -- Valore fermo in magazzino: pezzi × prezzo tesserati.
  valore_fermo   numeric(12, 2) generated always as (greatest(disponibilita, 0) * coalesce(prezzo_soci, 0)) stored,
  -- Note 1 e Note 2 del gestionale, lette come date di scadenza.
  scadenza       date,
  scadenza_2     date,
  -- Il testo originale delle note quando non contiene una data.
  note_scadenza  text,
  tipo_6         text,
  tipo_7         text,
  categoria      text,
  -- Percorso della foto nel bucket pubblico "prodotti".
  immagine_path  text,
  -- Tolto a mano dalle offerte: resta nel catalogo ma non esce mai.
  nascosto       boolean not null default false,
  ultimo_import  uuid,
  importato_il   timestamptz,
  creato_il      timestamptz not null default now(),
  aggiornato_il  timestamptz not null default now()
);

create index prodotti_valore_fermo_idx on public.prodotti (valore_fermo desc) where disponibilita > 0 and immagine_path is not null;
create index prodotti_descrizione_idx on public.prodotti (lower(descrizione));

create trigger prodotti_aggiornato_il
  before update on public.prodotti
  for each row execute function public.imposta_aggiornato_il();

insert into public.impostazioni (chiave, valore, descrizione) values
  ('vetrina_totale', '10', 'Offerte nella pagina principale: prima quelle dello staff, poi i prodotti fino a questo numero'),
  ('vetrina_pausa_giorni', '3', 'Giorni in cui un prodotto uscito in vetrina non può tornarci'),
  ('vetrina_finestra_scadenza_giorni', '180', 'Entro quanti giorni la scadenza vicina fa salire un prodotto (fino al doppio del valore fermo)');

-- Le impostazioni della vetrina servono anche ai soci, che non leggono la tabella impostazioni.
create function public.vetrina_impostazione(p_chiave text, p_default integer)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select (valore #>> '{}')::integer from public.impostazioni where chiave = p_chiave and chiave like 'vetrina\_%'),
    p_default
  );
$$;

-- ---------------------------------------------------------------------------
-- Prodotti che possono andare in offerta, con il punteggio per la vetrina.
-- Punteggio = valore fermo × (1 + quanto è vicina la scadenza): una scadenza
-- tra 30 giorni con la finestra di 180 moltiplica per 1,83; senza scadenza ×1.
-- Esclusi: senza foto, esauriti, senza prezzo, nascosti, scaduti.
-- ---------------------------------------------------------------------------

create view public.prodotti_in_offerta
with (security_invoker = true)
as
select
  p.id, p.ean, p.sku, p.marca, p.descrizione, p.colore, p.taglia, p.disponibilita,
  p.prezzo_listino, p.prezzo_soci, p.valore_fermo, p.categoria, p.immagine_path,
  s.prossima_scadenza,
  round(p.valore_fermo * (1 + greatest(0, f.finestra - (s.prossima_scadenza - f.oggi))::numeric / f.finestra), 2) as punteggio
from public.prodotti p
cross join lateral (
  select (now() at time zone 'Europe/Rome')::date as oggi,
         greatest(1, public.vetrina_impostazione('vetrina_finestra_scadenza_giorni', 180)) as finestra
) f
cross join lateral (
  select least(
    case when p.scadenza >= f.oggi then p.scadenza end,
    case when p.scadenza_2 >= f.oggi then p.scadenza_2 end
  ) as prossima_scadenza
) s
where p.disponibilita > 0
  and p.prezzo_soci > 0
  and p.immagine_path is not null
  and not p.nascosto
  and (s.prossima_scadenza is not null or (p.scadenza is null and p.scadenza_2 is null));

-- ---------------------------------------------------------------------------
-- Vetrina: i prodotti scelti per ogni giorno (fuso di Roma).
-- ---------------------------------------------------------------------------

create table public.vetrina (
  giorno      date not null,
  posizione   integer not null,
  prodotto_id uuid not null references public.prodotti (id) on delete cascade,
  punteggio   numeric(14, 2),
  primary key (giorno, posizione),
  unique (giorno, prodotto_id)
);

create index vetrina_prodotto_idx on public.vetrina (prodotto_id, giorno desc);

-- La vetrina di oggi. Al primo socio che apre le offerte nella giornata si
-- sceglie: tanti prodotti quanti ne servono per arrivare a vetrina_totale dopo
-- le offerte dello staff in corso, esclusi quelli usciti negli ultimi
-- vetrina_pausa_giorni giorni. Un prodotto esaurito o nascosto durante il
-- giorno sparisce subito, senza essere sostituito.
create function public.vetrina_del_giorno()
returns table (
  posizione         integer,
  id                uuid,
  ean               text,
  marca             text,
  descrizione       text,
  colore            text,
  taglia            text,
  prezzo_listino    numeric,
  prezzo_soci       numeric,
  prossima_scadenza date,
  immagine_path     text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_oggi   date := (now() at time zone 'Europe/Rome')::date;
  v_pausa  integer := public.vetrina_impostazione('vetrina_pausa_giorni', 3);
  v_quanti integer;
begin
  if public.socio_corrente_id() is null and not public.is_staff() then
    return;
  end if;

  if not exists (select 1 from public.vetrina v where v.giorno = v_oggi) then
    perform pg_advisory_xact_lock(hashtext('psc.vetrina'));
    if not exists (select 1 from public.vetrina v where v.giorno = v_oggi) then
      v_quanti := greatest(0, public.vetrina_impostazione('vetrina_totale', 10) - (
        select count(*)::integer from public.offerte o
        where o.pubblicata and o.valida_dal <= now() and (o.valida_al is null or o.valida_al > now())
      ));
      insert into public.vetrina (giorno, posizione, prodotto_id, punteggio)
      select v_oggi, row_number() over (order by s.punteggio desc, s.ean), s.id, s.punteggio
      from (
        select p.id, p.ean, p.punteggio
        from public.prodotti_in_offerta p
        where not exists (
          select 1 from public.vetrina v
          where v.prodotto_id = p.id and v.giorno >= v_oggi - v_pausa and v.giorno < v_oggi
        )
        order by p.punteggio desc, p.ean
        limit v_quanti
      ) s;
    end if;
  end if;

  return query
  select v.posizione, p.id, p.ean, p.marca, p.descrizione, p.colore, p.taglia,
         p.prezzo_listino, p.prezzo_soci, p.prossima_scadenza, p.immagine_path
  from public.vetrina v
  join public.prodotti_in_offerta p on p.id = v.prodotto_id
  where v.giorno = v_oggi
  order by v.posizione;
end;
$$;

-- Per il pannello: rifà la scelta di oggi, es. dopo aver caricato foto o prodotti nuovi.
create function public.vetrina_rigenera()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un admin può rigenerare la vetrina.' using errcode = 'insufficient_privilege';
  end if;
  delete from public.vetrina where giorno = (now() at time zone 'Europe/Rome')::date;
end;
$$;

-- ---------------------------------------------------------------------------
-- Import dal foglio Excel (incollato nel pannello). Il pannello legge le righe
-- e le manda a blocchi con lo stesso p_import; alla fine, se le righe erano
-- tutto il magazzino, chiudi_import_prodotti azzera i pezzi di chi non c'era.
-- Le foto e "nascosto" non si toccano mai.
-- ---------------------------------------------------------------------------

create function public.importa_prodotti(p_import uuid, p_righe jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_righe integer;
begin
  if not interno.puo_importare() then
    raise exception 'Solo un admin può importare.' using errcode = 'insufficient_privilege';
  end if;

  insert into public.prodotti (
    ean, sku, marca, descrizione, colore, taglia, disponibilita, prezzo_listino, prezzo_soci, iva,
    scadenza, scadenza_2, note_scadenza, tipo_6, tipo_7, categoria, ultimo_import, importato_il
  )
  select distinct on (btrim(r.ean))
    btrim(r.ean), nullif(btrim(r.sku), ''), nullif(btrim(r.marca), ''), btrim(r.descrizione),
    nullif(btrim(r.colore), ''), nullif(btrim(r.taglia), ''), coalesce(r.disponibilita, 0),
    r.prezzo_listino, r.prezzo_soci, r.iva, r.scadenza, r.scadenza_2, nullif(btrim(r.note_scadenza), ''),
    nullif(btrim(r.tipo_6), ''), nullif(btrim(r.tipo_7), ''), nullif(btrim(r.categoria), ''), p_import, now()
  from jsonb_to_recordset(p_righe) as r (
    ean text, sku text, marca text, descrizione text, colore text, taglia text, disponibilita integer,
    prezzo_listino numeric, prezzo_soci numeric, iva numeric, scadenza date, scadenza_2 date,
    note_scadenza text, tipo_6 text, tipo_7 text, categoria text
  )
  where coalesce(btrim(r.ean), '') <> '' and coalesce(btrim(r.descrizione), '') <> ''
  on conflict (ean) do update set
    sku = excluded.sku,
    marca = excluded.marca,
    descrizione = excluded.descrizione,
    colore = excluded.colore,
    taglia = excluded.taglia,
    disponibilita = excluded.disponibilita,
    prezzo_listino = excluded.prezzo_listino,
    prezzo_soci = excluded.prezzo_soci,
    iva = excluded.iva,
    scadenza = excluded.scadenza,
    scadenza_2 = excluded.scadenza_2,
    note_scadenza = excluded.note_scadenza,
    tipo_6 = excluded.tipo_6,
    tipo_7 = excluded.tipo_7,
    categoria = excluded.categoria,
    ultimo_import = excluded.ultimo_import,
    importato_il = excluded.importato_il;
  get diagnostics v_righe = row_count;
  return v_righe;
end;
$$;

-- Restituisce quanti prodotti sono stati azzerati perché non erano nell'elenco.
create function public.chiudi_import_prodotti(p_import uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_righe integer;
begin
  if not interno.puo_importare() then
    raise exception 'Solo un admin può importare.' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.prodotti where ultimo_import = p_import) then
    raise exception 'Nessun prodotto ricevuto con questo import: non azzero il magazzino.';
  end if;
  update public.prodotti set disponibilita = 0
  where ultimo_import is distinct from p_import and disponibilita <> 0;
  get diagnostics v_righe = row_count;
  return v_righe;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS e permessi
-- ---------------------------------------------------------------------------

alter table public.prodotti enable row level security;
alter table public.vetrina enable row level security;

-- I prezzi tesserati li vedono i soci con l'app e lo staff.
create policy "prodotti: lettura soci e staff" on public.prodotti
  for select to authenticated using (public.socio_corrente_id() is not null or public.is_staff());
create policy "prodotti: gestione admin" on public.prodotti
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "vetrina: lettura staff" on public.vetrina
  for select to authenticated using (public.is_staff());

grant select, insert, update, delete on public.prodotti to authenticated;
grant select on public.vetrina, public.prodotti_in_offerta to authenticated;

revoke execute on function
  public.vetrina_impostazione(text, integer),
  public.vetrina_del_giorno(),
  public.vetrina_rigenera(),
  public.importa_prodotti(uuid, jsonb),
  public.chiudi_import_prodotti(uuid)
from public, anon;
grant execute on function
  public.vetrina_impostazione(text, integer),
  public.vetrina_del_giorno(),
  public.vetrina_rigenera(),
  public.importa_prodotti(uuid, jsonb),
  public.chiudi_import_prodotti(uuid)
to authenticated;
grant execute on function public.importa_prodotti(uuid, jsonb), public.chiudi_import_prodotti(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Foto dei prodotti: bucket pubblico, come quelli delle offerte.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('prodotti', 'prodotti', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do nothing;

alter policy "immagini: gli admin vedono l'elenco dei file" on storage.objects
  using (bucket_id in ('offerte', 'negozi', 'premi', 'prodotti') and public.is_admin());
alter policy "immagini: gli admin caricano" on storage.objects
  with check (bucket_id in ('offerte', 'negozi', 'premi', 'prodotti') and public.is_admin());
alter policy "immagini: gli admin sostituiscono" on storage.objects
  using (bucket_id in ('offerte', 'negozi', 'premi', 'prodotti') and public.is_admin())
  with check (bucket_id in ('offerte', 'negozi', 'premi', 'prodotti') and public.is_admin());
alter policy "immagini: gli admin cancellano" on storage.objects
  using (bucket_id in ('offerte', 'negozi', 'premi', 'prodotti') and public.is_admin());
