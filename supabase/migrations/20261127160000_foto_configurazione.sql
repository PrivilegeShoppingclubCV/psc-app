-- Impostazioni condivise dello strumento foto (psc-foto-prodotti), modificabili da un admin.
-- Una sola riga in public.impostazioni, chiave 'foto_configurazione', con:
--   system_prompt         testo dell'Art Director (null = quello scritto nel codice dello strumento)
--   modelli_art_director  [{ "id": "google/gemini-3-flash", "label": "Gemini 3 Flash" }, ...]  (OpenRouter)
--   default_art_director  uno degli id sopra
--   modelli_immagine      [ "fal-ai/nano-banana-2/edit", ... ]  (generatori su fal supportati dallo strumento)
--   default_immagine      uno degli id sopra
-- Nessuna riga = lo strumento usa i valori scritti nel suo codice.

-- Lettura: operatori foto attivi e admin. Dice anche se chi chiede è admin (per mostrare «Impostazioni»).
create or replace function public.foto_configurazione()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_op public.foto_operatori;
begin
  v_op := interno.foto_operatore_corrente();
  if v_op.id is null and not public.is_admin() then
    raise exception 'Non sei autorizzato' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'configurazione', (select i.valore from public.impostazioni i where i.chiave = 'foto_configurazione'),
    'aggiornato_il',  (select i.aggiornato_il from public.impostazioni i where i.chiave = 'foto_configurazione'),
    'admin',          public.is_admin()
  );
end;
$$;

-- Salvataggio: solo admin. Controlla la forma dei dati prima di scriverli.
create or replace function public.foto_salva_configurazione(p jsonb)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ad   jsonb;
  v_img  jsonb;
  v_x    jsonb;
  v_quando timestamptz;
begin
  if not public.is_admin() then
    raise exception 'Solo un admin può cambiare le impostazioni delle foto' using errcode = '42501';
  end if;
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'Impostazioni non valide' using errcode = '22023';
  end if;

  if p ? 'system_prompt' and jsonb_typeof(p -> 'system_prompt') not in ('string', 'null') then
    raise exception 'Il system prompt deve essere un testo' using errcode = '22023';
  end if;
  if length(coalesce(p ->> 'system_prompt', '')) > 60000 then
    raise exception 'Il system prompt è troppo lungo (massimo 60.000 caratteri)' using errcode = '22023';
  end if;

  v_ad := p -> 'modelli_art_director';
  if v_ad is null or jsonb_typeof(v_ad) <> 'array' or jsonb_array_length(v_ad) = 0 or jsonb_array_length(v_ad) > 30 then
    raise exception 'Serve una lista di modelli per l''Art Director (da 1 a 30)' using errcode = '22023';
  end if;
  for v_x in select * from jsonb_array_elements(v_ad) loop
    if jsonb_typeof(v_x) <> 'object'
       or coalesce(v_x ->> 'id', '') !~ '^[A-Za-z0-9._:/-]{3,120}$'
       or length(coalesce(v_x ->> 'label', '')) > 120 then
      raise exception 'Modello Art Director non valido: %', left(v_x::text, 80) using errcode = '22023';
    end if;
  end loop;
  if not exists (select 1 from jsonb_array_elements(v_ad) e where e ->> 'id' = p ->> 'default_art_director') then
    raise exception 'Il modello Art Director predefinito deve essere nella lista' using errcode = '22023';
  end if;

  v_img := p -> 'modelli_immagine';
  if v_img is null or jsonb_typeof(v_img) <> 'array' or jsonb_array_length(v_img) = 0 or jsonb_array_length(v_img) > 30 then
    raise exception 'Serve almeno un modello per generare le immagini' using errcode = '22023';
  end if;
  for v_x in select * from jsonb_array_elements(v_img) loop
    if jsonb_typeof(v_x) <> 'string' or (v_x #>> '{}') !~ '^[A-Za-z0-9._:/-]{3,120}$' then
      raise exception 'Modello immagine non valido: %', left(v_x::text, 80) using errcode = '22023';
    end if;
  end loop;
  if not (v_img @> jsonb_build_array(p ->> 'default_immagine')) then
    raise exception 'Il modello immagine predefinito deve essere nella lista' using errcode = '22023';
  end if;

  insert into public.impostazioni (chiave, valore, descrizione)
  values (
    'foto_configurazione',
    jsonb_build_object(
      'system_prompt',        p -> 'system_prompt',
      'modelli_art_director', v_ad,
      'default_art_director', p -> 'default_art_director',
      'modelli_immagine',     v_img,
      'default_immagine',     p -> 'default_immagine'
    ),
    'Strumento foto: system prompt dell''Art Director e modelli utilizzabili (si cambia dallo strumento, sezione Impostazioni)'
  )
  on conflict (chiave) do update set valore = excluded.valore
  returning aggiornato_il into v_quando;
  return v_quando;
end;
$$;

revoke execute on function public.foto_configurazione() from public, anon;
revoke execute on function public.foto_salva_configurazione(jsonb) from public, anon;
grant execute on function public.foto_configurazione() to authenticated;
grant execute on function public.foto_salva_configurazione(jsonb) to authenticated;
