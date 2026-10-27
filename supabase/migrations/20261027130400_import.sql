-- Import dal gestionale (CSV o Excel).
--
-- Il gestionale non è ancora noto, quindi l'import non presuppone nomi di colonna:
-- 1. il pannello admin legge il file nel browser e crea un import_batch con la
--    mappatura delle colonne, es. {"numero_tessera": "Codice cliente", "punti": "Saldo"};
-- 2. salva ogni riga così com'è (intestazioni originali) in import_righe.dati;
-- 3. chiama importa_soci() o importa_movimenti_punti(), che applicano la mappatura
--    e scrivono l'esito riga per riga. Il file originale resta nel bucket "import".
-- Reimportare lo stesso file non duplica nulla: i soci si aggiornano per numero
-- tessera e i movimenti si scartano se il riferimento è già presente.

create schema if not exists interno;
revoke all on schema interno from public;

create table public.import_batch (
  id                uuid primary key default gen_random_uuid(),
  tipo              text not null check (tipo in ('soci', 'movimenti_punti')),
  nome_file         text not null,
  -- Percorso del file originale nel bucket privato "import".
  storage_path      text,
  stato             text not null default 'caricato'
                      check (stato in ('caricato', 'elaborato', 'annullato')),
  -- Campo dell'app -> intestazione della colonna nel file.
  mappatura_colonne jsonb not null default '{}',
  righe_totali      integer not null default 0,
  righe_ok          integer not null default 0,
  righe_saltate     integer not null default 0,
  righe_errore      integer not null default 0,
  note              text,
  creato_da         uuid references auth.users (id) on delete set null,
  creato_il         timestamptz not null default now(),
  elaborato_il      timestamptz
);

create table public.import_righe (
  id          bigint generated always as identity primary key,
  batch_id    uuid not null references public.import_batch (id) on delete cascade,
  numero_riga integer not null,
  dati        jsonb not null,
  stato       text not null default 'in_attesa'
                check (stato in ('in_attesa', 'importata', 'aggiornata', 'saltata', 'errore')),
  errore      text,
  avviso      text,
  socio_id    uuid references public.soci (id) on delete set null,
  unique (batch_id, numero_riga)
);

alter table public.soci
  add constraint soci_ultimo_import_fk
  foreign key (ultimo_import_id) references public.import_batch (id) on delete set null;
alter table public.movimenti_punti
  add constraint movimenti_punti_import_batch_fk
  foreign key (import_batch_id) references public.import_batch (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Lettura dei valori del file
-- ---------------------------------------------------------------------------

-- Valore della colonna mappata sul campo, ripulito; null se assente o vuoto.
create function interno.import_testo(p_dati jsonb, p_mappa jsonb, p_campo text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(btrim(p_dati ->> (p_mappa ->> p_campo)), '');
$$;

create function interno.import_booleano(p_valore text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when lower(btrim(p_valore)) in ('1', 'si', 'sì', 's', 'true', 'vero', 'x', 'y', 'yes') then true
    when lower(btrim(p_valore)) in ('0', 'no', 'n', 'false', 'falso') then false
  end;
$$;

-- Date in formato 2026-10-27, 27/10/2026, 27-10-2026 o 27.10.2026.
create function interno.import_data(p_valore text)
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
  elsif p_valore ~ '^\d{1,2}[/.-]\d{1,2}[/.-]\d{4}$' then
    return to_date(regexp_replace(p_valore, '[.-]', '/', 'g'), 'DD/MM/YYYY');
  end if;
  raise exception 'Data non riconosciuta: "%".', p_valore;
exception when datetime_field_overflow or invalid_datetime_format then
  raise exception 'Data non valida: "%".', p_valore;
end;
$$;

-- Numeri all'italiana: "1.788" sono milleottocentottantotto, "12,50" è dodici e cinquanta.
create function interno.import_numero(p_valore text)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := replace(btrim(p_valore), ' ', '');
begin
  if v is null or v = '' then
    return null;
  elsif v ~ '^-?\d{1,3}(\.\d{3})+(,\d+)?$' then
    v := replace(replace(v, '.', ''), ',', '.');
  else
    v := replace(v, ',', '.');
  end if;
  return v::numeric;
exception when invalid_text_representation then
  raise exception 'Numero non riconosciuto: "%".', p_valore;
end;
$$;

-- Admin dall'app, service role dal server, oppure SQL editor di Supabase.
create function interno.puo_importare()
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.is_admin()
    or coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    or session_user <> 'authenticator';
$$;

create function interno.chiudi_batch(p_batch_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_esito jsonb;
begin
  update public.import_batch b set
    stato = 'elaborato',
    elaborato_il = now(),
    righe_totali = c.totali,
    righe_ok = c.ok,
    righe_saltate = c.saltate,
    righe_errore = c.errori
  from (
    select
      count(*)::int as totali,
      count(*) filter (where stato in ('importata', 'aggiornata'))::int as ok,
      count(*) filter (where stato = 'saltata')::int as saltate,
      count(*) filter (where stato = 'errore')::int as errori
    from public.import_righe where batch_id = p_batch_id
  ) c
  where b.id = p_batch_id
  returning jsonb_build_object(
    'righe_totali', b.righe_totali, 'righe_ok', b.righe_ok,
    'righe_saltate', b.righe_saltate, 'righe_errore', b.righe_errore
  ) into v_esito;
  return v_esito;
end;
$$;

create function interno.apri_batch(p_batch_id uuid, p_tipo text)
returns public.import_batch
language plpgsql
set search_path = ''
as $$
declare
  v_batch public.import_batch;
begin
  if not interno.puo_importare() then
    raise exception 'Solo un admin può importare.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_batch from public.import_batch where id = p_batch_id for update;
  if not found then
    raise exception 'Import % non trovato.', p_batch_id;
  elsif v_batch.tipo <> p_tipo then
    raise exception 'Questo import è di tipo "%", non "%".', v_batch.tipo, p_tipo;
  elsif v_batch.stato <> 'caricato' then
    raise exception 'Questo import è già stato %.', v_batch.stato;
  elsif v_batch.mappatura_colonne ->> 'numero_tessera' is null then
    raise exception 'Nella mappatura manca la colonna del numero tessera.';
  end if;
  return v_batch;
end;
$$;

-- Il numero tessera deve arrivare come testo: se il file è stato letto come
-- numero, "004718" è già diventato 4718 e non si può più ricostruire.
create function interno.import_tessera(p_dati jsonb, p_mappa jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_tessera text := interno.import_testo(p_dati, p_mappa, 'numero_tessera');
begin
  if jsonb_typeof(p_dati -> (p_mappa ->> 'numero_tessera')) = 'number' then
    raise exception 'Il numero tessera è stato letto come numero e potrebbe aver perso gli zeri iniziali: rileggi il file con le colonne come testo.';
  elsif v_tessera is null then
    raise exception 'Numero tessera mancante.';
  end if;
  return v_tessera;
end;
$$;

-- ---------------------------------------------------------------------------
-- Import dei soci
-- Campi mappabili: numero_tessera (obbligatorio), nome, cognome, email, telefono,
-- data_nascita, cap, citta, livello, negozio (codice_gestionale), iscritto_il,
-- punti (saldo iniziale), consenso_privacy, consenso_marketing, consenso_profilazione.
-- Le colonne non mappate finiscono in soci.dati_gestionale.
-- ---------------------------------------------------------------------------

create function public.importa_soci(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch       public.import_batch := interno.apri_batch(p_batch_id, 'soci');
  v_mappa       jsonb := v_batch.mappatura_colonne;
  v_versione    text := (select valore #>> '{}' from public.impostazioni where chiave = 'versione_consensi_import');
  r             public.import_righe;
  v_tessera     text;
  v_livello     text;
  v_negozio     text;
  v_negozio_id  uuid;
  v_iscritto_il date;
  v_punti       integer;
  v_consenso    boolean;
  v_tipo        text;
  v_socio_id    uuid;
  v_nuovo       boolean;
  v_avvisi      text[];
begin
  for r in
    select * from public.import_righe
    where batch_id = p_batch_id and stato = 'in_attesa'
    order by numero_riga
  loop
    begin
      v_avvisi := '{}';
      v_tessera := interno.import_tessera(r.dati, v_mappa);

      v_livello := lower(interno.import_testo(r.dati, v_mappa, 'livello'));
      if v_livello is not null and not exists (select 1 from public.livelli where codice = v_livello) then
        v_avvisi := v_avvisi || format('Livello "%s" sconosciuto: ignorato.', v_livello);
        v_livello := null;
      end if;

      v_negozio := interno.import_testo(r.dati, v_mappa, 'negozio');
      v_negozio_id := (select id from public.negozi where codice_gestionale = v_negozio);
      if v_negozio is not null and v_negozio_id is null then
        v_avvisi := v_avvisi || format('Negozio "%s" non trovato: ignorato.', v_negozio);
      end if;

      v_iscritto_il := interno.import_data(interno.import_testo(r.dati, v_mappa, 'iscritto_il'));

      -- Il gestionale è la fonte dei dati anagrafici: un valore presente nel file
      -- sovrascrive quello salvato, una cella vuota non cancella nulla.
      insert into public.soci as s (
        numero_tessera, nome, cognome, email, telefono, data_nascita, cap, citta,
        livello, negozio_preferito_id, iscritto_il, origine, dati_gestionale, ultimo_import_id
      ) values (
        v_tessera,
        interno.import_testo(r.dati, v_mappa, 'nome'),
        interno.import_testo(r.dati, v_mappa, 'cognome'),
        lower(interno.import_testo(r.dati, v_mappa, 'email')),
        interno.import_testo(r.dati, v_mappa, 'telefono'),
        interno.import_data(interno.import_testo(r.dati, v_mappa, 'data_nascita')),
        interno.import_testo(r.dati, v_mappa, 'cap'),
        interno.import_testo(r.dati, v_mappa, 'citta'),
        coalesce(v_livello, 'classic'),
        v_negozio_id,
        coalesce(v_iscritto_il, current_date),
        'import',
        r.dati - array(select value from jsonb_each_text(v_mappa)),
        p_batch_id
      )
      on conflict (numero_tessera) do update set
        nome                 = coalesce(excluded.nome, s.nome),
        cognome              = coalesce(excluded.cognome, s.cognome),
        email                = coalesce(excluded.email, s.email),
        telefono             = coalesce(excluded.telefono, s.telefono),
        data_nascita         = coalesce(excluded.data_nascita, s.data_nascita),
        cap                  = coalesce(excluded.cap, s.cap),
        citta                = coalesce(excluded.citta, s.citta),
        livello              = coalesce(v_livello, s.livello),
        negozio_preferito_id = coalesce(excluded.negozio_preferito_id, s.negozio_preferito_id),
        iscritto_il          = coalesce(v_iscritto_il, s.iscritto_il),
        dati_gestionale      = s.dati_gestionale || excluded.dati_gestionale,
        ultimo_import_id     = excluded.ultimo_import_id
      returning s.id, (s.xmax = 0) into v_socio_id, v_nuovo;

      -- Saldo iniziale: solo al primo import. Dopo, i punti cambiano con i movimenti.
      v_punti := round(interno.import_numero(interno.import_testo(r.dati, v_mappa, 'punti')));
      if coalesce(v_punti, 0) <> 0 then
        if exists (select 1 from public.movimenti_punti where socio_id = v_socio_id and tipo = 'saldo_iniziale') then
          v_avvisi := v_avvisi || format('Saldo iniziale già importato: i %s punti del file non sono stati aggiunti.', v_punti);
        else
          insert into public.movimenti_punti (socio_id, punti, tipo, descrizione, fonte, import_batch_id, creato_da)
          values (v_socio_id, v_punti, 'saldo_iniziale', 'Saldo importato dal gestionale', 'import', p_batch_id, auth.uid());
        end if;
      end if;

      -- Consensi: si importano solo se il socio non ne ha ancora per quel tipo.
      -- Una scelta fatta poi in app non viene mai sovrascritta dal gestionale.
      foreach v_tipo in array array['privacy', 'marketing', 'profilazione'] loop
        v_consenso := interno.import_booleano(interno.import_testo(r.dati, v_mappa, 'consenso_' || v_tipo));
        if v_consenso is not null
           and not exists (select 1 from public.consensi where socio_id = v_socio_id and tipo = v_tipo) then
          insert into public.consensi (socio_id, tipo, concesso, versione_testo, canale, registrato_da)
          values (v_socio_id, v_tipo, v_consenso, v_versione, 'import', auth.uid());
        end if;
      end loop;

      update public.import_righe set
        stato = case when v_nuovo then 'importata' else 'aggiornata' end,
        socio_id = v_socio_id,
        errore = null,
        avviso = nullif(array_to_string(v_avvisi, ' '), '')
      where id = r.id;
    exception when others then
      update public.import_righe set stato = 'errore', errore = sqlerrm where id = r.id;
    end;
  end loop;

  return interno.chiudi_batch(p_batch_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Import dei movimenti punti (se il gestionale esporta scontrini o accrediti)
-- Campi mappabili: numero_tessera (obbligatorio), punti (obbligatorio), data,
-- riferimento (id scontrino: evita i doppioni), negozio (codice_gestionale),
-- importo, descrizione, tipo (acquisto se assente).
-- ---------------------------------------------------------------------------

create function public.importa_movimenti_punti(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch       public.import_batch := interno.apri_batch(p_batch_id, 'movimenti_punti');
  v_mappa       jsonb := v_batch.mappatura_colonne;
  r             public.import_righe;
  v_tessera     text;
  v_socio_id    uuid;
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
      v_tessera := interno.import_tessera(r.dati, v_mappa);
      v_socio_id := (select id from public.soci where numero_tessera = v_tessera);
      if v_socio_id is null then
        raise exception 'Tessera % non trovata: importa prima i soci.', v_tessera;
      end if;

      v_punti := round(interno.import_numero(interno.import_testo(r.dati, v_mappa, 'punti')));
      if coalesce(v_punti, 0) = 0 then
        raise exception 'Punti mancanti o a zero.';
      end if;

      v_tipo := coalesce(lower(interno.import_testo(r.dati, v_mappa, 'tipo')), 'acquisto');
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
        interno.import_numero(interno.import_testo(r.dati, v_mappa, 'importo')),
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

-- ---------------------------------------------------------------------------
-- RLS e permessi
-- ---------------------------------------------------------------------------

alter table public.import_batch enable row level security;
alter table public.import_righe enable row level security;

create policy "import_batch: solo admin" on public.import_batch
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "import_righe: solo admin" on public.import_righe
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.import_batch, public.import_righe to authenticated;

revoke execute on all functions in schema interno from public;
revoke execute on function public.importa_soci(uuid), public.importa_movimenti_punti(uuid) from public, anon;
grant execute on function public.importa_soci(uuid), public.importa_movimenti_punti(uuid) to authenticated, service_role;
