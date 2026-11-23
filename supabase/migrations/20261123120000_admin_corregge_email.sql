-- Correzione dell'email di un socio dal pannello (richiesta di Daniele, 2026-11-23).
--
-- 1. "Non hai i permessi per questa operazione." al salvataggio della scheda.
--    I trigger interno.soci_testi_eleganti (20261121200000) e
--    interno.blocca_marketing_minorenni (20261121160000) girano con i permessi di
--    chi salva e chiamano altre funzioni dello schema interno, che i ruoli
--    dell'app non possono usare: ogni salvataggio della scheda dal pannello
--    falliva, e anche un consenso scritto direttamente nella tabella. Diventano
--    security definer (toccano solo la riga che si sta salvando).
-- 2. admin_cambia_email: un admin corregge l'email della scheda e, se il socio ha
--    già l'app, anche l'email con cui accede, senza conferme: l'indirizzo vecchio
--    è proprio quello sbagliato, una mail di conferma lì non arriverebbe mai.
-- 3. L'import clienti da ReadyPro non rimette l'email sbagliata: finché nel file
--    c'è ancora l'indirizzo corretto a mano (soci.email_sbagliata) si tiene quello
--    nuovo. Quando in ReadyPro si corregge anche lì, tutto torna allineato; se in
--    ReadyPro si mette un'email ancora diversa, vince ReadyPro come sempre.

-- ---------------------------------------------------------------------------
-- 1. Trigger con i permessi giusti
-- ---------------------------------------------------------------------------

alter function interno.soci_testi_eleganti() security definer;
alter function interno.blocca_marketing_minorenni() security definer;

-- ---------------------------------------------------------------------------
-- 2. Email corretta dall'admin
-- ---------------------------------------------------------------------------

alter table public.soci add column email_sbagliata text;
comment on column public.soci.email_sbagliata is
  'Email corretta a mano da un admin: se l''import da ReadyPro la riporta, si tiene quella nuova.';

create function public.admin_cambia_email(p_socio_id uuid, p_email text)
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
  perform interno.richiedi_admin();

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

revoke execute on function public.admin_cambia_email(uuid, text) from public, anon;
grant execute on function public.admin_cambia_email(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Import clienti: come in 20261121200000, ma l'email corretta a mano resta
-- ---------------------------------------------------------------------------

create or replace function public.importa_soci(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch       public.import_batch := interno.apri_batch(p_batch_id, 'soci');
  v_mappa       jsonb := v_batch.mappatura_colonne;
  v_versione    text := (select valore #>> '{}' from public.impostazioni where chiave = 'versione_consensi_import');
  r             public.import_righe;
  v_tessera     text;
  v_altra       text;
  v_livello     text;
  v_negozio     text;
  v_negozio_id  uuid;
  v_iscritto_il date;
  v_punti       integer;
  v_consenso    boolean;
  v_tipo        text;
  v_socio_id    uuid;
  v_nuovo       boolean;
  v_avvisi      text[];
  v_avviso      text;
  v_app         boolean;
begin
  for r in
    select * from public.import_righe
    where batch_id = p_batch_id and stato = 'in_attesa'
    order by numero_riga
  loop
    begin
      v_avvisi := '{}';
      v_tessera := interno.pulisci_codice(interno.import_tessera(r.dati, v_mappa));
      v_altra := interno.pulisci_codice(interno.import_testo(r.dati, v_mappa, 'altra_tessera'));
      if v_altra = v_tessera then
        v_altra := null;
      end if;

      v_livello := lower(interno.import_testo(r.dati, v_mappa, 'livello'));
      if v_livello is not null and not exists (select 1 from public.livelli where codice = v_livello) then
        v_avvisi := v_avvisi || format('Livello "%s" sconosciuto: ignorato.', v_livello);
        v_livello := null;
      end if;

      v_negozio := interno.import_testo(r.dati, v_mappa, 'negozio');
      v_negozio_id := (select id from public.negozi where codice_gestionale = v_negozio);
      if v_negozio is not null and v_negozio_id is null then
        v_avvisi := v_avvisi || format('Negozio "%s" non trovato: ignorato.', v_negozio);
      end if;

      v_iscritto_il := interno.import_data(interno.import_testo(r.dati, v_mappa, 'iscritto_il'));

      v_socio_id := coalesce(interno.socio_da_tessera(v_tessera), interno.socio_da_tessera(v_altra));
      v_nuovo := v_socio_id is null;

      -- Tessera mai vista: se la persona si era già iscritta dall'app (stessa email
      -- o stesso cellulare, nessuna tessera fisica), la tessera va sulla sua scheda
      -- invece di crearne una seconda. La digitale viene sostituita dalla fisica.
      if v_nuovo then
        v_socio_id := interno.socio_da_contatti(
          interno.import_testo(r.dati, v_mappa, 'email'),
          interno.import_testo(r.dati, v_mappa, 'telefono'));
        if v_socio_id is not null then
          v_nuovo := false;
          v_avvisi := v_avvisi || format('Tessera %s collegata alla scheda già iscritta dall''app (stessa email o cellulare).', v_tessera);
        end if;
      end if;

      -- Il gestionale è la fonte dei dati anagrafici: un valore presente nel file
      -- sovrascrive quello salvato, una cella vuota non cancella nulla.
      if v_nuovo then
        insert into public.soci (
          nome, cognome, email, telefono, data_nascita, indirizzo, cap, citta,
          livello, negozio_preferito_id, iscritto_il, origine, dati_gestionale, ultimo_import_id
        ) values (
          interno.import_testo(r.dati, v_mappa, 'nome'),
          interno.import_testo(r.dati, v_mappa, 'cognome'),
          lower(interno.import_testo(r.dati, v_mappa, 'email')),
          interno.import_testo(r.dati, v_mappa, 'telefono'),
          interno.import_data(interno.import_testo(r.dati, v_mappa, 'data_nascita')),
          interno.import_testo(r.dati, v_mappa, 'indirizzo'),
          interno.import_testo(r.dati, v_mappa, 'cap'),
          interno.import_testo(r.dati, v_mappa, 'citta'),
          coalesce(v_livello, 'classic'),
          v_negozio_id,
          coalesce(v_iscritto_il, current_date),
          'import',
          r.dati - array(select value from jsonb_each_text(v_mappa)),
          p_batch_id
        )
        returning id into v_socio_id;
      else
        v_app := interno.profilo_recente(v_socio_id, v_batch.creato_il);
        if v_app then
          v_avvisi := v_avvisi || 'Dati modificati di recente in app: tenuti quelli dell''app.'::text;
        end if;
        update public.soci s set
          nome                 = case when v_app then s.nome else coalesce(interno.import_testo(r.dati, v_mappa, 'nome'), s.nome) end,
          cognome              = case when v_app then s.cognome else coalesce(interno.import_testo(r.dati, v_mappa, 'cognome'), s.cognome) end,
          -- Email corretta dall'admin: il file con ancora quella sbagliata non la riporta.
          email                = case
                                   when lower(btrim(interno.import_testo(r.dati, v_mappa, 'email'))) = s.email_sbagliata then s.email
                                   else coalesce(lower(interno.import_testo(r.dati, v_mappa, 'email')), s.email)
                                 end,
          email_sbagliata      = case
                                   when lower(btrim(interno.import_testo(r.dati, v_mappa, 'email'))) is distinct from s.email_sbagliata
                                    and interno.import_testo(r.dati, v_mappa, 'email') is not null then null
                                   else s.email_sbagliata
                                 end,
          telefono             = case when v_app then s.telefono else coalesce(interno.import_testo(r.dati, v_mappa, 'telefono'), s.telefono) end,
          data_nascita         = case when v_app then s.data_nascita else coalesce(interno.import_data(interno.import_testo(r.dati, v_mappa, 'data_nascita')), s.data_nascita) end,
          indirizzo            = case when v_app then s.indirizzo else coalesce(interno.import_testo(r.dati, v_mappa, 'indirizzo'), s.indirizzo) end,
          cap                  = case when v_app then s.cap else coalesce(interno.import_testo(r.dati, v_mappa, 'cap'), s.cap) end,
          citta                = case when v_app then s.citta else coalesce(interno.import_testo(r.dati, v_mappa, 'citta'), s.citta) end,
          livello              = coalesce(v_livello, s.livello),
          negozio_preferito_id = coalesce(v_negozio_id, s.negozio_preferito_id),
          iscritto_il          = coalesce(v_iscritto_il, s.iscritto_il),
          dati_gestionale      = s.dati_gestionale || (r.dati - array(select value from jsonb_each_text(v_mappa))),
          ultimo_import_id     = p_batch_id
        where s.id = v_socio_id;
      end if;

      v_avviso := interno.import_aggancia_tessera(v_socio_id, v_tessera, p_batch_id);
      if v_avviso is not null then
        v_avvisi := v_avvisi || v_avviso;
      end if;

      -- Saldo iniziale: solo al primo import. Dopo, i punti cambiano con i movimenti.
      v_punti := round(interno.import_numero(interno.import_testo(r.dati, v_mappa, 'punti')));
      if coalesce(v_punti, 0) <> 0 then
        if exists (select 1 from public.movimenti_punti where socio_id = v_socio_id and tipo = 'saldo_iniziale') then
          v_avvisi := v_avvisi || format('Saldo iniziale già importato: i %s punti del file non sono stati aggiunti.', v_punti);
        else
          insert into public.movimenti_punti (socio_id, punti, tipo, descrizione, fonte, import_batch_id, creato_da)
          values (v_socio_id, v_punti, 'saldo_iniziale', 'Saldo importato dal gestionale', 'import', p_batch_id, auth.uid());
        end if;
      end if;

      -- Consensi: si importano solo se il socio non ne ha ancora per quel tipo.
      -- Una scelta fatta poi in app non viene mai sovrascritta dal gestionale.
      foreach v_tipo in array array['privacy', 'marketing', 'profilazione'] loop
        v_consenso := interno.import_booleano(interno.import_testo(r.dati, v_mappa, 'consenso_' || v_tipo));
        if v_consenso is not null
           and not exists (select 1 from public.consensi where socio_id = v_socio_id and tipo = v_tipo) then
          insert into public.consensi (socio_id, tipo, concesso, versione_testo, canale, registrato_da)
          values (v_socio_id, v_tipo, v_consenso, v_versione, 'import', auth.uid());
        end if;
      end loop;

      update public.import_righe set
        stato = case when v_nuovo then 'importata' else 'aggiornata' end,
        socio_id = v_socio_id,
        errore = null,
        avviso = nullif(array_to_string(v_avvisi, ' '), '')
      where id = r.id;
    exception when others then
      update public.import_righe set stato = 'errore', errore = sqlerrm where id = r.id;
    end;
  end loop;

  return interno.chiudi_batch(p_batch_id);
end;
$$;
