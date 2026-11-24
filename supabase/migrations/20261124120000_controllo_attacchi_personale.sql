-- Controllo attacchi su punti e buoni (2026-11-24).
--
-- Punti e buoni reggono gli attacchi provati (riscatti in parallelo, buono
-- annullato due volte, prezzo del premio cambiato, punti scritti dal browser).
-- I punti deboli rimasti riguardano il personale dei negozi, che dalla PR #64 ha
-- la stessa scheda socio degli admin:
--
--   1. Un operatore poteva cambiare l'email di accesso di un socio che usa l'app,
--      senza conferma: poi entrava lui nell'account e spendeva i punti. Ora solo
--      gli admin cambiano l'email di chi ha l'app.
--   2. Nessuna traccia di chi unisce schede, collega account o cambia email,
--      livello e stato. Nuova tabella registro_personale (la vede solo l'admin).
--   3. Unendo due schede, i buoni della scheda tolta venivano cancellati (punti
--      già scalati, persi), con scontrini e segnalazioni. Ora si spostano.
--
-- Si può rieseguire.

create table if not exists public.registro_personale (
  id        bigint generated always as identity primary key,
  creato_il timestamptz not null default now(),
  user_id   uuid,
  ruolo     text,
  azione    text not null,
  socio_id  uuid,
  dettagli  jsonb not null default '{}'::jsonb
);
create index if not exists registro_personale_socio on public.registro_personale (socio_id, creato_il desc);
create index if not exists registro_personale_data on public.registro_personale (creato_il desc);

alter table public.registro_personale enable row level security;
drop policy if exists "registro_personale: solo admin" on public.registro_personale;
create policy "registro_personale: solo admin" on public.registro_personale
  for select to authenticated using ((select public.is_admin()));
-- Nessuna scrittura dal browser: solo dalle funzioni del database.
revoke all on public.registro_personale from anon, authenticated;
grant select on public.registro_personale to authenticated;

create or replace function interno.registra_personale(p_azione text, p_socio_id uuid, p_dettagli jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.registro_personale (user_id, ruolo, azione, socio_id, dettagli)
  values (auth.uid(), (select ruolo from public.staff where user_id = auth.uid()), p_azione, p_socio_id,
          coalesce(p_dettagli, '{}'::jsonb));
$$;

-- Ogni cambio di email, account collegato, livello o stato fatto da qualcuno
-- dentro l'app (non dagli import di ReadyPro, che non hanno un utente).
create or replace function interno.soci_registra_modifiche()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v jsonb := '{}'::jsonb;
begin
  if auth.uid() is null then
    return null;
  end if;
  if tg_op = 'DELETE' then
    perform interno.registra_personale('scheda_cancellata', old.id, jsonb_build_object(
      'nome', concat_ws(' ', old.nome, old.cognome), 'email', old.email, 'aveva_app', old.user_id is not null));
    return null;
  end if;
  if new.email is distinct from old.email then
    v := v || jsonb_build_object('email', jsonb_build_array(old.email, new.email));
  end if;
  if new.user_id is distinct from old.user_id then
    v := v || jsonb_build_object('account', jsonb_build_array(old.user_id, new.user_id));
  end if;
  if new.livello is distinct from old.livello then
    v := v || jsonb_build_object('livello', jsonb_build_array(old.livello, new.livello));
  end if;
  if new.stato is distinct from old.stato then
    v := v || jsonb_build_object('stato', jsonb_build_array(old.stato, new.stato));
  end if;
  if v <> '{}'::jsonb then
    perform interno.registra_personale('modifica_scheda', new.id, v);
  end if;
  return null;
end;
$$;

drop trigger if exists soci_registra_modifiche on public.soci;
create trigger soci_registra_modifiche
  after update of email, user_id, livello, stato or delete on public.soci
  for each row execute function interno.soci_registra_modifiche();

revoke execute on function interno.registra_personale(text, uuid, jsonb), interno.soci_registra_modifiche() from public;

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
    -- Cambiare l'email con cui il socio entra nell'app vuol dire dare a qualcun
    -- altro il suo account (e i suoi punti): solo gli admin.
    if not public.is_admin() and session_user = 'authenticator' then
      raise exception 'Il socio usa l''app con questa email: per cambiarla chiedi all''amministrazione.'
        using errcode = 'insufficient_privilege';
    end if;
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
  perform interno.registra_personale('unione_schede', p_tieni, jsonb_build_object(
    'scheda_tolta', p_togli,
    'nome_tolto', concat_ws(' ', v_togli.nome, v_togli.cognome),
    'email_tolta', v_togli.email,
    'tessere_tolte', (select jsonb_agg(codice) from public.tessere where socio_id = p_togli),
    'punti_spostati', (select coalesce(sum(punti), 0) from public.movimenti_punti where socio_id = p_togli)));
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
  -- Prima della cancellazione della scheda: senza questi spostamenti un buono
  -- attivo spariva (punti già scalati e persi), insieme a scontrini e segnalazioni.
  update public.buoni set socio_id = p_tieni where socio_id = p_togli;
  update public.scontrini set socio_id = p_tieni where socio_id = p_togli;
  update public.segnalazioni_dati set socio_id = p_tieni where socio_id = p_togli;
  update public.autorizzazioni_genitore set socio_id = p_tieni where socio_id = p_togli;

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
