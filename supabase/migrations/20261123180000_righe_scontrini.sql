-- Prodotti dentro gli scontrini virtuali.
--
-- ReadyPro esporta le righe delle ricevute di cassa (procedura "Documenti di
-- magazzino - Righe") in un secondo CSV; lo script lo manda a
-- /api/gestionale/righe dopo quello delle vendite. Ogni riga si aggancia allo
-- scontrino con il numero del documento.
--   * Le righe di vendite senza tessera (nessuno scontrino) si cancellano dopo un
--     giorno: dati di acquisto anonimi che all'app non servono.
--   * Quando lo scontrino si cancella (30 giorni) le sue righe vanno con lui.
--   * Mappatura in impostazioni.gestionale_mappatura_righe. Vuota = le colonne si
--     riconoscono dal nome (numero documento, descrizione, quantità, totale, codice).

insert into public.impostazioni (chiave, valore, descrizione) values
  ('gestionale_mappatura_righe', '{}',
   'Colonne del CSV righe scontrini di ReadyPro, es. {"numero_documento": "N.Doc.", "descrizione": "Descrizione", "quantita": "Quantita''", "importo": "Totale", "id_riga": "ID"}. Vuota = riconosciute dal nome.')
on conflict (chiave) do nothing;

-- "000123", "123/A", " 123 " → "123": lo stesso numero scritto nei due file.
create function interno.numero_documento(p_testo text)
returns text language sql immutable set search_path = '' as $$
  select coalesce(nullif(ltrim(substring(btrim(p_testo) from '^(\d+)'), '0'), ''), nullif(btrim(p_testo), ''));
$$;

create table public.scontrini_righe (
  id               uuid primary key default gen_random_uuid(),
  -- Id della riga in ReadyPro, oppure numero + posizione + testo: reinviare lo
  -- stesso file non duplica nulla.
  chiave           text not null unique,
  numero_documento text not null,
  ordine           integer not null default 0,
  codice           text,
  descrizione      text not null,
  quantita         numeric(12, 3),
  importo          numeric(10, 2),
  ricevuto_il      timestamptz not null default now()
);

create index scontrini_righe_numero on public.scontrini_righe (numero_documento, ordine);
-- Stessa normalizzazione sullo scontrino, come colonna: la regola RLS qui sotto la
-- confronta senza chiamare funzioni dello schema interno.
alter table public.scontrini add column numero_norm text generated always as (
  coalesce(nullif(ltrim(substring(btrim(numero_documento) from '^(\d+)'), '0'), ''), nullif(btrim(numero_documento), ''))
) stored;
create index scontrini_numero_norm on public.scontrini (numero_norm);

alter table public.scontrini_righe enable row level security;

create policy "scontrini_righe: il socio vede quelle dei suoi scontrini" on public.scontrini_righe
  for select to authenticated using (exists (
    select 1 from public.scontrini s
    where s.socio_id = public.socio_corrente_id()
      and s.numero_norm = scontrini_righe.numero_documento
  ));
create policy "scontrini_righe: l'admin vede tutte" on public.scontrini_righe
  for select to authenticated using (public.is_admin());
grant select on public.scontrini_righe to authenticated;

-- Colonna del file per un campo: dalla mappatura, oppure la prima il cui nome somiglia.
create function interno.colonna_righe(p_mappa jsonb, p_colonne text[], p_campo text)
returns text language plpgsql immutable set search_path = '' as $$
declare
  c    text;
  v_ok boolean;
begin
  if p_mappa ? p_campo then
    return p_mappa ->> p_campo;
  end if;
  foreach c in array p_colonne loop
    v_ok := case p_campo
      when 'numero_documento' then c ~* '(numero.*doc|n\.\s*doc)'
      when 'id_riga'          then c ~* '(id\s*dettaglio|progressivo\s*linea|^id$)'
      when 'descrizione'      then c ~* 'descrizione' and c !~* '(tipo|estesa|divisa|imposte|conto)'
      when 'quantita'         then c ~* '^(q\.?\s*t[aà]|quant)' and c !~* '(evasa|residua|composizione|magazzino)'
      when 'importo'          then c ~* '(totale|importo)' and c !~* '(non\s*scontato|esclusa|imposte)'
      when 'codice'           then c ~* '(^cod\.?$|codice|ean|barre)' and c !~* '(progressivo|divisa|intestatario|produttore|imposte|conto)'
      when 'ordine'           then c ~* 'ordinamento'
      else false end;
    if v_ok then
      return c;
    end if;
  end loop;
  return null;
end;
$$;

-- Chiamata dallo script del server dei negozi, come gestionale_ricevi_vendite.
create function public.gestionale_ricevi_righe(
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
  v_mappa     jsonb := coalesce((select valore from public.impostazioni where chiave = 'gestionale_mappatura_righe'), '{}');
  v_colonne   text[];
  c_numero    text; c_desc text; c_qta text; c_importo text; c_id text; c_codice text; c_ordine text;
  r           jsonb;
  n           bigint;
  v_numero    text;
  v_desc      text;
  v_salvate   int := 0;
  v_visti     jsonb := '{}';
  v_base      text;
  v_volta     int;
  v_saltate   int := 0;
begin
  if jsonb_typeof(p_righe) is distinct from 'array' then
    raise exception 'Le righe devono essere un elenco.';
  end if;
  if jsonb_array_length(p_righe) = 0 then
    return jsonb_build_object('esito', 'vuoto');
  end if;

  select array_agg(k) into v_colonne from jsonb_object_keys(p_righe -> 0) k;
  c_numero  := interno.colonna_righe(v_mappa, v_colonne, 'numero_documento');
  c_desc    := interno.colonna_righe(v_mappa, v_colonne, 'descrizione');
  c_qta     := interno.colonna_righe(v_mappa, v_colonne, 'quantita');
  c_importo := interno.colonna_righe(v_mappa, v_colonne, 'importo');
  c_id      := interno.colonna_righe(v_mappa, v_colonne, 'id_riga');
  c_codice  := interno.colonna_righe(v_mappa, v_colonne, 'codice');
  c_ordine  := interno.colonna_righe(v_mappa, v_colonne, 'ordine');
  if c_numero is null or c_desc is null then
    -- Errore: lo script non segna il file come inviato e lo rimanda al prossimo giro.
    raise exception 'Righe scontrini: non trovo le colonne del numero documento e della descrizione (colonne: %). Imposta la mappatura nel pannello.',
      array_to_string(v_colonne, ', ');
  end if;

  for r, n in select e, i from jsonb_array_elements(p_righe) with ordinality as x(e, i) loop
    v_numero := interno.numero_documento(r ->> c_numero);
    v_desc := nullif(btrim(r ->> c_desc), '');
    if v_numero is null or v_desc is null then
      v_saltate := v_saltate + 1;
      continue;
    end if;
    -- Senza id di riga: numero + contenuto, e quante volte la stessa riga compare
    -- nel file (due righe uguali nello stesso scontrino restano due).
    v_base := v_numero || '#' || md5(r::text);
    v_volta := coalesce((v_visti ->> v_base)::int, 0) + 1;
    v_visti := v_visti || jsonb_build_object(v_base, v_volta);
    begin
      insert into public.scontrini_righe (chiave, numero_documento, ordine, codice, descrizione, quantita, importo)
      values (
        coalesce(nullif(btrim(r ->> c_id), ''), v_base || '#' || v_volta),
        v_numero,
        coalesce(round(interno.import_numero(r ->> c_ordine))::int, n::int),
        nullif(btrim(r ->> c_codice), ''),
        v_desc,
        interno.import_numero(r ->> c_qta),
        interno.import_numero(r ->> c_importo)
      )
      on conflict (chiave) do update set
        numero_documento = excluded.numero_documento,
        codice = excluded.codice,
        descrizione = excluded.descrizione,
        quantita = excluded.quantita,
        importo = excluded.importo;
      v_salvate := v_salvate + 1;
    exception when others then
      v_saltate := v_saltate + 1;
    end;
  end loop;

  perform interno.pulisci_righe_scontrini();
  return jsonb_build_object('esito', 'elaborato', 'righe_ok', v_salvate, 'righe_saltate', v_saltate);
end;
$$;

-- Righe senza scontrino da più di un giorno: vendite anonime o scontrini già cancellati.
create function interno.pulisci_righe_scontrini()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_tolte int;
begin
  delete from public.scontrini_righe r
  where r.ricevuto_il < now() - interval '1 day'
    and not exists (select 1 from public.scontrini s
                    where s.numero_norm = r.numero_documento);
  get diagnostics v_tolte = row_count;
  return v_tolte;
end;
$$;

-- Anche la pulizia notturna degli scontrini toglie le righe rimaste sole.
create or replace function interno.pulisci_scontrini()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_giorni int := coalesce((select (valore #>> '{}')::int from public.impostazioni where chiave = 'scontrini_giorni'), 30);
  v_tolti  int;
begin
  delete from public.scontrini
  where data_scontrino < (date_trunc('day', now() at time zone 'Europe/Rome') - make_interval(days => v_giorni)) at time zone 'Europe/Rome';
  get diagnostics v_tolti = row_count;
  perform interno.pulisci_righe_scontrini();
  return v_tolti;
end;
$$;

revoke execute on all functions in schema interno from public;
revoke execute on function public.gestionale_ricevi_righe(text, text, text, jsonb) from public;
grant execute on function public.gestionale_ricevi_righe(text, text, text, jsonb) to anon, authenticated;
