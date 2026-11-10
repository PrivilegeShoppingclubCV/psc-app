-- Punti dalle vendite di ReadyPro.
--
-- In cassa il commesso scansiona la tessera e ReadyPro attacca la vendita al
-- cliente. Un filtro di esportazione delle vendite scrive un CSV; lo script del
-- server lo manda a /api/gestionale/vendite come fa con i clienti, e qui
-- ogni vendita diventa un movimento punti: punti = importo × punti_per_euro,
-- arrotondato per difetto. Un reso (importo negativo) toglie i punti.
--
-- Campi mappabili (gestionale_mappatura_vendite): numero_tessera, importo,
-- riferimento (id univoco della vendita: senza, un reinvio raddoppia i punti),
-- data, negozio (codice_gestionale), descrizione. Se il file ha già i punti
-- calcolati, si può mappare "punti" al posto di "importo".

insert into public.impostazioni (chiave, valore, descrizione) values
  ('gestionale_mappatura_vendite', '{}',
   'Colonne del CSV vendite di ReadyPro, es. {"numero_tessera": "Cod.Barre", "importo": "Totale", "riferimento": "ID"}. Vuota = i file arrivano ma restano da elaborare.'),
  ('punti_per_euro', '1',
   'Punti per ogni euro speso, arrotondati per difetto (1 = 1 punto ogni euro; 0.5 = 1 punto ogni 2 euro)')
on conflict (chiave) do nothing;

-- Le date dei gestionali arrivano spesso con l'ora ("10/11/2026 18:05"): conta il giorno.
create or replace function interno.import_data(p_valore text)
returns date
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_valore is null then
    return null;
  elsif p_valore ~ '^\d{4}-\d{2}-\d{2}' then
    return substr(p_valore, 1, 10)::date;
  elsif p_valore ~ '^\d{1,2}[/.-]\d{1,2}[/.-]\d{4}($|[ T])' then
    return to_date(regexp_replace(split_part(split_part(p_valore, ' ', 1), 'T', 1), '[.-]', '/', 'g'), 'DD/MM/YYYY');
  end if;
  raise exception 'Data non riconosciuta: "%".', p_valore;
exception when datetime_field_overflow or invalid_datetime_format then
  raise exception 'Data non valida: "%".', p_valore;
end;
$$;

-- Come prima, più le vendite: senza la colonna punti, i punti si calcolano
-- dall'importo. Una vendita senza tessera (anonima) o sotto il primo punto si salta.
create or replace function public.importa_movimenti_punti(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch       public.import_batch := interno.apri_batch(p_batch_id, 'movimenti_punti');
  v_mappa       jsonb := v_batch.mappatura_colonne;
  v_per_euro    numeric := coalesce((select (valore #>> '{}')::numeric from public.impostazioni where chiave = 'punti_per_euro'), 1);
  r             public.import_righe;
  v_tessera     text;
  v_socio_id    uuid;
  v_importo     numeric;
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

      if v_mappa ? 'importo' and interno.import_testo(r.dati, v_mappa, 'numero_tessera') is null then
        update public.import_righe set stato = 'saltata', avviso = 'Vendita senza tessera.' where id = r.id;
        continue;
      end if;

      v_tessera := interno.import_tessera(r.dati, v_mappa);
      v_socio_id := interno.socio_da_tessera(v_tessera);
      if v_socio_id is null then
        raise exception 'Tessera % non trovata: importa prima i soci.', v_tessera;
      end if;

      v_importo := interno.import_numero(interno.import_testo(r.dati, v_mappa, 'importo'));
      if v_mappa ? 'punti' then
        v_punti := round(interno.import_numero(interno.import_testo(r.dati, v_mappa, 'punti')));
      else
        -- Per difetto anche sui resi: -12,50 € tolgono 12 punti, come 12,50 € ne danno 12.
        v_punti := (sign(v_importo) * floor(abs(v_importo) * v_per_euro))::integer;
        if coalesce(v_punti, 0) = 0 then
          update public.import_righe set stato = 'saltata', socio_id = v_socio_id,
            avviso = 'Importo sotto il primo punto.' where id = r.id;
          continue;
        end if;
      end if;
      if coalesce(v_punti, 0) = 0 then
        raise exception 'Punti mancanti o a zero.';
      end if;

      v_tipo := coalesce(lower(interno.import_testo(r.dati, v_mappa, 'tipo')),
                         case when v_punti < 0 then 'storno' else 'acquisto' end);
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
        v_importo,
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

-- Come gestionale_ricevi_soci, per il CSV delle vendite.
create function public.gestionale_ricevi_vendite(
  p_chiave        text,
  p_nome_file     text,
  p_impronta_file text,
  p_righe         jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chiave_id uuid := interno.gestionale_verifica_chiave(p_chiave);
  v_mappa     jsonb := coalesce((select valore from public.impostazioni where chiave = 'gestionale_mappatura_vendite'), '{}');
  v_giorni    int := coalesce((select (valore #>> '{}')::int from public.impostazioni where chiave = 'gestionale_giorni_righe'), 30);
  v_batch_id  uuid;
  v_esito     jsonb;
begin
  if jsonb_typeof(p_righe) is distinct from 'array' then
    raise exception 'Le righe devono essere un elenco.';
  end if;

  if p_impronta_file is not null and p_impronta_file = (
    select impronta_file from public.import_batch
    where chiave_id is not null and tipo = 'movimenti_punti' and stato = 'elaborato'
    order by creato_il desc limit 1
  ) then
    return jsonb_build_object('esito', 'invariato');
  end if;

  insert into public.import_batch (tipo, nome_file, mappatura_colonne, righe_totali, note, chiave_id, impronta_file)
  values ('movimenti_punti', coalesce(nullif(btrim(p_nome_file), ''), 'vendite.csv'), v_mappa,
          jsonb_array_length(p_righe), 'Invio automatico dal server dei negozi', v_chiave_id, p_impronta_file)
  returning id into v_batch_id;

  insert into public.import_righe (batch_id, numero_riga, dati)
  select v_batch_id, n::int, r
  from jsonb_array_elements(p_righe) with ordinality as e(r, n);

  if v_mappa ->> 'numero_tessera' is null or not (v_mappa ? 'importo' or v_mappa ? 'punti') then
    return jsonb_build_object('esito', 'da_mappare', 'batch_id', v_batch_id, 'righe', jsonb_array_length(p_righe));
  end if;

  perform set_config('psc.import_gestionale', 'on', true);
  v_esito := public.importa_movimenti_punti(v_batch_id);
  perform set_config('psc.import_gestionale', '', true);

  delete from public.import_righe r
  using public.import_batch b
  where r.batch_id = b.id
    and b.chiave_id is not null
    and b.creato_il < now() - make_interval(days => v_giorni)
    and r.stato in ('importata', 'aggiornata', 'saltata');

  return jsonb_build_object('esito', 'elaborato', 'batch_id', v_batch_id) || v_esito;
end;
$$;

revoke execute on all functions in schema interno from public;
revoke execute on function public.gestionale_ricevi_vendite(text, text, text, jsonb) from public;
grant execute on function public.gestionale_ricevi_vendite(text, text, text, jsonb) to anon, authenticated;
