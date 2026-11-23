-- Premi riscattati con un buono in app, verificato alla cassa.
--
--   1. Il socio sceglie un premio in app (riscatta_premio): i punti si scalano
--      subito (movimento "riscatto") e nasce un buono con un codice di 8 caratteri.
--   2. In cassa il commesso apre /cassa, scrive o scansiona il codice
--      (verifica_buono) e lo segna come usato (usa_buono). Poi in ReadyPro batte
--      l'articolo "Premio PSC" con lo sconto.
--   3. Un buono vale impostazioni.buoni_giorni_validita giorni (30). Se scade o il
--      socio lo annulla, i punti tornano indietro con un movimento "rettifica".
-- ReadyPro non sa nulla dei buoni: i punti sono solo nell'app.

insert into public.impostazioni (chiave, valore, descrizione) values
  ('buoni_giorni_validita', '30',
   'Per quanti giorni vale un buono premio. Scaduto, i punti tornano al socio.')
on conflict (chiave) do nothing;

create table if not exists public.buoni (
  id               uuid primary key default gen_random_uuid(),
  -- 8 caratteri senza quelli che si confondono (0/O, 1/I/L): si mostra "ABCD-EFGH".
  codice           text not null unique check (codice ~ '^[A-Z2-9]{8}$'),
  socio_id         uuid not null references public.soci (id) on delete cascade,
  premio_id        uuid references public.premi (id) on delete set null,
  -- Copia del premio com'era al riscatto: se l'admin lo cambia, il buono resta quello.
  nome_premio      text not null,
  valore_euro      numeric(10, 2),
  punti            integer not null check (punti > 0),
  stato            text not null default 'attivo' check (stato in ('attivo', 'usato', 'annullato', 'scaduto')),
  creato_il        timestamptz not null default now(),
  scade_il         timestamptz not null,
  usato_il         timestamptz,
  usato_da         uuid references auth.users (id) on delete set null,
  negozio_id       uuid references public.negozi (id) on delete set null,
  chiuso_il        timestamptz,
  movimento_id     uuid references public.movimenti_punti (id) on delete set null,
  rimborso_id      uuid references public.movimenti_punti (id) on delete set null
);

create index if not exists buoni_socio on public.buoni (socio_id, creato_il desc);
create index if not exists buoni_attivi_scadenza on public.buoni (scade_il) where stato = 'attivo';

alter table public.buoni enable row level security;

drop policy if exists "buoni: il socio vede i propri" on public.buoni;
create policy "buoni: il socio vede i propri" on public.buoni
  for select to authenticated using (socio_id = public.socio_corrente_id());
drop policy if exists "buoni: l'admin vede tutti" on public.buoni;
create policy "buoni: l'admin vede tutti" on public.buoni
  for select to authenticated using (public.is_admin());
-- Nessuna scrittura diretta: solo dalle funzioni qui sotto.
grant select on public.buoni to authenticated;

-- Chiunque sia nella tabella staff, admin o operatore: serve solo alla cassa
-- (verifica e uso dei buoni). Tutto il resto dei dati è per gli admin: vedi
-- 20261123170000_operatori_solo_cassa.sql.
create or replace function public.is_personale()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff where user_id = auth.uid());
$$;

-- "abcd-efgh " → "ABCDEFGH"
create or replace function interno.codice_buono(p_testo text)
returns text language sql immutable set search_path = '' as $$
  select upper(regexp_replace(coalesce(p_testo, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

create or replace function interno.nuovo_codice_buono()
returns text language plpgsql volatile set search_path = '' as $$
declare
  v_alfabeto constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_codice   text;
  v_byte     bytea;
begin
  loop
    v_byte := extensions.gen_random_bytes(8);
    v_codice := '';
    for i in 0..7 loop
      v_codice := v_codice || substr(v_alfabeto, (get_byte(v_byte, i) % length(v_alfabeto)) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.buoni where codice = v_codice);
  end loop;
  return v_codice;
end;
$$;

-- Chiude un buono attivo (annullato o scaduto) e restituisce i punti.
create or replace function interno.chiudi_buono(p_id uuid, p_stato text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  b    public.buoni;
  v_id uuid;
begin
  select * into b from public.buoni where id = p_id and stato = 'attivo' for update;
  if not found then
    return;
  end if;
  insert into public.movimenti_punti (socio_id, punti, tipo, descrizione, premio_id, fonte, creato_da)
  values (b.socio_id, b.punti, 'rettifica',
          case p_stato when 'scaduto' then 'Buono scaduto: punti restituiti'
                       else 'Buono annullato: punti restituiti' end,
          b.premio_id, 'app', auth.uid())
  returning id into v_id;
  update public.buoni set stato = p_stato, chiuso_il = now(), rimborso_id = v_id where id = p_id;
end;
$$;

-- Buoni attivi oltre la scadenza → scaduti, con i punti restituiti.
create or replace function interno.scadi_buoni()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_n  int := 0;
begin
  for v_id in select id from public.buoni where stato = 'attivo' and scade_il < now() loop
    perform interno.chiudi_buono(v_id, 'scaduto');
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- Gli stessi, solo per il socio che sta usando l'app (lo chiama la pagina Punti):
-- così i punti tornano anche senza pg_cron.
create or replace function public.scadi_miei_buoni()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  for v_id in select id from public.buoni
              where socio_id = public.socio_corrente_id() and stato = 'attivo' and scade_il < now() loop
    perform interno.chiudi_buono(v_id, 'scaduto');
  end loop;
end;
$$;

-- Il socio riscatta un premio: punti scalati subito, nasce il buono.
create or replace function public.riscatta_premio(p_premio_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_socio   uuid := public.socio_corrente_id();
  v_premio  public.premi;
  v_giorni  int := coalesce((select (valore #>> '{}')::int from public.impostazioni where chiave = 'buoni_giorni_validita'), 30);
  v_mov     uuid;
  v_buono   public.buoni;
begin
  if v_socio is null then
    raise exception 'Collega prima la tessera.' using errcode = 'insufficient_privilege';
  end if;
  if not interno.punti_attivi(v_socio) then
    raise exception 'I premi si sbloccano quando un genitore approva la raccolta punti.';
  end if;
  select * into v_premio from public.premi where id = p_premio_id and attivo;
  if not found then
    raise exception 'Questo premio non è più disponibile.';
  end if;

  -- Il trigger sui movimenti blocca il riscatto se i punti non bastano.
  insert into public.movimenti_punti (socio_id, punti, tipo, descrizione, premio_id, fonte, creato_da)
  values (v_socio, -v_premio.soglia_punti, 'riscatto', v_premio.nome, v_premio.id, 'app', auth.uid())
  returning id into v_mov;

  insert into public.buoni (codice, socio_id, premio_id, nome_premio, valore_euro, punti, scade_il, movimento_id)
  values (interno.nuovo_codice_buono(), v_socio, v_premio.id, v_premio.nome, v_premio.valore_euro,
          v_premio.soglia_punti, now() + make_interval(days => v_giorni), v_mov)
  returning * into v_buono;

  return jsonb_build_object('id', v_buono.id, 'codice', v_buono.codice);
end;
$$;

-- Il socio annulla un suo buono non ancora usato: i punti tornano.
create or replace function public.annulla_buono(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.buoni
    where id = p_id and stato = 'attivo'
      and (socio_id = public.socio_corrente_id() or public.is_admin())
  ) then
    raise exception 'Questo buono non si può più annullare.';
  end if;
  perform interno.chiudi_buono(p_id, 'annullato');
end;
$$;

-- Cosa vede il commesso: il buono e di chi è.
create or replace function interno.scheda_buono(p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', b.id,
    'codice', b.codice,
    'stato', case when b.stato = 'attivo' and b.scade_il < now() then 'scaduto' else b.stato end,
    'premio', b.nome_premio,
    'valore_euro', b.valore_euro,
    'punti', b.punti,
    'creato_il', b.creato_il,
    'scade_il', b.scade_il,
    'usato_il', b.usato_il,
    'negozio', n.nome,
    'socio', concat_ws(' ', s.nome, s.cognome)
  )
  from public.buoni b
  join public.soci s on s.id = b.socio_id
  left join public.negozi n on n.id = b.negozio_id
  where b.id = p_id;
$$;

create or replace function public.verifica_buono(p_codice text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_personale() then
    raise exception 'Solo il personale dei negozi può verificare i buoni.' using errcode = 'insufficient_privilege';
  end if;
  select id into v_id from public.buoni where codice = interno.codice_buono(p_codice);
  if v_id is null then
    return null;
  end if;
  return interno.scheda_buono(v_id);
end;
$$;

create or replace function public.usa_buono(p_codice text, p_negozio_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.buoni;
begin
  if not public.is_personale() then
    raise exception 'Solo il personale dei negozi può usare i buoni.' using errcode = 'insufficient_privilege';
  end if;
  select * into b from public.buoni where codice = interno.codice_buono(p_codice) for update;
  if not found then
    raise exception 'Buono non trovato: controlla il codice.';
  end if;
  if b.stato = 'usato' then
    raise exception 'Buono già usato il %.', to_char(b.usato_il at time zone 'Europe/Rome', 'DD/MM/YYYY "alle" HH24:MI');
  end if;
  if b.stato = 'annullato' then
    raise exception 'Il socio ha annullato questo buono.';
  end if;
  if b.stato = 'scaduto' or b.scade_il < now() then
    raise exception 'Buono scaduto: i punti sono tornati al socio.';
  end if;

  update public.buoni set
    stato = 'usato',
    usato_il = now(),
    chiuso_il = now(),
    usato_da = auth.uid(),
    negozio_id = coalesce(public.staff_negozio_id(), p_negozio_id)
  where id = b.id;
  return interno.scheda_buono(b.id);
end;
$$;

revoke execute on all functions in schema interno from public;
revoke execute on function public.riscatta_premio(uuid), public.annulla_buono(uuid), public.scadi_miei_buoni(),
  public.verifica_buono(text), public.usa_buono(text, uuid) from public, anon;
grant execute on function public.riscatta_premio(uuid), public.annulla_buono(uuid), public.scadi_miei_buoni(),
  public.verifica_buono(text), public.usa_buono(text, uuid) to authenticated;

-- Ogni notte i buoni scaduti restituiscono i punti (se c'è pg_cron; vedi anche
-- la pulizia degli scontrini).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('psc-scadi-buoni', '20 2 * * *', 'select interno.scadi_buoni()');
  end if;
exception when others then
  raise notice 'pg_cron non disponibile (%): i buoni scaduti si chiudono quando il socio apre i punti.', sqlerrm;
end;
$$;
