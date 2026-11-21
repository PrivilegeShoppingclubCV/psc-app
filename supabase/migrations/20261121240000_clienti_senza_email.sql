-- Clienti di ReadyPro con tessera (e spesso cellulare) ma senza email.
--
-- Non si aggiunge un collegamento "tessera + cellulare": il cellulare non lo
-- possiamo verificare. Il pregresso si sistema così:
-- 1. "Clienti da completare" elenca anche chi non ha l'email, così il personale
--    la aggiunge in ReadyPro (e mostra l'email che il socio ha già nell'app).
-- 2. Se uno di loro prova a collegare la tessera nell'app, il messaggio lo manda
--    in negozio: alla cassa il commesso collega la tessera con il codice e la
--    scheda prende l'email dell'account.
-- 3. Quando il commesso collega l'account e la scheda non aveva un'email,
--    l'email nuova va anche a ReadyPro con il prossimo invio dei nuovi iscritti.

-- 2. Messaggio più chiaro (resta uguale per tessera inesistente ed email
--    diversa, così non si rivela quali tessere esistono).
create or replace function public.collega_tessera(p_numero_tessera text)
returns public.soci
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email    text := lower(auth.jwt() ->> 'email');
  v_digitato text := interno.pulisci_codice(regexp_replace(coalesce(p_numero_tessera, ''), '[-.]', '', 'g'));
  v_socio    public.soci;
begin
  if auth.uid() is null or v_email is null then
    raise exception 'Accedi prima di collegare la tessera.' using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from public.soci where user_id = auth.uid()) then
    raise exception 'Il tuo account è già collegato a una tessera.';
  end if;

  -- Prima il numero esatto, poi quello "simile" (zeri iniziali, cifra EAN).
  select s.* into v_socio
  from public.tessere t
  join public.soci s on s.id = t.socio_id
  where lower(btrim(s.email)) = v_email
    and s.stato = 'attivo'
    and t.stato = 'attiva'
    and interno.stesso_numero_tessera(t.codice, v_digitato)
  order by (t.codice = v_digitato) desc, s.user_id is null desc
  limit 1
  for update of s;

  -- Stesso messaggio per tessera inesistente ed email diversa: non si rivela
  -- quali numeri tessera esistono.
  if not found then
    raise exception 'Numero tessera ed email non corrispondono. Se in negozio non hai lasciato un''email, o ne hai lasciata un''altra, tocca "In negozio non ho lasciato questa email" e mostra il codice alla cassa: colleghiamo la tessera e aggiorniamo la tua email.';
  end if;
  if v_socio.user_id is not null then
    raise exception 'Questa tessera è già collegata a un altro account. Chiedi in negozio.';
  end if;

  update public.soci set user_id = auth.uid() where id = v_socio.id returning * into v_socio;
  return v_socio;
end;
$$;

-- 3. Collegamento in negozio: l'email presa dal login va anche a ReadyPro.
create or replace function public.staff_collega_account(p_socio_id uuid, p_codice text)
returns public.soci
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_richiesta public.codici_collegamento;
  v_socio     public.soci;
begin
  perform interno.richiedi_staff();
  select * into v_richiesta from public.codici_collegamento
  where codice = upper(interno.pulisci_codice(p_codice)) and scade_il > now()
  for update;
  if not found then
    raise exception 'Codice sbagliato o scaduto: fallo rigenerare nell''app.';
  end if;
  if exists (select 1 from public.soci where user_id = v_richiesta.user_id) then
    raise exception 'Questo account è già collegato a un altro socio.';
  end if;

  select * into v_socio from public.soci where id = p_socio_id for update;
  if not found then
    raise exception 'Socio non trovato.';
  elsif v_socio.user_id is not null then
    raise exception 'Questo socio ha già un account dell''app: scollegalo prima.';
  end if;

  update public.soci set
    user_id = v_richiesta.user_id,
    email = coalesce(nullif(btrim(email), ''), v_richiesta.email),
    -- Scheda senza email: con il prossimo invio a ReadyPro arriva anche quella.
    profilo_modificato_il = case when nullif(btrim(email), '') is null then now() else profilo_modificato_il end
  where id = p_socio_id
  returning * into v_socio;
  delete from public.codici_collegamento where codice = v_richiesta.codice;
  return v_socio;
end;
$$;

-- 1. Clienti da completare: ora conta anche l'email mancante. "email_app" è
--    l'email che il socio ha nell'app (se ha già collegato la tessera), da
--    copiare in ReadyPro.
drop function public.admin_clienti_da_completare(date);
create function public.admin_clienti_da_completare(p_dal date default '2023-12-07')
returns table (
  id_readypro text, cognome text, nome text, email text, cellulare text,
  tessera text, iscritto_il date, manca text, telefono_app text, email_app text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_mappa jsonb := coalesce(
    nullif((select valore from public.impostazioni where chiave = 'gestionale_mappatura_soci'), '{}'::jsonb),
    (select mappatura_colonne from public.import_batch where tipo = 'soci' order by creato_il desc limit 1),
    '{}');
begin
  perform interno.richiedi_admin();
  if v_mappa ->> 'iscritto_il' is null then
    v_mappa := v_mappa || '{"iscritto_il": "Dett."}';
  end if;
  return query
  with ultime as (
    select distinct on (coalesce(r.dati ->> 'ID', r.id::text)) r.dati
    from public.import_righe r
    join public.import_batch b on b.id = r.batch_id
    where b.tipo = 'soci'
    order by coalesce(r.dati ->> 'ID', r.id::text), b.creato_il desc, r.numero_riga desc
  ),
  c as (
    select
      u.dati ->> 'ID' as id_rp,
      interno.import_testo(u.dati, v_mappa, 'cognome') as cog,
      interno.import_testo(u.dati, v_mappa, 'nome') as nom,
      lower(interno.import_testo(u.dati, v_mappa, 'email')) as mail,
      interno.import_testo(u.dati, v_mappa, 'telefono') as tel,
      interno.pulisci_codice(interno.import_testo(u.dati, v_mappa, 'numero_tessera')) as tes,
      interno.data_o_null(interno.import_testo(u.dati, v_mappa, 'iscritto_il')) as dal
    from ultime u
  )
  select c.id_rp, interno.testo_elegante(c.cog), interno.testo_elegante(c.nom), c.mail, c.tel, c.tes, c.dal,
    concat_ws(', ',
      case when c.mail is null then 'email' end,
      case when c.tel is null then 'cellulare' end,
      case when c.tes is null then 'tessera' end),
    s.telefono,
    case when c.mail is null then s.email end
  from c
  left join lateral (
    select so.telefono, so.email
    from public.tessere t join public.soci so on so.id = t.socio_id
    where c.tes is not null and t.codice = c.tes
    limit 1
  ) s on true
  where c.cog is not null and c.nom is not null
    -- Almeno un recapito o la tessera: senza nessuno dei tre non si sa chi sia.
    and (c.mail is not null or c.tel is not null or c.tes is not null)
    -- Ordini dei marketplace: ReadyPro li registra come clienti con un'email finta.
    and coalesce(c.mail, '') !~ '@(marketplace\.amazon\.|members\.ebay\.)'
    and (c.mail is null or c.tel is null or c.tes is null)
    and c.dal >= p_dal
  order by c.dal desc, c.cog, c.nom;
end;
$$;
revoke execute on function public.admin_clienti_da_completare(date) from public, anon;
grant execute on function public.admin_clienti_da_completare(date) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Chi ha la tessera ma non l'email può iscriversi normalmente dall'app.
--
-- Il suo cellulare è già sulla scheda importata da ReadyPro, quindi il
-- controllo "cellulare unico" lo bloccava. Ora, se il cellulare è solo su
-- schede senza email e senza account dell'app, l'iscrizione passa: la scheda
-- nuova ricorda con quale va unita ("da_unire_con") e la sua tessera digitale
-- non va a ReadyPro finché in negozio non si fa "Unisci un doppione" (o si
-- dice che non è la stessa persona). Così in ReadyPro non nasce un doppione.
-- ---------------------------------------------------------------------------

alter table public.soci
  add column da_unire_con uuid references public.soci (id) on delete set null;
comment on column public.soci.da_unire_con is
  'Iscritto dall''app con il cellulare di una scheda senza email: da unire in negozio a questa scheda.';

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
  p_citta              text default null,
  p_indirizzo          text default null
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
  v_eta       integer;
  v_socio     public.soci;
  v_unire     uuid;
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
  if p_data_nascita is null then
    raise exception 'La data di nascita è obbligatoria.';
  end if;
  perform interno.controlla_recapiti(p_data_nascita, p_cap, p_citta);
  v_eta := interno.eta(p_data_nascita);
  if nullif(btrim(p_indirizzo), '') is null then
    raise exception 'L''indirizzo è obbligatorio.';
  end if;
  perform interno.controlla_indirizzo(p_indirizzo);
  if nullif(btrim(p_cap), '') is null then
    raise exception 'Il CAP è obbligatorio.';
  end if;
  if nullif(btrim(p_citta), '') is null then
    raise exception 'La città è obbligatoria.';
  end if;
  if exists (select 1 from public.soci where user_id = auth.uid()) then
    raise exception 'Hai già una tessera.';
  end if;

  if exists (
    select 1 from public.soci
    where lower(btrim(email)) = v_email and stato <> 'cessato'
  ) then
    raise exception 'Risulti già socio con questa email: scrivi il numero della tua tessera per collegarla all''app.'
      using hint = 'gia_socio_email';
  end if;
  -- Cellulare già su una scheda con email o con l'app: è un altro socio (o lo
  -- stesso, che deve collegare la tessera). Se è solo su schede senza email,
  -- l'iscrizione passa e la scheda si unisce poi in negozio.
  if exists (
    select 1 from public.soci
    where interno.chiave_telefono(telefono) = interno.chiave_telefono(v_telefono) and stato <> 'cessato'
      and (nullif(btrim(email), '') is not null or user_id is not null)
  ) then
    raise exception 'Questo cellulare risulta già associato a una tessera. Se è la tua, chiedi in negozio di collegarla all''app.'
      using hint = 'gia_socio_telefono';
  end if;
  select id into v_unire
  from public.soci
  where interno.chiave_telefono(telefono) = interno.chiave_telefono(v_telefono) and stato <> 'cessato'
  order by iscritto_il
  limit 1;

  if nullif(btrim(p_codice_invito), '') is not null then
    select id into v_invitante
    from public.soci
    where codice_invito = upper(btrim(p_codice_invito)) and stato = 'attivo';
    if v_invitante is null then
      raise exception 'Codice invito non valido.';
    end if;
  end if;

  insert into public.soci (user_id, nome, cognome, email, telefono, data_nascita, indirizzo, cap, citta, origine,
                           stato, punti_attivi, da_unire_con)
  values (auth.uid(), btrim(p_nome), btrim(p_cognome), v_email, v_telefono, p_data_nascita,
          btrim(p_indirizzo), btrim(p_cap), btrim(p_citta), 'app',
          case when v_eta < 14 then 'in_attesa' else 'attivo' end,
          v_eta >= 18, v_unire)
  returning * into v_socio;

  insert into public.tessere (codice, tipo, socio_id, stato_cassa, consegnata_il)
  values (interno.nuovo_codice_app(), 'digitale', v_socio.id, 'in_attivazione', now());

  -- Sotto i 14 anni la privacy la approva il genitore; sotto i 18 le offerte pure.
  if v_eta >= 14 then
    insert into public.consensi (socio_id, tipo, concesso, versione_testo, canale, user_agent, registrato_da)
    values (v_socio.id, 'privacy', true, v_privacy, 'app', p_user_agent, auth.uid());
  end if;
  insert into public.consensi (socio_id, tipo, concesso, versione_testo, canale, user_agent, registrato_da)
  values (v_socio.id, 'marketing', v_eta >= 18 and coalesce(p_consenso_marketing, false), v_marketing, 'app', p_user_agent, auth.uid());

  if v_invitante is not null then
    insert into public.inviti (invitante_id, invitato_id) values (v_invitante, v_socio.id);
  end if;

  return v_socio;
end;
$$;


-- La tessera digitale di chi è da unire non va a ReadyPro.
create or replace function public.gestionale_nuovi_iscritti(p_chiave text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chiave_id uuid := interno.gestionale_verifica_chiave(p_chiave);
  v_lotto_id  uuid;
  v_righe     jsonb;
  v_tessere   boolean;
  v_profili   boolean;
begin
  perform 1 from public.tessere t
  join public.soci s on s.id = t.socio_id
  where t.stato_cassa = 'in_attivazione' and t.stato = 'attiva' and s.stato = 'attivo' and s.da_unire_con is null
    and (t.lotto_cassa_id is null
         or exists (select 1 from public.gestionale_lotti l where l.id = t.lotto_cassa_id and l.confermato_il is null))
  for update of t;
  v_tessere := found;

  -- Recapiti modificati in app e non ancora consegnati a ReadyPro.
  perform 1 from public.soci s
  where s.stato = 'attivo' and s.profilo_modificato_il is not null
    and (s.profilo_lotto_id is null
         or exists (select 1 from public.gestionale_lotti l where l.id = s.profilo_lotto_id and l.confermato_il is null))
  for update of s;
  v_profili := found;

  if not v_tessere and not v_profili then
    return jsonb_build_object('lotto', null, 'righe', '[]'::jsonb);
  end if;

  insert into public.gestionale_lotti (chiave_id, righe) values (v_chiave_id, 0) returning id into v_lotto_id;

  update public.tessere t set lotto_cassa_id = v_lotto_id
  from public.soci s
  where s.id = t.socio_id
    and t.stato_cassa = 'in_attivazione' and t.stato = 'attiva' and s.stato = 'attivo' and s.da_unire_con is null
    and (t.lotto_cassa_id is null
         or exists (select 1 from public.gestionale_lotti l where l.id = t.lotto_cassa_id and l.confermato_il is null));

  update public.soci s set profilo_lotto_id = v_lotto_id
  where s.stato = 'attivo' and s.profilo_modificato_il is not null
    and (s.profilo_lotto_id is null
         or exists (select 1 from public.gestionale_lotti l where l.id = s.profilo_lotto_id and l.confermato_il is null));

  with righe as (
    -- Tessere nuove (con i recapiti di oggi del socio).
    select t.id as tessera_id, t.sostituisce_id, t.creato_il as ordine
    from public.tessere t
    where t.lotto_cassa_id = v_lotto_id
    union all
    -- Recapiti modificati: una riga con la tessera attiva del socio, se non c'è
    -- già una tessera nuova dello stesso socio nel lotto (che porta già i dati).
    select x.id, null, x.profilo_modificato_il
    from (
      select distinct on (s.id) t.id, s.profilo_modificato_il
      from public.soci s
      join public.tessere t on t.socio_id = s.id and t.stato = 'attiva'
      where s.profilo_lotto_id = v_lotto_id
        and not exists (select 1 from public.tessere n where n.socio_id = s.id and n.lotto_cassa_id = v_lotto_id)
      order by s.id, (t.tipo = 'fisica') desc, t.creato_il desc
    ) x
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'numero_tessera', t.codice,
      'tipo_tessera', t.tipo,
      'tessera_precedente', p.codice,
      'cognome', s.cognome,
      'nome', s.nome,
      'email', s.email,
      'telefono', s.telefono,
      'data_nascita', to_char(s.data_nascita, 'DD/MM/YYYY'),
      'cap', s.cap,
      'citta', s.citta,
      'indirizzo', s.indirizzo,
      'negozio', n.codice_gestionale,
      'iscritto_il', to_char(s.iscritto_il, 'DD/MM/YYYY'),
      'consenso_privacy', case cp.concesso when true then 'SI' when false then 'NO' end,
      'consenso_marketing', case cm.concesso when true then 'SI' when false then 'NO' end
    ) order by r.ordine), '[]'::jsonb)
  into v_righe
  from righe r
  join public.tessere t on t.id = r.tessera_id
  join public.soci s on s.id = t.socio_id
  left join public.tessere p on p.id = r.sostituisce_id
  left join public.negozi n on n.id = s.negozio_preferito_id
  left join public.consensi_attuali cp on cp.socio_id = s.id and cp.tipo = 'privacy'
  left join public.consensi_attuali cm on cm.socio_id = s.id and cm.tipo = 'marketing';

  update public.gestionale_lotti set righe = jsonb_array_length(v_righe) where id = v_lotto_id;
  return jsonb_build_object('lotto', v_lotto_id, 'righe', v_righe);
end;
$$;


-- Unione in negozio: la scheda che resta non è più "da unire"; se prende
-- l'email dall'altra scheda, l'email va anche a ReadyPro. Ora copia anche l'indirizzo.
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
  perform interno.richiedi_admin();
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


-- "Non è la stessa persona": la scheda nuova resta da sola e la sua tessera
-- digitale parte per ReadyPro con il prossimo invio.
create function public.admin_annulla_unione(p_socio_id uuid)
returns public.soci
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_socio public.soci;
begin
  perform interno.richiedi_admin();
  update public.soci set da_unire_con = null where id = p_socio_id returning * into v_socio;
  if not found then
    raise exception 'Socio non trovato.';
  end if;
  return v_socio;
end;
$$;
revoke execute on function public.admin_annulla_unione(uuid) from public, anon;
grant execute on function public.admin_annulla_unione(uuid) to authenticated;
