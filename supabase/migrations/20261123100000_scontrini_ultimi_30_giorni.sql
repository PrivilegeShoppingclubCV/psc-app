-- Scontrini virtuali degli ultimi 30 giorni.
--
-- Ogni vendita con tessera che arriva da ReadyPro (CSV vendite) diventa anche uno
-- scontrino che il socio vede in app, in "Punti → I tuoi scontrini".
--   * Lo scontrino si salva anche sotto il primo punto (es. 3 € con 1 punto ogni 5 €).
--   * I punti dello scontrino si leggono dal movimento con lo stesso N.Doc.
--   * Gli scontrini più vecchi di 30 giorni (impostazione scontrini_giorni) si
--     cancellano ogni giorno (pg_cron, alle 3:15 ora di Roma) e a ogni invio vendite.
--     I movimenti punti NON si toccano: il saldo resta quello di sempre.
--   * Oggi il CSV di ReadyPro ha solo la testata (N.Doc., data, totale, cassa): la
--     colonna righe è pronta per gli articoli, se un giorno arriverà anche quel file.

insert into public.impostazioni (chiave, valore, descrizione) values
  ('scontrini_giorni', '30',
   'Per quanti giorni il socio vede i suoi scontrini in app: i più vecchi vengono cancellati (i punti restano).')
on conflict (chiave) do nothing;

create table public.scontrini (
  id               uuid primary key default gen_random_uuid(),
  socio_id         uuid not null references public.soci (id) on delete cascade,
  -- N.Doc. di ReadyPro: numerazione unica tra le casse, quindi chiave dello scontrino.
  numero_documento text not null unique,
  tipo_documento   text,
  data_scontrino   timestamptz not null,
  totale           numeric(10, 2) not null,
  negozio_id       uuid references public.negozi (id) on delete set null,
  -- Come arriva dal gestionale ("Cassa 1"), se il negozio non è abbinato.
  cassa            text,
  punti            integer not null default 0,
  -- Articoli: [{"descrizione": "...", "quantita": 1, "importo": 12.5}]. Vuoto finché
  -- ReadyPro manda solo la testata.
  righe            jsonb,
  import_batch_id  uuid references public.import_batch (id) on delete set null,
  creato_il        timestamptz not null default now()
);

create index scontrini_socio_data on public.scontrini (socio_id, data_scontrino desc);
create index scontrini_data on public.scontrini (data_scontrino);

alter table public.scontrini enable row level security;

create policy "scontrini: il socio vede i propri" on public.scontrini
  for select to authenticated using (socio_id = public.socio_corrente_id());
create policy "scontrini: lo staff vede tutti" on public.scontrini
  for select to authenticated using (public.is_staff());

grant select on public.scontrini to authenticated;

-- Cancella gli scontrini oltre il limite. Restituisce quanti ne ha tolti.
create function interno.pulisci_scontrini()
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
  return v_tolti;
end;
$$;

-- Dalle righe di un file vendite elaborato salva gli scontrini dei soci.
-- Non cambia lo stato delle righe né i punti: legge e basta.
create function interno.salva_scontrini(p_batch_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mappa  jsonb := (select mappatura_colonne from public.import_batch where id = p_batch_id);
  v_giorni int := coalesce((select (valore #>> '{}')::int from public.impostazioni where chiave = 'scontrini_giorni'), 30);
  r        public.import_righe;
  v_socio  uuid;
  v_numero text;
  v_data   timestamptz;
  v_cassa  text;
begin
  -- Solo i file con importo e N.Doc.: un CSV di soli bonus non è fatto di scontrini.
  if v_mappa is null or not (v_mappa ? 'importo' and v_mappa ? 'riferimento') then
    return;
  end if;

  for r in
    select * from public.import_righe
    where batch_id = p_batch_id and stato in ('importata', 'saltata')
  loop
    begin
      v_numero := interno.import_testo(r.dati, v_mappa, 'riferimento');
      continue when v_numero is null;
      v_socio := coalesce(r.socio_id, interno.socio_da_tessera(interno.import_tessera(r.dati, v_mappa)));
      continue when v_socio is null;
      v_data := interno.import_istante(interno.import_testo(r.dati, v_mappa, 'data'),
                                       interno.import_testo(r.dati, v_mappa, 'ora'));
      continue when v_data is null
        or v_data < now() - make_interval(days => v_giorni + 1);
      v_cassa := interno.import_testo(r.dati, v_mappa, 'negozio');

      insert into public.scontrini (
        socio_id, numero_documento, tipo_documento, data_scontrino, totale,
        negozio_id, cassa, punti, import_batch_id
      ) values (
        v_socio, v_numero,
        interno.import_testo(r.dati, v_mappa, 'tipo_documento'),
        v_data,
        interno.import_numero(interno.import_testo(r.dati, v_mappa, 'importo')),
        (select id from public.negozi where codice_gestionale = v_cassa),
        v_cassa,
        coalesce((select sum(m.punti) from public.movimenti_punti m
                  where m.fonte = 'gestionale' and m.riferimento_esterno = v_numero), 0),
        p_batch_id
      )
      on conflict (numero_documento) do update set
        socio_id   = excluded.socio_id,
        totale     = excluded.totale,
        negozio_id = excluded.negozio_id,
        cassa      = excluded.cassa,
        punti      = excluded.punti;
    exception when others then
      -- Uno scontrino che non torna non deve fermare i punti: si salta.
      null;
    end;
  end loop;

  perform interno.pulisci_scontrini();
end;
$$;

-- Quando un file vendite è elaborato (invio automatico o pulsante nel pannello)
-- se ne ricavano gli scontrini.
create function interno.scontrini_da_batch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform interno.salva_scontrini(new.id);
  return new;
end;
$$;

create trigger import_batch_scontrini
  after update of stato on public.import_batch
  for each row
  when (new.tipo = 'movimenti_punti' and new.stato = 'elaborato' and old.stato is distinct from 'elaborato')
  execute function interno.scontrini_da_batch();

revoke execute on all functions in schema interno from public;

-- Pulizia giornaliera con pg_cron, se il progetto ce l'ha (Supabase sì). Senza,
-- basta la pulizia che parte a ogni invio vendite.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('psc-pulisci-scontrini', '15 2 * * *', 'select interno.pulisci_scontrini()');
  end if;
exception when others then
  raise notice 'pg_cron non disponibile (%): gli scontrini si puliscono a ogni invio vendite.', sqlerrm;
end;
$$;

-- Le vendite degli ultimi 30 giorni già arrivate: le righe dei file restano
-- 30 giorni (gestionale_giorni_righe), quindi si possono ricavare subito.
do $$
declare
  b record;
begin
  for b in
    select id from public.import_batch
    where tipo = 'movimenti_punti' and stato = 'elaborato'
      and creato_il > now() - interval '31 days'
    order by creato_il
  loop
    perform interno.salva_scontrini(b.id);
  end loop;
end;
$$;
