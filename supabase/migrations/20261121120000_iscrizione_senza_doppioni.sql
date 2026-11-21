-- Iscrizioni senza doppioni.
--
-- Fino a ora "Iscriviti" controllava solo che l'account dell'app non avesse già una
-- tessera: chi era già socio in negozio (importato da ReadyPro) poteva crearsi una
-- seconda scheda con la stessa email, o con un'altra email. Da qui:
-- 1. iscriviti rifiuta un'email già di un socio (non cessato) e manda a collegare la
--    tessera;
-- 2. iscriviti rifiuta un cellulare già di un socio, confrontato senza spazi, trattini
--    e prefisso +39 / 0039;
-- 3. admin_possibili_doppioni elenca per il pannello le schede con stessa email,
--    stesso cellulare o stesso nome e cognome (in qualsiasi ordine), da unire a mano.

-- Il cellulare ridotto alle cifre, senza prefisso italiano: "+39 333 123 4567",
-- "0039 3331234567" e "333-1234567" diventano tutti 3331234567. Non dà mai errore:
-- i numeri importati possono essere scritti in qualsiasi modo.
create function interno.chiave_telefono(p_telefono text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when length(d) < 6 then null
    when d like '0039%' then substr(d, 5)
    when d like '39%' and length(d) = 12 then substr(d, 3)
    else d
  end
  from (select regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g') as d) x;
$$;
revoke execute on function interno.chiave_telefono(text) from public;

-- (Niente indice sul cellulare: i soci sono poche migliaia, il confronto è veloce.)
create index soci_email_pulita_idx on public.soci (lower(btrim(email)));

create or replace function public.iscriviti(
  p_nome               text,
  p_cognome            text,
  p_accetta_privacy    boolean,
  p_consenso_marketing boolean default false,
  p_telefono           text default null,
  p_codice_invito      text default null,
  p_user_agent         text default null,
  p_data_nascita       date default null,
  p_cap                text default null,
  p_citta              text default null
)
returns public.soci
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email     text := lower(auth.jwt() ->> 'email');
  v_privacy   text := (select valore #>> '{}' from public.impostazioni where chiave = 'versione_privacy');
  v_marketing text := (select valore #>> '{}' from public.impostazioni where chiave = 'versione_marketing');
  v_telefono  text;
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
  v_telefono := interno.pulisci_telefono(p_telefono);
  if v_telefono is null then
    raise exception 'Il numero di telefono è obbligatorio.';
  end if;
  perform interno.controlla_recapiti(p_data_nascita, p_cap, p_citta);
  if exists (select 1 from public.soci where user_id = auth.uid()) then
    raise exception 'Hai già una tessera.';
  end if;

  -- Una persona, una tessera: email e cellulare non devono essere già di un socio
  -- (anche importato da ReadyPro). Il "hint" dice all'app dove mandare il socio.
  if exists (
    select 1 from public.soci
    where lower(btrim(email)) = v_email and stato <> 'cessato'
  ) then
    raise exception 'Risulti già socio con questa email: scrivi il numero della tua tessera per collegarla all''app.'
      using hint = 'gia_socio_email';
  end if;
  if exists (
    select 1 from public.soci
    where interno.chiave_telefono(telefono) = interno.chiave_telefono(v_telefono) and stato <> 'cessato'
  ) then
    raise exception 'Questo cellulare risulta già associato a una tessera. Se è la tua, chiedi in negozio di collegarla all''app.'
      using hint = 'gia_socio_telefono';
  end if;

  if nullif(btrim(p_codice_invito), '') is not null then
    select id into v_invitante
    from public.soci
    where codice_invito = upper(btrim(p_codice_invito)) and stato = 'attivo';
    if v_invitante is null then
      raise exception 'Codice invito non valido.';
    end if;
  end if;

  insert into public.soci (user_id, nome, cognome, email, telefono, data_nascita, cap, citta, origine)
  values (auth.uid(), btrim(p_nome), btrim(p_cognome), v_email, v_telefono, p_data_nascita,
          nullif(btrim(p_cap), ''), nullif(btrim(p_citta), ''), 'app')
  returning * into v_socio;

  insert into public.tessere (codice, tipo, socio_id, stato_cassa, consegnata_il)
  values (interno.nuovo_codice_app(), 'digitale', v_socio.id, 'in_attivazione', now());

  insert into public.consensi (socio_id, tipo, concesso, versione_testo, canale, user_agent, registrato_da) values
    (v_socio.id, 'privacy', true, v_privacy, 'app', p_user_agent, auth.uid()),
    (v_socio.id, 'marketing', coalesce(p_consenso_marketing, false), v_marketing, 'app', p_user_agent, auth.uid());

  if v_invitante is not null then
    insert into public.inviti (invitante_id, invitato_id) values (v_invitante, v_socio.id);
  end if;

  return v_socio;
end;
$$;

-- Schede che potrebbero essere la stessa persona. Una riga per scheda: le schede
-- con lo stesso "gruppo" si somigliano per il "motivo" indicato.
create function public.admin_possibili_doppioni()
returns table (gruppo text, motivo text, socio_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform interno.richiedi_admin();
  return query
  with s as (
    select id,
      nullif(lower(btrim(email)), '') as email,
      interno.chiave_telefono(telefono) as tel,
      nullif(array_to_string(array(
        select w from unnest(regexp_split_to_array(lower(btrim(coalesce(nome, '') || ' ' || coalesce(cognome, ''))), '\s+')) w
        where w <> '' order by w
      ), ' '), '') as nome
    from public.soci
    where stato <> 'cessato'
  ),
  chiavi as (
    select 'email:' || email as g, 'Stessa email' as m, id from s where email is not null
    union all
    select 'tel:' || tel, 'Stesso cellulare', id from s where tel is not null
    union all
    select 'nome:' || nome, 'Stesso nome e cognome', id from s where nome is not null and nome like '% %'
  )
  select c.g, c.m, c.id
  from chiavi c
  where c.g in (select g from chiavi group by g having count(*) > 1)
  order by c.m, c.g;
end;
$$;
revoke execute on function public.admin_possibili_doppioni() from public, anon;
grant execute on function public.admin_possibili_doppioni() to authenticated;
