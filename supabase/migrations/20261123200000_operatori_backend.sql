-- Area operatori "limitata" (richiesta di Daniele, 2026-11-23).
--
-- Dopo 20261123170000 gli operatori vedevano solo la verifica dei buoni. Ora in
-- /cassa possono anche:
--   * cercare i soci e aprirne la scheda (dati, tessere, saldo punti);
--   * correggerne i dati anagrafici (nome, cognome, telefono, data di nascita,
--     indirizzo, negozio preferito; l'email solo se il socio non ha l'app);
--   * iscrivere un cliente nuovo con la tessera fisica, dare la tessera fisica a
--     un socio che ha solo l'app, bloccare una tessera persa.
-- Tutto passa da funzioni che controllano public.is_personale(): le tabelle
-- restano leggibili solo dagli admin (nessuna policy nuova), quindi un operatore
-- non vede movimenti, consensi, inviti, import né impostazioni. Livello, stato,
-- punti ed email di chi usa l'app restano dell'amministrazione.

-- Già creata in 20261123160000 (buoni premio): ripetuta qui perché il file
-- funzioni anche da solo. Admin o operatore, chiunque sia nella tabella staff.
create or replace function public.is_personale()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff where user_id = auth.uid());
$$;

-- Le funzioni delle tessere (staff_nuovo_socio_fisica, staff_assegna_tessera_fisica,
-- staff_blocca_tessera, staff_collega_account) tornano aperte a tutto il personale.
-- Magazzino e unione dei doppioni usano interno.richiedi_admin e restano agli admin.
create or replace function interno.richiedi_staff()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not (public.is_personale() or session_user <> 'authenticator') then
    raise exception 'Solo il personale dei negozi può gestire le tessere.' using errcode = 'insufficient_privilege';
  end if;
end;
$$;

create or replace function interno.richiedi_personale()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not public.is_personale() then
    raise exception 'Solo il personale dei negozi può vedere i soci.' using errcode = 'insufficient_privilege';
  end if;
end;
$$;

-- Ricerca: ogni parola deve comparire in una tessera, nel nome, nel cognome,
-- nell'email o nel telefono. Senza testo, i soci in ordine di cognome.
create or replace function public.personale_cerca_soci(p_testo text default null, p_limite int default 50, p_da int default 0)
returns table (
  id uuid, nome text, cognome text, email text, telefono text, fisica text, digitale text,
  stato text, ha_app boolean, in_attivazione boolean, saldo integer, totale bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_parole text[] := array(
    select p from unnest(regexp_split_to_array(btrim(regexp_replace(coalesce(p_testo, ''), '[,()*%\\_]', ' ', 'g')), '\s+')) p
    where p <> ''
  );
begin
  perform interno.richiedi_personale();
  return query
    select s.id, s.nome, s.cognome, s.email, s.telefono, s.fisica, s.digitale, s.stato,
           s.user_id is not null, s.in_attivazione, s.saldo, count(*) over ()
    from public.soci_con_tessere s
    where not exists (
      select 1 from unnest(v_parole) w
      where not (coalesce(s.codici, '') ilike '%' || w || '%'
              or coalesce(s.nome, '') ilike '%' || w || '%'
              or coalesce(s.cognome, '') ilike '%' || w || '%'
              or coalesce(s.email, '') ilike '%' || w || '%'
              or coalesce(s.telefono, '') ilike '%' || w || '%')
    )
    order by s.cognome nulls last, s.nome nulls last, s.id
    limit least(greatest(coalesce(p_limite, 50), 1), 100)
    offset greatest(coalesce(p_da, 0), 0);
end;
$$;

-- La scheda che vede l'operatore: anagrafica, tessere e saldo. Niente movimenti,
-- consensi o inviti.
create or replace function public.personale_scheda_socio(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  perform interno.richiedi_personale();
  select jsonb_build_object(
    'id', s.id, 'nome', s.nome, 'cognome', s.cognome, 'email', s.email, 'telefono', s.telefono,
    'data_nascita', s.data_nascita, 'indirizzo', s.indirizzo, 'cap', s.cap, 'citta', s.citta,
    'negozio_preferito_id', s.negozio_preferito_id, 'livello', s.livello, 'stato', s.stato,
    'origine', s.origine, 'iscritto_il', s.iscritto_il, 'ha_app', s.user_id is not null,
    'saldo', coalesce((select sum(m.punti) from public.movimenti_punti m where m.socio_id = s.id), 0)::int,
    'tessere', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id, 'codice', t.codice, 'tipo', t.tipo, 'stato', t.stato, 'stato_cassa', t.stato_cassa,
               'consegnata_il', t.consegnata_il, 'bloccata_il', t.bloccata_il, 'motivo_blocco', t.motivo_blocco)
             order by t.creato_il)
      from public.tessere t where t.socio_id = s.id), '[]'::jsonb)
  ) into v
  from public.soci s
  where s.id = p_id;
  return v;
end;
$$;

-- L'operatore corregge i dati del socio. L'email solo per chi non ha l'app: per
-- chi ce l'ha è l'indirizzo con cui entra, e la cambia l'amministrazione.
create or replace function public.personale_aggiorna_socio(
  p_id                   uuid,
  p_nome                 text,
  p_cognome              text,
  p_email                text,
  p_telefono             text,
  p_data_nascita         date,
  p_indirizzo            text,
  p_cap                  text,
  p_citta                text,
  p_negozio_preferito_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_socio public.soci;
  v_email text := nullif(lower(btrim(p_email)), '');
  v_altro public.soci;
begin
  perform interno.richiedi_personale();
  select * into v_socio from public.soci where id = p_id for update;
  if not found then
    raise exception 'Socio non trovato.';
  end if;
  if nullif(btrim(p_nome), '') is null or nullif(btrim(p_cognome), '') is null then
    raise exception 'Nome e cognome sono obbligatori.';
  end if;

  if v_email is distinct from nullif(lower(btrim(v_socio.email)), '') then
    if v_socio.user_id is not null then
      raise exception 'Il socio entra nell''app con questa email: per cambiarla chiedi all''amministrazione.';
    end if;
    if v_email is not null then
      if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        raise exception 'Controlla l''email: «%» non sembra un indirizzo valido.', v_email;
      end if;
      select * into v_altro from public.soci where lower(btrim(email)) = v_email and id <> p_id limit 1;
      if found then
        raise exception 'L''email % è già sulla scheda di un altro socio: avvisa l''amministrazione, potrebbe essere un doppione.', v_email;
      end if;
    end if;
    -- Come per l'admin: l'import da ReadyPro non rimette l'email vecchia.
    update public.soci set
      email = v_email,
      email_sbagliata = case when v_socio.email is null then null else lower(btrim(v_socio.email)) end
    where id = p_id;
  end if;

  update public.soci set
    nome                 = btrim(p_nome),
    cognome              = btrim(p_cognome),
    telefono             = nullif(btrim(p_telefono), ''),
    data_nascita         = p_data_nascita,
    indirizzo            = nullif(btrim(p_indirizzo), ''),
    cap                  = nullif(btrim(p_cap), ''),
    citta                = nullif(btrim(p_citta), ''),
    negozio_preferito_id = p_negozio_preferito_id
  where id = p_id;
end;
$$;

revoke execute on function interno.richiedi_personale() from public;
revoke execute on function public.personale_cerca_soci(text, int, int), public.personale_scheda_socio(uuid),
  public.personale_aggiorna_socio(uuid, text, text, text, text, date, text, text, text, uuid) from public, anon;
grant execute on function public.personale_cerca_soci(text, int, int), public.personale_scheda_socio(uuid),
  public.personale_aggiorna_socio(uuid, text, text, text, text, date, text, text, text, uuid) to authenticated;
