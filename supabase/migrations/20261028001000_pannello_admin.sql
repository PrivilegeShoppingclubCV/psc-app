-- Funzioni per il pannello admin (/admin).
--
-- Lo staff è legato agli account di auth.users, che l'app non può leggere:
-- queste funzioni mostrano le email e aggiungono una persona allo staff
-- partendo dalla sua email, solo se chi le chiama è admin.

-- Elenco dello staff con le email degli account. Vuoto per chi non è admin.
create function public.admin_elenco_staff()
returns table (
  user_id    uuid,
  email      text,
  ruolo      text,
  negozio_id uuid,
  negozio    text,
  nome       text,
  creato_il  timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.user_id, u.email::text, s.ruolo, s.negozio_id, n.nome, s.nome, s.creato_il
  from public.staff s
  join auth.users u on u.id = s.user_id
  left join public.negozi n on n.id = s.negozio_id
  where public.is_admin()
  order by s.ruolo, lower(u.email);
$$;

-- Aggiunge allo staff (o aggiorna) l'account con questa email.
-- L'account esiste dopo il primo accesso all'app con quell'email.
create function public.admin_aggiungi_staff(
  p_email      text,
  p_ruolo      text,
  p_negozio_id uuid default null,
  p_nome       text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Solo un admin può gestire lo staff.' using errcode = 'insufficient_privilege';
  end if;

  select id into v_user_id from auth.users where lower(email) = lower(btrim(p_email));
  if v_user_id is null then
    raise exception 'Nessun account con l''email %: la persona deve prima accedere una volta all''app con quell''email.', btrim(p_email)
      using errcode = 'no_data_found';
  end if;

  insert into public.staff (user_id, ruolo, negozio_id, nome)
  values (v_user_id, p_ruolo, p_negozio_id, nullif(btrim(p_nome), ''))
  on conflict (user_id) do update
    set ruolo = excluded.ruolo, negozio_id = excluded.negozio_id, nome = coalesce(excluded.nome, public.staff.nome);
  return v_user_id;
end;
$$;

revoke execute on function public.admin_elenco_staff(), public.admin_aggiungi_staff(text, text, uuid, text) from public, anon;
grant execute on function public.admin_elenco_staff(), public.admin_aggiungi_staff(text, text, uuid, text) to authenticated;

-- Deve restare sempre almeno un admin, altrimenti nessuno può più entrare nel pannello.
create function public.staff_tieni_un_admin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.ruolo = 'admin'
     and (tg_op = 'DELETE' or new.ruolo <> 'admin')
     and not exists (select 1 from public.staff where ruolo = 'admin' and user_id <> old.user_id) then
    raise exception 'Serve almeno un admin: nomina prima un altro admin.' using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger staff_tieni_un_admin
  before update of ruolo or delete on public.staff
  for each row execute function public.staff_tieni_un_admin();
