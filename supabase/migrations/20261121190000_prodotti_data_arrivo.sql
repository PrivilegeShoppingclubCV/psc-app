-- Data di arrivo del prodotto nel gestionale (ReadyPro): l'ultima colonna del foglio,
-- dopo la categoria. Serve a «Ultimi arrivi» nello strumento foto.

alter table public.prodotti add column arrivato_il date;

create or replace function public.importa_prodotti(p_import uuid, p_righe jsonb)
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
    scadenza, scadenza_2, note_scadenza, tipo_6, tipo_7, categoria, arrivato_il, ultimo_import, importato_il
  )
  select distinct on (btrim(r.ean))
    btrim(r.ean), nullif(btrim(r.sku), ''), nullif(btrim(r.marca), ''), btrim(r.descrizione),
    nullif(btrim(r.colore), ''), nullif(btrim(r.taglia), ''), coalesce(r.disponibilita, 0),
    r.prezzo_listino, r.prezzo_soci, r.iva, r.scadenza, r.scadenza_2, nullif(btrim(r.note_scadenza), ''),
    nullif(btrim(r.tipo_6), ''), nullif(btrim(r.tipo_7), ''), nullif(btrim(r.categoria), ''), r.arrivato_il, p_import, now()
  from jsonb_to_recordset(p_righe) as r (
    ean text, sku text, marca text, descrizione text, colore text, taglia text, disponibilita integer,
    prezzo_listino numeric, prezzo_soci numeric, iva numeric, scadenza date, scadenza_2 date,
    note_scadenza text, tipo_6 text, tipo_7 text, categoria text, arrivato_il date
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
    -- Se il foglio non ha la colonna della data, resta quella che c'era.
    arrivato_il = coalesce(excluded.arrivato_il, public.prodotti.arrivato_il),
    ultimo_import = excluded.ultimo_import,
    importato_il = excluded.importato_il;
  get diagnostics v_righe = row_count;
  return v_righe;
end;
$$;

-- foto_prodotti restituisce anche la data di arrivo e la usa per l'ordine «arrivi»
-- (i prodotti senza data vanno in fondo, dal più recente entrato nell'app).
drop function public.foto_prodotti(integer, text, text);

create function public.foto_prodotti(p_limite integer default 20, p_ordine text default 'valore', p_foto text default 'assente')
returns table (
  ean               text,
  sku               text,
  marca             text,
  descrizione       text,
  colore            text,
  taglia            text,
  categoria         text,
  disponibilita     integer,
  valore_fermo      numeric,
  prossima_scadenza date,
  creato_il         timestamptz,
  arrivato_il       date,
  ha_foto           boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_op public.foto_operatori;
begin
  v_op := interno.foto_operatore_corrente();
  if v_op.id is null then
    raise exception 'Non sei autorizzato' using errcode = '42501';
  end if;
  if p_ordine not in ('scadenza', 'pezzi', 'valore', 'arrivi') then
    raise exception 'Ordine non valido' using errcode = '22023';
  end if;
  if p_foto not in ('assente', 'presente', 'tutte') then
    raise exception 'Filtro foto non valido' using errcode = '22023';
  end if;

  return query
  select p.ean, p.sku, p.marca, p.descrizione, p.colore, p.taglia, p.categoria,
         p.disponibilita, p.valore_fermo, s.prossima_scadenza, p.creato_il, p.arrivato_il,
         p.immagine_path is not null
  from public.prodotti p
  cross join lateral (
    select least(
      case when p.scadenza >= (now() at time zone 'Europe/Rome')::date then p.scadenza end,
      case when p.scadenza_2 >= (now() at time zone 'Europe/Rome')::date then p.scadenza_2 end
    ) as prossima_scadenza
  ) s
  where p.disponibilita > 0
    and (p_foto = 'tutte'
         or (p_foto = 'assente' and p.immagine_path is null)
         or (p_foto = 'presente' and p.immagine_path is not null))
    and (p_ordine <> 'scadenza' or s.prossima_scadenza is not null)
  order by
    case when p_ordine = 'scadenza' then s.prossima_scadenza end asc,
    case when p_ordine = 'pezzi' then p.disponibilita end desc,
    case when p_ordine = 'valore' then p.valore_fermo end desc,
    case when p_ordine = 'arrivi' then p.arrivato_il end desc nulls last,
    case when p_ordine = 'arrivi' then p.creato_il end desc,
    p.valore_fermo desc, p.ean
  limit least(greatest(coalesce(p_limite, 20), 1), 500);
end;
$$;

revoke execute on function public.foto_prodotti(integer, text, text) from public, anon;
grant execute on function public.foto_prodotti(integer, text, text) to authenticated;
