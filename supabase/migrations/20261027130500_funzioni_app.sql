-- Funzioni chiamate dall'app (supabase.rpc): collegare una tessera esistente,
-- iscriversi da zero, aggiornare il proprio profilo.
-- L'email arriva sempre dal login (magic link), mai da un campo del modulo:
-- così nessuno può collegare la tessera di un altro conoscendone l'email.

-- "Ho già la tessera": numero tessera + email lasciata in negozio.
create function public.collega_tessera(p_numero_tessera text)
returns public.soci
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(auth.jwt() ->> 'email');
  v_socio public.soci;
begin
  if auth.uid() is null or v_email is null then
    raise exception 'Accedi prima di collegare la tessera.' using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from public.soci where user_id = auth.uid()) then
    raise exception 'Il tuo account è già collegato a una tessera.';
  end if;

  select * into v_socio
  from public.soci
  where numero_tessera = btrim(p_numero_tessera)
    and lower(email) = v_email
    and stato = 'attivo'
  for update;

  -- Stesso messaggio per tessera inesistente ed email diversa: non si rivela
  -- quali numeri tessera esistono.
  if not found then
    raise exception 'Numero tessera ed email non corrispondono. Controlla i dati o chiedi in negozio.';
  end if;
  if v_socio.user_id is not null then
    raise exception 'Questa tessera è già collegata a un altro account. Chiedi in negozio.';
  end if;

  update public.soci set user_id = auth.uid() where id = v_socio.id returning * into v_socio;
  return v_socio;
end;
$$;

-- "Voglio iscrivermi": crea il socio con una tessera nuova, registra i consensi
-- e l'eventuale invito.
create function public.iscriviti(
  p_nome               text,
  p_cognome            text,
  p_accetta_privacy    boolean,
  p_consenso_marketing boolean default false,
  p_telefono           text default null,
  p_codice_invito      text default null,
  p_user_agent         text default null
)
returns public.soci
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email     text := lower(auth.jwt() ->> 'email');
  v_prefisso  text := (select valore #>> '{}' from public.impostazioni where chiave = 'tessera_app_prefisso');
  v_cifre     int  := (select (valore #>> '{}')::int from public.impostazioni where chiave = 'tessera_app_cifre');
  v_privacy   text := (select valore #>> '{}' from public.impostazioni where chiave = 'versione_privacy');
  v_marketing text := (select valore #>> '{}' from public.impostazioni where chiave = 'versione_marketing');
  v_invitante uuid;
  v_socio     public.soci;
begin
  if auth.uid() is null or v_email is null then
    raise exception 'Accedi prima di iscriverti.' using errcode = 'insufficient_privilege';
  end if;
  if not coalesce(p_accetta_privacy, false) then
    raise exception 'Per iscriversi serve la presa visione dell''informativa privacy.';
  end if;
  if nullif(btrim(p_nome), '') is null or nullif(btrim(p_cognome), '') is null then
    raise exception 'Nome e cognome sono obbligatori.';
  end if;
  if exists (select 1 from public.soci where user_id = auth.uid()) then
    raise exception 'Hai già una tessera.';
  end if;

  if nullif(btrim(p_codice_invito), '') is not null then
    select id into v_invitante
    from public.soci
    where codice_invito = upper(btrim(p_codice_invito)) and stato = 'attivo';
    if v_invitante is null then
      raise exception 'Codice invito non valido.';
    end if;
  end if;

  insert into public.soci (numero_tessera, user_id, nome, cognome, email, telefono, origine)
  values (
    coalesce(v_prefisso, 'APP') || lpad(nextval('public.tessere_app_seq')::text, coalesce(v_cifre, 6), '0'),
    auth.uid(),
    btrim(p_nome),
    btrim(p_cognome),
    v_email,
    nullif(btrim(p_telefono), ''),
    'app'
  )
  returning * into v_socio;

  insert into public.consensi (socio_id, tipo, concesso, versione_testo, canale, user_agent, registrato_da) values
    (v_socio.id, 'privacy', true, v_privacy, 'app', p_user_agent, auth.uid()),
    (v_socio.id, 'marketing', coalesce(p_consenso_marketing, false), v_marketing, 'app', p_user_agent, auth.uid());

  if v_invitante is not null then
    insert into public.inviti (invitante_id, invitato_id) values (v_invitante, v_socio.id);
  end if;

  return v_socio;
end;
$$;

-- Il socio modifica solo i propri recapiti; nome, email, livello e tessera
-- restano in mano al gestionale e agli admin.
create function public.aggiorna_profilo(
  p_telefono             text,
  p_data_nascita         date,
  p_cap                  text,
  p_citta                text,
  p_negozio_preferito_id uuid
)
returns public.soci
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_socio public.soci;
begin
  update public.soci set
    telefono = nullif(btrim(p_telefono), ''),
    data_nascita = p_data_nascita,
    cap = nullif(btrim(p_cap), ''),
    citta = nullif(btrim(p_citta), ''),
    negozio_preferito_id = p_negozio_preferito_id
  where user_id = auth.uid() and stato = 'attivo'
  returning * into v_socio;

  if not found then
    raise exception 'Nessuna tessera collegata al tuo account.';
  end if;
  return v_socio;
end;
$$;

revoke execute on function
  public.collega_tessera(text),
  public.iscriviti(text, text, boolean, boolean, text, text, text),
  public.aggiorna_profilo(text, date, text, text, uuid)
from public, anon;
grant execute on function
  public.collega_tessera(text),
  public.iscriviti(text, text, boolean, boolean, text, text, text),
  public.aggiorna_profilo(text, date, text, text, uuid)
to authenticated;
