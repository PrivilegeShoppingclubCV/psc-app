-- Strumento "Foto prodotto ambientate" (repo psc-foto-prodotti, progetto Vercel a parte).
--
-- 1. foto_operatori: chi può usare lo strumento. Si entra con l'email (codice via
--    mail di Supabase Auth); l'admin aggiunge e disattiva le persone dal pannello.
--    Separato dallo staff: un operatore foto non vede nulla di soci e negozi.
-- 2. foto_generazioni: una riga per ogni foto generata, con chi, quando, quanto
--    ci ha messo, modello, esito, se ha sostituito una foto già sul sito e se è
--    stata caricata. Lo scrive il server dello strumento con il login della persona.
--
-- Le funzioni foto_* sono le sole porte per gli operatori: le tabelle le leggono
-- e le scrivono direttamente solo gli admin.

create table public.foto_operatori (
  id        uuid primary key default gen_random_uuid(),
  email     text not null,
  nome      text,
  attivo    boolean not null default true,
  creato_il timestamptz not null default now(),
  constraint foto_operatori_email_minuscola check (email = lower(trim(email)) and email like '%@%')
);
create unique index foto_operatori_email_idx on public.foto_operatori (email);

comment on table public.foto_operatori is 'Persone che possono generare le foto prodotto con lo strumento foto.';

create table public.foto_generazioni (
  id            bigint generated always as identity primary key,
  operatore_id  uuid references public.foto_operatori (id) on delete set null,
  email         text not null,
  ean           text not null,
  creata_il     timestamptz not null default now(),
  durata_ms     integer,
  modello       text,
  modello_testo text,
  esito         text not null check (esito in ('ok', 'errore')),
  errore        text,
  -- C'era già una foto sul sito per questo EAN e si è scelto di rifarla.
  sovrascritta  boolean not null default false,
  sul_sito      boolean not null default false,
  sul_sito_il   timestamptz,
  costo_eur     numeric(6, 3)
);
create index foto_generazioni_creata_idx on public.foto_generazioni (creata_il desc);
create index foto_generazioni_operatore_idx on public.foto_generazioni (operatore_id, creata_il desc);

comment on table public.foto_generazioni is 'Registro delle foto generate con lo strumento foto (una riga per tentativo).';

alter table public.foto_operatori enable row level security;
alter table public.foto_generazioni enable row level security;

create policy "foto_operatori: solo admin" on public.foto_operatori
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "foto_generazioni: solo admin" on public.foto_generazioni
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- L'operatore attivo che corrisponde all'email del login, se c'è.
create function interno.foto_operatore_corrente()
returns public.foto_operatori
language sql
stable
security definer
set search_path = ''
as $$
  select o.*
  from public.foto_operatori o
  where o.attivo
    and o.email = lower(coalesce(auth.jwt() ->> 'email', ''))
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  limit 1;
$$;

-- Chi sono? Lo strumento lo chiede dopo il login: null = non autorizzato.
create function public.foto_chi_sono()
returns table (id uuid, email text, nome text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.email, o.nome from interno.foto_operatore_corrente() o where o.id is not null;
$$;

-- Registra una generazione (chiamata dal server dello strumento dopo fal).
create function public.foto_registra(
  p_ean           text,
  p_esito         text,
  p_durata_ms     integer default null,
  p_modello       text default null,
  p_modello_testo text default null,
  p_errore        text default null,
  p_sovrascritta  boolean default false,
  p_costo_eur     numeric default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_op public.foto_operatori;
  v_id bigint;
begin
  v_op := interno.foto_operatore_corrente();
  if v_op.id is null then
    raise exception 'Non sei autorizzato a generare foto' using errcode = '42501';
  end if;
  if p_ean !~ '^\d{8,14}$' then
    raise exception 'EAN non valido' using errcode = '22023';
  end if;
  insert into public.foto_generazioni
    (operatore_id, email, ean, durata_ms, modello, modello_testo, esito, errore, sovrascritta, costo_eur)
  values
    (v_op.id, v_op.email, p_ean, p_durata_ms, left(p_modello, 120), left(p_modello_testo, 120),
     case when p_esito = 'ok' then 'ok' else 'errore' end, left(p_errore, 500),
     coalesce(p_sovrascritta, false), p_costo_eur)
  returning id into v_id;
  return v_id;
end;
$$;

-- Segna che la foto è stata caricata sul sito (solo sulle proprie righe).
create function public.foto_segna_sul_sito(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_op public.foto_operatori;
begin
  v_op := interno.foto_operatore_corrente();
  if v_op.id is null then
    raise exception 'Non sei autorizzato' using errcode = '42501';
  end if;
  update public.foto_generazioni
  set sul_sito = true, sul_sito_il = now()
  where id = p_id and operatore_id = v_op.id;
end;
$$;

-- Riepilogo per il pannello: una riga per persona dal momento indicato (null = sempre).
create function public.admin_foto_riepilogo(p_da timestamptz default null)
returns table (
  operatore_id   uuid,
  email          text,
  nome           text,
  generate       bigint,
  errori         bigint,
  sovrascritte   bigint,
  sul_sito       bigint,
  costo_eur      numeric,
  durata_media_s numeric,
  prima          timestamptz,
  ultima         timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    g.operatore_id,
    max(g.email),
    max(o.nome),
    count(*) filter (where g.esito = 'ok'),
    count(*) filter (where g.esito = 'errore'),
    count(*) filter (where g.esito = 'ok' and g.sovrascritta),
    count(*) filter (where g.sul_sito),
    coalesce(sum(g.costo_eur) filter (where g.esito = 'ok'), 0),
    round(avg(g.durata_ms) filter (where g.esito = 'ok') / 1000.0, 1),
    min(g.creata_il),
    max(g.creata_il)
  from public.foto_generazioni g
  left join public.foto_operatori o on o.id = g.operatore_id
  where public.is_admin()
    and (p_da is null or g.creata_il >= p_da)
  group by g.operatore_id
  order by count(*) filter (where g.esito = 'ok') desc;
$$;

revoke execute on function interno.foto_operatore_corrente() from public, anon, authenticated;
revoke execute on function public.foto_chi_sono(), public.foto_registra(text, text, integer, text, text, text, boolean, numeric),
  public.foto_segna_sul_sito(bigint), public.admin_foto_riepilogo(timestamptz) from public, anon;
grant execute on function public.foto_chi_sono(), public.foto_registra(text, text, integer, text, text, text, boolean, numeric),
  public.foto_segna_sul_sito(bigint), public.admin_foto_riepilogo(timestamptz) to authenticated;
