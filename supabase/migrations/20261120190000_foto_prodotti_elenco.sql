-- Lo strumento delle foto prende i prodotti da qui invece che da un foglio incollato.
-- Solo prodotti con pezzi in magazzino. Filtri: quanti, ordine, foto sì/no.
--   p_ordine: 'scadenza' (più vicina prima), 'pezzi', 'valore' (valore fermo), 'arrivi' (ultimi entrati)
--   p_foto:   'assente', 'presente', 'tutte'

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
         p.disponibilita, p.valore_fermo, s.prossima_scadenza, p.creato_il,
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
    case when p_ordine = 'arrivi' then p.creato_il end desc,
    p.valore_fermo desc, p.ean
  limit least(greatest(coalesce(p_limite, 20), 1), 500);
end;
$$;

revoke execute on function public.foto_prodotti(integer, text, text) from public, anon;
grant execute on function public.foto_prodotti(integer, text, text) to authenticated;
