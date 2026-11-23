-- Punti: 1 punto ogni 5 euro spesi (prima era 1 punto ogni euro).
--
-- La regola si scrive ora come "euro di spesa per 1 punto" (euro_per_punto),
-- così 5 resta esatto: con il vecchio "punti per euro" servirebbe 0,2 e una
-- regola come 1 punto ogni 3 euro non si potrebbe scrivere senza arrotondare.
-- Il conto si fa su ogni vendita, per difetto: 24,90 € = 4 punti.
--
-- punti_dal: data di avvio dei punti. Le vendite con data precedente si
-- saltano, così un reinvio del CSV (ReadyPro manda gli ultimi 7 giorni) non
-- rimette punti di prima del lancio. Vuota = nessun limite.
--
-- Saldi già accumulati: si convertono alla nuova regola, saldo / 5 per
-- difetto (37 punti → 7). Si fa con un movimento di rettifica per socio, così
-- il registro resta com'era e il saldo torna dalla somma. Va fatto nella
-- stessa migrazione del cambio regola: le vendite importate dopo sono già a
-- 1 punto ogni 5 euro e non vanno divise di nuovo.
--
-- euro_per_punto() è leggibile da tutti: la pagina Punti del socio la usa per
-- scrivere la regola (impostazioni la leggono solo gli staff).

insert into public.impostazioni (chiave, valore, descrizione) values
  ('euro_per_punto', '5',
   'Euro di spesa per guadagnare 1 punto, per difetto su ogni vendita (5 = 1 punto ogni 5 euro: 24,90 € danno 4 punti)'),
  ('punti_dal', '""',
   'Data di avvio dei punti (AAAA-MM-GG): le vendite precedenti non danno punti. Vuota = nessun limite.')
on conflict (chiave) do nothing;

delete from public.impostazioni where chiave = 'punti_per_euro';

create or replace function public.euro_per_punto()
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select nullif((valore #>> '{}')::numeric, 0) from public.impostazioni where chiave = 'euro_per_punto'),
    5);
$$;

revoke execute on function public.euro_per_punto() from public;
grant execute on function public.euro_per_punto() to anon, authenticated;

insert into public.movimenti_punti (socio_id, punti, tipo, descrizione, fonte)
select socio_id,
       (sign(saldo) * floor(abs(saldo) / 5.0))::integer - saldo,
       'rettifica',
       'Conversione a 1 punto ogni 5 € (saldo ' || saldo || ' → ' || (sign(saldo) * floor(abs(saldo) / 5.0))::integer || ')',
       'admin'
from public.saldi_punti
where (sign(saldo) * floor(abs(saldo) / 5.0))::integer <> saldo;

create or replace function public.importa_movimenti_punti(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch       public.import_batch := interno.apri_batch(p_batch_id, 'movimenti_punti');
  v_mappa       jsonb := v_batch.mappatura_colonne;
  v_euro_punto  numeric := public.euro_per_punto();
  v_dal         date := (select nullif(valore #>> '{}', '')::date from public.impostazioni where chiave = 'punti_dal');
  v_quando      timestamptz;
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

      v_quando := interno.import_istante(interno.import_testo(r.dati, v_mappa, 'data'), interno.import_testo(r.dati, v_mappa, 'ora'));
      if v_dal is not null and v_quando is not null and (v_quando at time zone 'Europe/Rome')::date < v_dal then
        update public.import_righe set stato = 'saltata', socio_id = v_socio_id,
          avviso = format('Vendita del %s, prima dell''avvio dei punti (%s).',
                          to_char(v_quando at time zone 'Europe/Rome', 'DD/MM/YYYY'), to_char(v_dal, 'DD/MM/YYYY'))
        where id = r.id;
        continue;
      end if;

      v_importo := interno.import_numero(interno.import_testo(r.dati, v_mappa, 'importo'));
      if v_mappa ? 'punti' then
        v_punti := round(interno.import_numero(interno.import_testo(r.dati, v_mappa, 'punti')));
      else
        -- 1 punto ogni euro_per_punto euro, per difetto anche sui resi: con 5,
        -- 24,90 € danno 4 punti e un reso di -24,90 € ne toglie 4.
        v_punti := (sign(v_importo) * floor(abs(v_importo) / v_euro_punto))::integer;
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
        coalesce(v_quando, now()),
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
