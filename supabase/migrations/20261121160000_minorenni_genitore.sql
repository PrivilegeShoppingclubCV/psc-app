-- Iscrizione dei minorenni con l'approvazione di un genitore.
--
-- Decisione di Daniele (2026-11-21):
-- - dai 18 anni: iscrizione normale;
-- - da 14 a 17 anni: ci si iscrive (la privacy la accetta il ragazzo), ma la
--   raccolta punti e le offerte (marketing) restano spente finché un genitore
--   non le approva;
-- - sotto i 14 anni: anche l'iscrizione (privacy) la approva il genitore. Fino ad
--   allora la scheda è "in_attesa": niente tessera in app, niente invio a ReadyPro.
--
-- Il ragazzo, dall'app, crea un link e lo manda al genitore (WhatsApp, SMS...).
-- Il genitore apre il link, scrive nome, cognome ed email, dichiara di essere
-- genitore o tutore e sceglie cosa approvare. Si registra chi ha approvato, cosa
-- e quando (tabella autorizzazioni_genitore + consensi con canale 'genitore').
-- Il link vale 30 giorni e una sola volta; nel database c'è solo il suo hash.
--
-- A 18 anni compiuti la raccolta punti si accende da sola; le offerte no (serve
-- il consenso del socio).

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

alter table public.soci drop constraint soci_stato_check;
alter table public.soci add constraint soci_stato_check
  check (stato in ('attivo', 'sospeso', 'cessato', 'in_attesa'));
comment on column public.soci.stato is
  'attivo | sospeso | cessato | in_attesa (minore di 14 anni iscritto in app, aspetta l''approvazione del genitore)';

alter table public.soci add column punti_attivi boolean not null default true;
comment on column public.soci.punti_attivi is
  'false = minorenne senza approvazione del genitore alla raccolta punti: le vendite non danno punti.';

alter table public.consensi drop constraint consensi_canale_check;
alter table public.consensi add constraint consensi_canale_check
  check (canale in ('app', 'negozio', 'import', 'admin', 'genitore'));

create table public.autorizzazioni_genitore (
  id                uuid primary key default gen_random_uuid(),
  socio_id          uuid not null references public.soci (id) on delete cascade,
  token_hash        text not null unique,
  creato_il         timestamptz not null default now(),
  scade_il          timestamptz not null default now() + interval '30 days',
  -- Compilati quando il genitore approva.
  approvato_il      timestamptz,
  genitore_nome     text,
  genitore_cognome  text,
  genitore_email    text,
  approva_iscrizione boolean,
  approva_punti     boolean,
  approva_marketing boolean,
  user_agent        text
);
comment on table public.autorizzazioni_genitore is
  'Link mandati dai soci minorenni ai genitori e approvazioni ricevute (chi, cosa, quando).';
create index autorizzazioni_genitore_socio_idx on public.autorizzazioni_genitore (socio_id, creato_il desc);

alter table public.autorizzazioni_genitore enable row level security;
-- Il socio vede le proprie richieste (per sapere se il genitore ha approvato),
-- lo staff le vede tutte. Si scrive solo con le funzioni qui sotto.
create policy "autorizzazioni_genitore: il socio vede le proprie" on public.autorizzazioni_genitore
  for select to authenticated
  using (socio_id in (select id from public.soci where user_id = auth.uid()));
create policy "autorizzazioni_genitore: lo staff vede tutte" on public.autorizzazioni_genitore
  for select to authenticated using (public.is_staff());
grant select on public.autorizzazioni_genitore to authenticated;

-- ---------------------------------------------------------------------------
-- Età
-- ---------------------------------------------------------------------------

create function interno.eta(p_data_nascita date)
returns integer language sql stable set search_path = '' as $$
  select extract(year from age(current_date, p_data_nascita))::integer;
$$;

-- Punti accesi: approvati (o socio adulto/importato) oppure 18 anni compiuti.
create function interno.punti_attivi(p_socio_id uuid)
returns boolean language sql stable set search_path = '' as $$
  select coalesce(s.punti_attivi or (s.data_nascita is not null and interno.eta(s.data_nascita) >= 18), true)
  from public.soci s where s.id = p_socio_id;
$$;

-- Un minorenne non può darsi da solo il consenso alle offerte dall'app.
create function interno.blocca_marketing_minorenni()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.canale = 'app' and new.concesso and new.tipo in ('marketing', 'profilazione')
     and exists (select 1 from public.soci s
                 where s.id = new.socio_id and s.data_nascita is not null and interno.eta(s.data_nascita) < 18) then
    raise exception 'Per le offerte serve l''approvazione di un genitore.';
  end if;
  return new;
end;
$$;
create trigger consensi_blocca_marketing_minorenni
  before insert on public.consensi
  for each row execute function interno.blocca_marketing_minorenni();

revoke execute on all functions in schema interno from public;

-- ---------------------------------------------------------------------------
-- Iscrizione: come 20261121140000, con le regole per i minorenni
-- ---------------------------------------------------------------------------

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

  insert into public.soci (user_id, nome, cognome, email, telefono, data_nascita, indirizzo, cap, citta, origine,
                           stato, punti_attivi)
  values (auth.uid(), btrim(p_nome), btrim(p_cognome), v_email, v_telefono, p_data_nascita,
          btrim(p_indirizzo), btrim(p_cap), btrim(p_citta), 'app',
          case when v_eta < 14 then 'in_attesa' else 'attivo' end,
          v_eta >= 18)
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

-- ---------------------------------------------------------------------------
-- Link per il genitore
-- ---------------------------------------------------------------------------

-- Il socio minorenne crea un link da mandare al genitore. Restituisce il codice
-- da mettere nell'indirizzo /genitore/<codice> (nel database resta solo l'hash).
create function public.crea_link_genitore()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_socio public.soci;
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  select * into v_socio from public.soci
  where user_id = auth.uid() and stato in ('attivo', 'in_attesa');
  if not found then
    raise exception 'Nessuna tessera collegata al tuo account.';
  end if;
  if v_socio.data_nascita is null or interno.eta(v_socio.data_nascita) >= 18 then
    raise exception 'Il consenso del genitore serve solo ai minorenni.';
  end if;
  -- Al massimo 10 link al giorno, per non riempire la tabella.
  if (select count(*) from public.autorizzazioni_genitore
      where socio_id = v_socio.id and creato_il > now() - interval '1 day') >= 10 then
    raise exception 'Hai già creato molti link oggi: usa uno di quelli che hai mandato.';
  end if;
  insert into public.autorizzazioni_genitore (socio_id, token_hash)
  values (v_socio.id, encode(extensions.digest(v_token, 'sha256'), 'hex'));
  return v_token;
end;
$$;

-- Cosa vede il genitore aprendo il link: solo il nome del figlio e cosa può approvare.
create function public.leggi_link_genitore(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_aut   public.autorizzazioni_genitore;
  v_socio public.soci;
begin
  select * into v_aut from public.autorizzazioni_genitore
  where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  if not found then
    return jsonb_build_object('stato', 'non_valido');
  end if;
  if v_aut.approvato_il is not null then
    return jsonb_build_object('stato', 'usato');
  end if;
  if v_aut.scade_il < now() then
    return jsonb_build_object('stato', 'scaduto');
  end if;
  select * into v_socio from public.soci where id = v_aut.socio_id;
  if v_socio.stato not in ('attivo', 'in_attesa') then
    return jsonb_build_object('stato', 'non_valido');
  end if;
  return jsonb_build_object(
    'stato', 'valido',
    'nome', v_socio.nome,
    'serve_iscrizione', v_socio.stato = 'in_attesa'
  );
end;
$$;

-- Il genitore approva. Si può approvare solo l'iscrizione e lasciare spenti
-- punti e offerte; sotto i 14 anni senza l'iscrizione non si procede.
create function public.approva_genitore(
  p_token      text,
  p_nome       text,
  p_cognome    text,
  p_email      text,
  p_dichiara   boolean,
  p_iscrizione boolean,
  p_punti      boolean,
  p_marketing  boolean,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_aut       public.autorizzazioni_genitore;
  v_socio     public.soci;
  v_privacy   text := (select valore #>> '{}' from public.impostazioni where chiave = 'versione_privacy');
  v_marketing text := (select valore #>> '{}' from public.impostazioni where chiave = 'versione_marketing');
  v_email     text := lower(btrim(coalesce(p_email, '')));
begin
  select * into v_aut from public.autorizzazioni_genitore
  where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
  for update;
  if not found or v_aut.approvato_il is not null or v_aut.scade_il < now() then
    raise exception 'Il link non è più valido: chiedi a tuo figlio di mandartene uno nuovo dall''app.';
  end if;
  select * into v_socio from public.soci where id = v_aut.socio_id for update;
  if v_socio.stato not in ('attivo', 'in_attesa') then
    raise exception 'Il link non è più valido.';
  end if;

  if nullif(btrim(p_nome), '') is null or nullif(btrim(p_cognome), '') is null then
    raise exception 'Scrivi il tuo nome e cognome.';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Controlla la tua email.';
  end if;
  if not coalesce(p_dichiara, false) then
    raise exception 'Conferma di essere il genitore o il tutore.';
  end if;
  if v_socio.stato = 'in_attesa' and not coalesce(p_iscrizione, false) then
    raise exception 'Per attivare la tessera serve l''approvazione dell''iscrizione.';
  end if;

  update public.autorizzazioni_genitore set
    approvato_il = now(),
    genitore_nome = btrim(p_nome),
    genitore_cognome = btrim(p_cognome),
    genitore_email = v_email,
    approva_iscrizione = case when v_socio.stato = 'in_attesa' then true end,
    approva_punti = coalesce(p_punti, false),
    approva_marketing = coalesce(p_marketing, false),
    user_agent = p_user_agent
  where id = v_aut.id;

  if v_socio.stato = 'in_attesa' then
    insert into public.consensi (socio_id, tipo, concesso, versione_testo, canale, user_agent)
    values (v_socio.id, 'privacy', true, v_privacy, 'genitore', p_user_agent);
    -- Da adesso la tessera esiste davvero: compare in app e va alle casse.
    update public.soci set stato = 'attivo', iscritto_il = current_date where id = v_socio.id;
  end if;
  if coalesce(p_punti, false) then
    update public.soci set punti_attivi = true where id = v_socio.id;
  end if;
  if coalesce(p_marketing, false) then
    insert into public.consensi (socio_id, tipo, concesso, versione_testo, canale, user_agent)
    values (v_socio.id, 'marketing', true, v_marketing, 'genitore', p_user_agent);
  end if;
end;
$$;

revoke execute on function public.crea_link_genitore() from public, anon;
grant execute on function public.crea_link_genitore() to authenticated;
revoke execute on function public.leggi_link_genitore(text) from public;
grant execute on function public.leggi_link_genitore(text) to anon, authenticated;
revoke execute on function public.approva_genitore(text, text, text, text, boolean, boolean, boolean, boolean, text) from public;
grant execute on function public.approva_genitore(text, text, text, text, boolean, boolean, boolean, boolean, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Punti dalle vendite: come 20261110190000, saltando i minorenni senza approvazione
-- ---------------------------------------------------------------------------

create or replace function public.importa_movimenti_punti(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch       public.import_batch := interno.apri_batch(p_batch_id, 'movimenti_punti');
  v_mappa       jsonb := v_batch.mappatura_colonne;
  v_per_euro    numeric := coalesce((select (valore #>> '{}')::numeric from public.impostazioni where chiave = 'punti_per_euro'), 1);
  r             public.import_righe;
  v_tessera     text;
  v_socio_id    uuid;
  v_importo     numeric;
  v_punti       integer;
  v_tipo        text;
  v_negozio     text;
  v_negozio_id  uuid;
  v_riferimento text;
  v_avviso      text;
  v_id          uuid;
begin
  for r in
    select * from public.import_righe
    where batch_id = p_batch_id and stato = 'in_attesa'
    order by numero_riga
  loop
    begin
      v_avviso := null;

      if v_mappa ? 'importo' and interno.import_testo(r.dati, v_mappa, 'numero_tessera') is null then
        update public.import_righe set stato = 'saltata', avviso = 'Vendita senza tessera.' where id = r.id;
        continue;
      end if;

      v_tessera := interno.import_tessera(r.dati, v_mappa);
      v_socio_id := interno.socio_da_tessera(v_tessera);
      if v_socio_id is null then
        raise exception 'Tessera % non trovata: importa prima i soci.', v_tessera;
      end if;

      v_importo := interno.import_numero(interno.import_testo(r.dati, v_mappa, 'importo'));
      if v_mappa ? 'punti' then
        v_punti := round(interno.import_numero(interno.import_testo(r.dati, v_mappa, 'punti')));
      else
        -- Per difetto anche sui resi: -12,50 € tolgono 12 punti, come 12,50 € ne danno 12.
        v_punti := (sign(v_importo) * floor(abs(v_importo) * v_per_euro))::integer;
        if coalesce(v_punti, 0) = 0 then
          update public.import_righe set stato = 'saltata', socio_id = v_socio_id,
            avviso = 'Importo sotto il primo punto.' where id = r.id;
          continue;
        end if;
      end if;
      if coalesce(v_punti, 0) = 0 then
        raise exception 'Punti mancanti o a zero.';
      end if;

      v_tipo := coalesce(lower(interno.import_testo(r.dati, v_mappa, 'tipo')),
                         case when v_punti < 0 then 'storno' else 'acquisto' end);
      if v_tipo not in ('acquisto', 'bonus', 'rettifica', 'storno', 'riscatto', 'scadenza') then
        raise exception 'Tipo di movimento "%" non previsto.', v_tipo;
      end if;

      -- Minorenni: niente punti dalle vendite finché un genitore non approva (20261121160000).
      if v_tipo in ('acquisto', 'storno') and not interno.punti_attivi(v_socio_id) then
        update public.import_righe set stato = 'saltata', socio_id = v_socio_id,
          avviso = 'Socio minorenne: raccolta punti non ancora approvata da un genitore.' where id = r.id;
        continue;
      end if;

      v_negozio := interno.import_testo(r.dati, v_mappa, 'negozio');
      v_negozio_id := (select id from public.negozi where codice_gestionale = v_negozio);
      if v_negozio is not null and v_negozio_id is null then
        v_avviso := format('Negozio "%s" non trovato.', v_negozio);
      end if;

      v_riferimento := interno.import_testo(r.dati, v_mappa, 'riferimento');
      if v_riferimento is null then
        v_avviso := concat_ws(' ', v_avviso, 'Senza riferimento: reimportando il file questo movimento verrebbe duplicato.');
      end if;

      insert into public.movimenti_punti (
        socio_id, punti, tipo, descrizione, negozio_id, importo_spesa,
        fonte, riferimento_esterno, import_batch_id, data_movimento, creato_da
      ) values (
        v_socio_id, v_punti, v_tipo,
        interno.import_testo(r.dati, v_mappa, 'descrizione'),
        v_negozio_id,
        v_importo,
        'gestionale', v_riferimento, p_batch_id,
        coalesce(interno.import_data(interno.import_testo(r.dati, v_mappa, 'data'))::timestamptz, now()),
        auth.uid()
      )
      on conflict (fonte, riferimento_esterno) do nothing
      returning id into v_id;

      update public.import_righe set
        stato = case when v_id is null then 'saltata' else 'importata' end,
        socio_id = v_socio_id,
        errore = null,
        avviso = case when v_id is null then 'Movimento già importato.' else v_avviso end
      where id = r.id;
    exception when others then
      update public.import_righe set stato = 'errore', errore = sqlerrm where id = r.id;
    end;
  end loop;

  return interno.chiudi_batch(p_batch_id);
end;
$$;
