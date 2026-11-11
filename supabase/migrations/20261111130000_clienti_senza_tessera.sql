-- Clienti senza tessera nel file di ReadyPro.
--
-- L'anagrafica clienti di ReadyPro contiene anche chi una tessera non ce l'ha
-- (clienti di fatture, shop online...). Il filtro di esportazione non sa
-- escluderli, quindi arrivano: prima finivano tutti in errore ("Numero
-- tessera mancante"), ora vengono saltati con un avviso, senza sporcare il
-- conteggio degli errori.
--
-- Uguale a prima tranne il blocco "Clienti senza tessera".

create or replace function public.gestionale_ricevi_soci(
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
  v_mappa     jsonb := coalesce((select valore from public.impostazioni where chiave = 'gestionale_mappatura_soci'), '{}');
  v_giorni    int := coalesce((select (valore #>> '{}')::int from public.impostazioni where chiave = 'gestionale_giorni_righe'), 30);
  v_batch_id  uuid;
  v_esito     jsonb;
begin
  if jsonb_typeof(p_righe) is distinct from 'array' then
    raise exception 'Le righe devono essere un elenco.';
  end if;

  -- Stesso file dell'ultimo invio elaborato: niente da fare.
  if p_impronta_file is not null and p_impronta_file = (
    select impronta_file from public.import_batch
    where chiave_id is not null and tipo = 'soci' and stato = 'elaborato'
    order by creato_il desc limit 1
  ) then
    return jsonb_build_object('esito', 'invariato');
  end if;

  insert into public.import_batch (tipo, nome_file, mappatura_colonne, righe_totali, note, chiave_id, impronta_file)
  values ('soci', coalesce(nullif(btrim(p_nome_file), ''), 'clienti.csv'), v_mappa,
          jsonb_array_length(p_righe), 'Invio automatico dal server dei negozi', v_chiave_id, p_impronta_file)
  returning id into v_batch_id;

  insert into public.import_righe (batch_id, numero_riga, dati)
  select v_batch_id, n::int, r
  from jsonb_array_elements(p_righe) with ordinality as e(r, n);

  -- Finché la mappatura non è impostata il file resta "caricato": un admin
  -- guarda le intestazioni in import_righe, imposta gestionale_mappatura_soci,
  -- aggiorna mappatura_colonne del batch e lancia importa_soci().
  if v_mappa ->> 'numero_tessera' is null then
    return jsonb_build_object('esito', 'da_mappare', 'batch_id', v_batch_id, 'righe', jsonb_array_length(p_righe));
  end if;

  -- Clienti senza tessera: non sono soci del club, si saltano.
  update public.import_righe
  set stato = 'saltata', avviso = 'Cliente senza tessera in ReadyPro.'
  where batch_id = v_batch_id
    and interno.import_testo(dati, v_mappa, 'numero_tessera') is null;

  perform set_config('psc.import_gestionale', 'on', true);
  v_esito := public.importa_soci(v_batch_id);
  perform set_config('psc.import_gestionale', '', true);

  -- Pulizia: gli invii orari ripetono tutto il file, le righe riuscite non servono a lungo.
  delete from public.import_righe r
  using public.import_batch b
  where r.batch_id = b.id
    and b.chiave_id is not null
    and b.creato_il < now() - make_interval(days => v_giorni)
    and r.stato in ('importata', 'aggiornata', 'saltata');

  return jsonb_build_object('esito', 'elaborato', 'batch_id', v_batch_id) || v_esito;
end;
$$;
