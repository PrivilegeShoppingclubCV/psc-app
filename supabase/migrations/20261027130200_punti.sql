-- Punti: registro di movimenti. Il saldo non si salva mai, si calcola sommando.
-- I movimenti non si modificano e non si cancellano: un errore si corregge con
-- un movimento di "rettifica" o "storno" di segno opposto.

create table public.movimenti_punti (
  id                  uuid primary key default gen_random_uuid(),
  socio_id            uuid not null references public.soci (id) on delete cascade,
  punti               integer not null check (punti <> 0),
  tipo                text not null check (tipo in (
                        'saldo_iniziale', -- saldo portato dal gestionale al primo import
                        'acquisto',
                        'riscatto',       -- premio ritirato (punti negativi)
                        'bonus',
                        'invito',         -- premio per un invito andato a buon fine
                        'rettifica',
                        'storno',
                        'scadenza'
                      )),
  descrizione         text,
  negozio_id          uuid references public.negozi (id) on delete set null,
  importo_spesa       numeric(10, 2),
  premio_id           uuid references public.premi (id) on delete set null,
  fonte               text not null default 'app' check (fonte in ('app', 'gestionale', 'import', 'admin')),
  -- Id dello scontrino o del movimento nel gestionale: lo stesso movimento
  -- importato due volte viene scartato invece di raddoppiare i punti.
  riferimento_esterno text,
  import_batch_id     uuid,
  data_movimento      timestamptz not null default now(),
  creato_da           uuid references auth.users (id) on delete set null,
  creato_il           timestamptz not null default now(),
  unique (fonte, riferimento_esterno),
  check (tipo <> 'riscatto' or punti < 0)
);

create index movimenti_punti_socio_idx on public.movimenti_punti (socio_id, data_movimento desc);
-- Un solo saldo iniziale per socio.
create unique index movimenti_punti_saldo_iniziale_idx
  on public.movimenti_punti (socio_id) where tipo = 'saldo_iniziale';

-- Un riscatto non può portare il saldo sotto zero. Il lock per socio evita che
-- due riscatti contemporanei passino entrambi il controllo.
create function public.controlla_saldo_riscatto()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_saldo integer;
begin
  if new.tipo = 'riscatto' then
    perform pg_advisory_xact_lock(hashtext(new.socio_id::text));
    select coalesce(sum(punti), 0) into v_saldo
    from public.movimenti_punti where socio_id = new.socio_id;
    if v_saldo + new.punti < 0 then
      raise exception 'Punti insufficienti: saldo %, richiesti %.', v_saldo, -new.punti
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger movimenti_punti_controlla_saldo
  before insert on public.movimenti_punti
  for each row execute function public.controlla_saldo_riscatto();

create view public.saldi_punti
with (security_invoker = true)
as
select
  socio_id,
  sum(punti)::integer as saldo,
  max(data_movimento) as ultimo_movimento
from public.movimenti_punti
group by socio_id;

-- Negozio dell'operatore che sta usando l'app (null = admin o operatore di tutti i negozi).
create function public.staff_negozio_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select negozio_id from public.staff where user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.movimenti_punti enable row level security;

create policy "movimenti_punti: il socio vede i propri" on public.movimenti_punti
  for select to authenticated using (socio_id = public.socio_corrente_id());
create policy "movimenti_punti: lo staff vede tutti" on public.movimenti_punti
  for select to authenticated using (public.is_staff());

-- L'operatore registra acquisti, riscatti e bonus nel proprio negozio, a proprio nome.
create policy "movimenti_punti: l'operatore registra in cassa" on public.movimenti_punti
  for insert to authenticated
  with check (
    public.is_staff()
    and creato_da = auth.uid()
    and fonte = 'app'
    and tipo in ('acquisto', 'riscatto', 'bonus')
    and (public.staff_negozio_id() is null or negozio_id = public.staff_negozio_id())
  );
create policy "movimenti_punti: l'admin registra qualsiasi movimento" on public.movimenti_punti
  for insert to authenticated
  with check (public.is_admin() and creato_da = auth.uid());

-- Nessuna policy di update o delete: il registro è in sola aggiunta.

grant select, insert on public.movimenti_punti to authenticated;
grant select on public.saldi_punti to authenticated;
