-- Lo strumento delle foto, appena carica la verticale sul sito, collega la foto al
-- prodotto con quell'EAN. Così l'app non deve più controllare la cartella del sito.
-- Le foto messe a mano dal pannello (percorsi del bucket) non vengono mai toccate.

create function public.foto_collega_prodotto(p_ean text, p_url text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_op public.foto_operatori;
  v_n  integer;
begin
  v_op := interno.foto_operatore_corrente();
  if v_op.id is null then
    raise exception 'Non sei autorizzato' using errcode = '42501';
  end if;
  if p_ean !~ '^\d{8,14}$' then
    raise exception 'EAN non valido' using errcode = '22023';
  end if;
  -- Solo l'indirizzo della verticale di quell'EAN, su https.
  if p_url !~ ('^https://[A-Za-z0-9.-]+(/[A-Za-z0-9._~-]+)*/verticali/' || p_ean || '\.jpg$') then
    raise exception 'Indirizzo della foto non valido' using errcode = '22023';
  end if;
  -- ?v= cambia a ogni caricamento: se la foto viene sovrascritta l'app non mostra la vecchia dalla cache.
  update public.prodotti
  set immagine_path = p_url || '?v=' || floor(extract(epoch from now()))::bigint
  where ean = p_ean
    and (immagine_path is null or immagine_path ~ '^https://.*/verticali/');
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Quando la foto viene cancellata dal sito, il prodotto torna senza foto.
create function public.foto_scollega_prodotto(p_ean text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_op public.foto_operatori;
  v_n  integer;
begin
  v_op := interno.foto_operatore_corrente();
  if v_op.id is null then
    raise exception 'Non sei autorizzato' using errcode = '42501';
  end if;
  update public.prodotti
  set immagine_path = null
  where ean = p_ean
    and immagine_path ~ ('^https://.*/verticali/' || p_ean || '\.jpg(\?.*)?$');
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke execute on function public.foto_collega_prodotto(text, text), public.foto_scollega_prodotto(text) from public, anon;
grant execute on function public.foto_collega_prodotto(text, text), public.foto_scollega_prodotto(text) to authenticated;
