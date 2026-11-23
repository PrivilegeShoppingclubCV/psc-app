-- La scheda socio degli operatori fa le stesse cose di quella admin (richiesta di
-- Daniele, 2026-11-23), tranne aggiungere o togliere punti e riscattare premi.
-- Si può eseguire anche più volte.
--
-- 1. Correzioni dei dati: admin e operatori passano dalla stessa funzione,
--    staff_aggiorna_socio, con gli stessi campi e le stesse regole. Quando cambia
--    un dato che ReadyPro conosce (nome, cognome, email, telefono, data di nascita,
--    indirizzo, CAP, città, negozio) la scheda riparte per ReadyPro con il prossimo
--    invio dello script, come le modifiche fatte dal socio in app. Prima le
--    correzioni dal pannello restavano solo nell'app.
-- 2. Email (anche di chi ha l'app) e unione dei doppioni: le funzioni admin_* ora
--    valgono per tutto il personale. Corpo identico a prima, cambia solo il controllo.
-- 3. personale_scheda_socio mostra anche i movimenti punti (solo lettura), gli
--    scontrini degli ultimi 30 giorni (senza l'operatore che li ha battuti) e le
--    schede da unire.

-- 2. Email e doppioni: stesso corpo, controllo richiedi_staff (admin e operatori)

create or replace function public.admin_cambia_email(p_socio_id uuid, p_email text)
returns public.soci
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := nullif(lower(btrim(p_email)), '');
  v_socio public.soci;
  v_altro public.soci;
begin
  perform interno.richiedi_staff();

  select * into v_socio from public.soci where id = p_socio_id for update;
  if not found then
    raise exception 'Socio non trovato.';
  end if;
  if v_email is not distinct from lower(btrim(v_socio.email)) then
    return v_socio;
  end if;

  if v_email is not null then
    if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'Controlla l''email: «%» non sembra un indirizzo valido.', v_email;
    end if;

    select * into v_altro from public.soci
    where lower(btrim(email)) = v_email and id <> p_socio_id
    limit 1;
    if found then
      raise exception 'L''email % è già sulla scheda di %: se è la stessa persona, unisci le due schede.',
        v_email, coalesce(nullif(btrim(concat_ws(' ', v_altro.nome, v_altro.cognome)), ''), 'un altro socio');
    end if;
  end if;

  -- Account dell'app: si cambia l'email di accesso senza mail di conferma.
  if v_socio.user_id is not null then
    if v_email is null then
      raise exception 'Il socio usa l''app con questa email: non si può lasciare vuota. Scrivi quella giusta.';
    end if;
    if exists (select 1 from auth.users where lower(email) = v_email and id <> v_socio.user_id) then
      raise exception 'Con l''email % c''è già un altro account dell''app: il socio deve accedere con quello, oppure scollega prima l''account da questa scheda.', v_email;
    end if;

    update auth.users set
      email = v_email,
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      -- Un eventuale cambio email chiesto dal socio e mai confermato si annulla.
      email_change = '',
      email_change_token_new = '',
      email_change_token_current = '',
      email_change_confirm_status = 0,
      updated_at = now()
    where id = v_socio.user_id;

    update auth.identities set
      identity_data = jsonb_set(coalesce(identity_data, '{}'::jsonb), '{email}', to_jsonb(v_email)),
      updated_at = now()
    where user_id = v_socio.user_id and provider = 'email';
  end if;

  update public.soci set
    email = v_email,
    email_sbagliata = case when v_socio.email is null then null else lower(btrim(v_socio.email)) end
  where id = p_socio_id
  returning * into v_socio;

  return v_socio;
end;
$$;

create or replace function public.admin_unisci_soci(p_tieni uuid, p_togli uuid)
returns public.soci
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tieni public.soci;
  v_togli public.soci;
  v_a     public.tessere;
  v_b     public.tessere;
begin
  perform interno.richiedi_staff();
  if p_tieni = p_togli then
    raise exception 'È lo stesso socio.';
  end if;
  -- Sempre nello stesso ordine, per non bloccarsi con un'unione al contrario.
  perform 1 from public.soci where id in (p_tieni, p_togli) order by id for update;
  select * into v_tieni from public.soci where id = p_tieni;
  select * into v_togli from public.soci where id = p_togli;
  if v_tieni.id is null or v_togli.id is null then
    raise exception 'Socio non trovato.';
  end if;
  if v_tieni.user_id is not null and v_togli.user_id is not null then
    raise exception 'Tutti e due hanno un account dell''app: scollega prima quello che non serve.';
  end if;

  select * into v_a from public.tessere where socio_id = p_tieni and stato = 'attiva';
  select * into v_b from public.tessere where socio_id = p_togli and stato = 'attiva';
  if v_a.id is not null and v_b.id is not null then
    if v_a.tipo = v_b.tipo then
      raise exception 'Tutti e due hanno una tessera % attiva: blocca prima quella da non tenere.', v_a.tipo;
    end if;
    update public.tessere set stato = 'bloccata', bloccata_il = now(),
      motivo_blocco = 'Unita alla tessera fisica ' || case when v_a.tipo = 'fisica' then v_a.codice else v_b.codice end
    where id = case when v_a.tipo = 'digitale' then v_a.id else v_b.id end;
  end if;

  update public.tessere set socio_id = p_tieni where socio_id = p_togli;

  -- Un solo saldo iniziale per socio: quello in più diventa una rettifica.
  if exists (select 1 from public.movimenti_punti where socio_id = p_tieni and tipo = 'saldo_iniziale') then
    update public.movimenti_punti
    set tipo = 'rettifica', descrizione = concat_ws(' ', descrizione, '(saldo iniziale di una scheda unita)')
    where socio_id = p_togli and tipo = 'saldo_iniziale';
  end if;
  update public.movimenti_punti set socio_id = p_tieni where socio_id = p_togli;
  update public.consensi set socio_id = p_tieni where socio_id = p_togli;
  update public.notifiche_dispositivi set socio_id = p_tieni where socio_id = p_togli;
  update public.import_righe set socio_id = p_tieni where socio_id = p_togli;

  delete from public.inviti
  where (invitante_id = p_togli and invitato_id = p_tieni) or (invitante_id = p_tieni and invitato_id = p_togli);
  if exists (select 1 from public.inviti where invitato_id = p_tieni) then
    delete from public.inviti where invitato_id = p_togli;
  else
    update public.inviti set invitato_id = p_tieni where invitato_id = p_togli;
  end if;
  update public.inviti set invitante_id = p_tieni where invitante_id = p_togli;

  delete from public.soci where id = p_togli;

  update public.soci set
    user_id              = coalesce(user_id, v_togli.user_id),
    nome                 = coalesce(nome, v_togli.nome),
    cognome              = coalesce(cognome, v_togli.cognome),
    email                = coalesce(nullif(btrim(email), ''), v_togli.email),
    telefono             = coalesce(telefono, v_togli.telefono),
    data_nascita         = coalesce(data_nascita, v_togli.data_nascita),
    cap                  = coalesce(cap, v_togli.cap),
    citta                = coalesce(citta, v_togli.citta),
    indirizzo            = coalesce(indirizzo, v_togli.indirizzo),
    negozio_preferito_id = coalesce(negozio_preferito_id, v_togli.negozio_preferito_id),
    iscritto_il          = least(iscritto_il, v_togli.iscritto_il),
    dati_gestionale      = v_togli.dati_gestionale || dati_gestionale,
    da_unire_con         = null,
    profilo_modificato_il = case
      -- Una delle due schede non aveva l'email: ReadyPro la riceve.
      when (nullif(btrim(email), '') is null) <> (nullif(btrim(v_togli.email), '') is null) then now()
      else profilo_modificato_il end
  where id = p_tieni
  returning * into v_tieni;
  return v_tieni;
end;
$$;

create or replace function public.admin_annulla_unione(p_socio_id uuid)
returns public.soci
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_socio public.soci;
begin
  perform interno.richiedi_staff();
  update public.soci set da_unire_con = null where id = p_socio_id returning * into v_socio;
  if not found then
    raise exception 'Socio non trovato.';
  end if;
  return v_socio;
end;
$$;

-- Unione partendo dal codice di una tessera dell'altra scheda (il personale non
-- legge la tabella tessere).
create or replace function public.staff_unisci_da_tessera(p_tieni uuid, p_codice text)
returns public.soci
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_togli uuid;
begin
  perform interno.richiedi_staff();
  select socio_id into v_togli from public.tessere
  where codice = interno.pulisci_codice(regexp_replace(coalesce(p_codice, ''), '\s', '', 'g'));
  if v_togli is null then
    raise exception 'Nessun socio ha la tessera %.', btrim(p_codice);
  end if;
  return public.admin_unisci_soci(p_tieni, v_togli);
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Correzioni dei dati, uguali per admin e operatori
-- ---------------------------------------------------------------------------

create or replace function public.staff_aggiorna_socio(
  p_id                   uuid,
  p_nome                 text,
  p_cognome              text,
  p_email                text,
  p_telefono             text,
  p_data_nascita         date,
  p_indirizzo            text,
  p_cap                  text,
  p_citta                text,
  p_livello              text,
  p_stato                text,
  p_negozio_preferito_id uuid
)
returns public.soci
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prima public.soci;
  v_dopo  public.soci;
begin
  perform interno.richiedi_staff();
  if p_stato is null or p_stato not in ('attivo', 'sospeso', 'cessato', 'in_attesa') then
    raise exception 'Stato non valido.';
  end if;
  if not exists (select 1 from public.livelli where codice = p_livello) then
    raise exception 'Livello non valido.';
  end if;
  select * into v_prima from public.soci where id = p_id for update;
  if not found then
    raise exception 'Socio non trovato.';
  end if;

  -- L'email passa da admin_cambia_email: se il socio ha l'app cambia anche
  -- l'indirizzo con cui entra, e l'import da ReadyPro non rimette quella vecchia.
  perform public.admin_cambia_email(p_id, p_email);

  update public.soci set
    nome                 = nullif(btrim(p_nome), ''),
    cognome              = nullif(btrim(p_cognome), ''),
    telefono             = nullif(btrim(p_telefono), ''),
    data_nascita         = p_data_nascita,
    indirizzo            = nullif(btrim(p_indirizzo), ''),
    cap                  = nullif(btrim(p_cap), ''),
    citta                = nullif(btrim(p_citta), ''),
    livello              = p_livello,
    stato                = p_stato,
    negozio_preferito_id = p_negozio_preferito_id
  where id = p_id
  returning * into v_dopo;

  -- Un dato che ReadyPro conosce è cambiato: la scheda riparte con il prossimo
  -- invio (gestionale_nuovi_iscritti), e l'import non la sovrascrive nel frattempo.
  if (v_prima.nome, v_prima.cognome, v_prima.email, v_prima.telefono, v_prima.data_nascita,
      v_prima.indirizzo, v_prima.cap, v_prima.citta, v_prima.negozio_preferito_id)
     is distinct from
     (v_dopo.nome, v_dopo.cognome, v_dopo.email, v_dopo.telefono, v_dopo.data_nascita,
      v_dopo.indirizzo, v_dopo.cap, v_dopo.citta, v_dopo.negozio_preferito_id) then
    update public.soci set profilo_modificato_il = now(), profilo_lotto_id = null
    where id = p_id
    returning * into v_dopo;
  end if;
  return v_dopo;
end;
$$;

-- Sostituita da staff_aggiorna_socio.
drop function if exists public.personale_aggiorna_socio(uuid, text, text, text, text, date, text, text, text, uuid);

-- ---------------------------------------------------------------------------
-- 3. Scheda per il personale
-- ---------------------------------------------------------------------------

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
      from public.tessere t where t.socio_id = s.id), '[]'::jsonb),
    'movimenti', coalesce((
      select jsonb_agg(x.m order by x.data_movimento desc)
      from (
        select m.data_movimento, jsonb_build_object(
                 'id', m.id, 'data_movimento', m.data_movimento, 'tipo', m.tipo, 'descrizione', m.descrizione,
                 'punti', m.punti, 'fonte', m.fonte, 'negozio', n.nome) as m
        from public.movimenti_punti m
        left join public.negozi n on n.id = m.negozio_id
        where m.socio_id = s.id
        order by m.data_movimento desc
        limit 100
      ) x), '[]'::jsonb),
    -- Senza l'operatore che ha battuto lo scontrino: quello resta all'amministrazione.
    'scontrini', coalesce((
      select jsonb_agg(jsonb_build_object(
               'numero_documento', c.numero_documento, 'data_scontrino', c.data_scontrino,
               'totale', c.totale, 'punti', c.punti, 'negozio', coalesce(n.nome, c.cassa))
             order by c.data_scontrino desc)
      from public.scontrini c
      left join public.negozi n on n.id = c.negozio_id
      where c.socio_id = s.id), '[]'::jsonb),
    -- Schede da unire: iscritto dall'app con il cellulare di una scheda senza email.
    'da_unire', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'nome', a.nome, 'cognome', a.cognome, 'email', a.email,
                                          'da_unire_con', a.da_unire_con))
      from public.soci a
      where (a.id = s.da_unire_con or a.da_unire_con = s.id) and a.id <> s.id), '[]'::jsonb)
  ) into v
  from public.soci s
  where s.id = p_id;
  return v;
end;
$$;

revoke execute on function public.staff_aggiorna_socio(uuid, text, text, text, text, date, text, text, text, text, text, uuid),
  public.staff_unisci_da_tessera(uuid, text), public.personale_scheda_socio(uuid),
  public.admin_cambia_email(uuid, text), public.admin_unisci_soci(uuid, uuid), public.admin_annulla_unione(uuid)
  from public, anon;
grant execute on function public.staff_aggiorna_socio(uuid, text, text, text, text, date, text, text, text, text, text, uuid),
  public.staff_unisci_da_tessera(uuid, text), public.personale_scheda_socio(uuid),
  public.admin_cambia_email(uuid, text), public.admin_unisci_soci(uuid, uuid), public.admin_annulla_unione(uuid)
  to authenticated;
