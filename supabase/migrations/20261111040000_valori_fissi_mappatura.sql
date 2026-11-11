-- Valori fissi nella mappatura dell'import.
--
-- Un valore che inizia con "=" non è il nome di una colonna ma il valore da
-- usare per tutte le righe. Serve per i dati che il file di ReadyPro non ha
-- ma valgono per tutti, es. la privacy firmata sul modulo cartaceo della
-- tessera: {"consenso_privacy": "=si"}.
--
-- Da sola non cambia niente: le mappature salvate finora non hanno valori
-- che iniziano con "=".

create or replace function interno.import_testo(p_dati jsonb, p_mappa jsonb, p_campo text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(btrim(
    case when left(p_mappa ->> p_campo, 1) = '='
      then substr(p_mappa ->> p_campo, 2)
      else p_dati ->> (p_mappa ->> p_campo)
    end), '');
$$;

revoke execute on all functions in schema interno from public;

-- I consensi importati portano questo testo come versione: dice da dove vengono.
update public.impostazioni
set valore = '"modulo cartaceo della tessera (informativa art. 13)"'
where chiave = 'versione_consensi_import' and valore = '"gestionale"';
