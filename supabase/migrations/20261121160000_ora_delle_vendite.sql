-- Ora delle vendite importate.
--
-- Il CSV delle vendite di ReadyPro ha solo la data (GG.MM.AAAA): finora diventava
-- la mezzanotte UTC, che il pannello mostrava come "01:00" (ora di Roma).
-- Da qui:
--   * la mappatura può avere una colonna "ora" (HH:MM o HH:MM:SS), oppure l'ora
--     può stare nella stessa cella della data ("17.11.2026 10:35");
--   * data e ora sono lette come ora di Roma;
--   * senza ora si tiene la mezzanotte UTC, che il pannello e l'app ora mostrano
--     come sola data (nessun negozio vende a mezzanotte UTC, cioè all'1 o alle 2 di notte).
-- I movimenti già importati non cambiano: senza ora restano "solo data".

create or replace function interno.import_istante(p_data text, p_ora text)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_giorno date := interno.import_data(p_data);
  v_ora    text;
begin
  if v_giorno is null then
    return null;
  end if;
  v_ora := coalesce(
    nullif(btrim(p_ora), ''),
    substring(p_data from '[ T](\d{1,2}[:.]\d{2}(?:[:.]\d{2})?)')
  );
  if v_ora is null then
    return v_giorno::timestamp at time zone 'UTC';
  end if;
  if v_ora !~ '^\d{1,2}[:.]\d{2}([:.]\d{2})?$' then
    raise exception 'Ora non riconosciuta: "%".', v_ora;
  end if;
  return (v_giorno + replace(v_ora, '.', ':')::time) at time zone 'Europe/Rome';
exception when datetime_field_overflow or invalid_datetime_format then
  raise exception 'Ora non valida: "%".', v_ora;
end;
$$;

revoke execute on function interno.import_istante(text, text) from public;

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
        coalesce(interno.import_istante(interno.import_testo(r.dati, v_mappa, 'data'), interno.import_testo(r.dati, v_mappa, 'ora')), now()),
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
