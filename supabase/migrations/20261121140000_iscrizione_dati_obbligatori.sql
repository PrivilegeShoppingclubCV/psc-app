-- Iscrizione con dati obbligatori e indirizzo del socio.
--
-- 1. Nuova colonna soci.indirizzo (via e numero civico).
-- 2. iscriviti: data di nascita, indirizzo, CAP e città diventano obbligatori e
--    ci si iscrive dai 18 anni. Resta tutto il resto (email e cellulare unici, 20261121120000).
-- 3. aggiorna_profilo: il socio può scrivere anche l'indirizzo. Qui i campi
--    restano facoltativi per il database: i soci importati da ReadyPro senza
--    questi dati non restano bloccati; l'app chiede di completarli.
-- 4. L'indirizzo va a ReadyPro (file nuovi iscritti, colonna "indirizzo" in fondo)
--    e si può importare dal file clienti (campo "indirizzo" nella mappatura).

alter table public.soci add column indirizzo text;
comment on column public.soci.indirizzo is 'Via e numero civico.';

create function interno.controlla_indirizzo(p_indirizzo text)
returns void language plpgsql immutable set search_path = '' as $$
begin
  if length(btrim(coalesce(p_indirizzo, ''))) > 120 then
    raise exception 'L''indirizzo è troppo lungo.';
  end if;
end;
$$;
revoke execute on function interno.controlla_indirizzo(text) from public;

-- ---------------------------------------------------------------------------
-- Iscrizione
-- ---------------------------------------------------------------------------

drop function public.iscriviti(text, text, boolean, boolean, text, text, text, date, text, text);

create function public.iscriviti(
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
  -- Dal 2026-11-21 data di nascita, indirizzo, CAP e città sono obbligatori e
  -- ci si iscrive dai 18 anni (marketing e regolamento punti).
  if p_data_nascita is null then
    raise exception 'La data di nascita è obbligatoria.';
  end if;
  perform interno.controlla_recapiti(p_data_nascita, p_cap, p_citta);
  if p_data_nascita > (current_date - interval '18 years')::date then
    raise exception 'Per iscriverti al club devi avere almeno 18 anni.';
  end if;
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

  insert into public.soci (user_id, nome, cognome, email, telefono, data_nascita, indirizzo, cap, citta, origine)
  values (auth.uid(), btrim(p_nome), btrim(p_cognome), v_email, v_telefono, p_data_nascita,
          btrim(p_indirizzo), btrim(p_cap), btrim(p_citta), 'app')
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

-- ---------------------------------------------------------------------------
-- Profilo
-- ---------------------------------------------------------------------------

drop function public.aggiorna_profilo(text, date, text, text, uuid);

create function public.aggiorna_profilo(
  p_telefono             text,
  p_data_nascita         date,
  p_cap                  text,
  p_citta                text,
  p_negozio_preferito_id uuid,
  p_indirizzo            text default null
)
returns public.soci
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_telefono text := interno.pulisci_telefono(p_telefono);
  v_socio    public.soci;
begin
  if v_telefono is null then
    raise exception 'Il numero di telefono è obbligatorio.';
  end if;
  perform interno.controlla_recapiti(p_data_nascita, p_cap, p_citta);
  perform interno.controlla_indirizzo(p_indirizzo);

  update public.soci s set
    telefono = v_telefono,
    data_nascita = p_data_nascita,
    cap = nullif(btrim(p_cap), ''),
    citta = nullif(btrim(p_citta), ''),
    indirizzo = nullif(btrim(p_indirizzo), ''),
    negozio_preferito_id = p_negozio_preferito_id,
    profilo_modificato_il = now(),
    profilo_lotto_id = null
  where s.user_id = auth.uid() and s.stato = 'attivo'
    and (s.telefono, s.data_nascita, s.cap, s.citta, s.indirizzo, s.negozio_preferito_id) is distinct from
        (v_telefono, p_data_nascita, nullif(btrim(p_cap), ''), nullif(btrim(p_citta), ''), nullif(btrim(p_indirizzo), ''), p_negozio_preferito_id)
  returning * into v_socio;

  if not found then
    select * into v_socio from public.soci where user_id = auth.uid() and stato = 'attivo';
    if not found then
      raise exception 'Nessuna tessera collegata al tuo account.';
    end if;
  end if;
  return v_socio;
end;
$$;

revoke execute on function
  public.iscriviti(text, text, boolean, boolean, text, text, text, date, text, text, text),
  public.aggiorna_profilo(text, date, text, text, uuid, text)
from public, anon;
grant execute on function
  public.iscriviti(text, text, boolean, boolean, text, text, text, date, text, text, text),
  public.aggiorna_profilo(text, date, text, text, uuid, text)
to authenticated;

-- ---------------------------------------------------------------------------
-- app -> ReadyPro: anche l'indirizzo
-- ---------------------------------------------------------------------------

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
  where t.stato_cassa = 'in_attivazione' and t.stato = 'attiva' and s.stato = 'attivo'
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
    and t.stato_cassa = 'in_attivazione' and t.stato = 'attiva' and s.stato = 'attivo'
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

-- ---------------------------------------------------------------------------
-- ReadyPro -> app: import clienti con l'indirizzo
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
          v_avvisi := v_avvisi || 'Recapiti modificati di recente in app: tenuti quelli dell''app.'::text;
        end if;
        update public.soci s set
          nome                 = coalesce(interno.import_testo(r.dati, v_mappa, 'nome'), s.nome),
          cognome              = coalesce(interno.import_testo(r.dati, v_mappa, 'cognome'), s.cognome),
          email                = coalesce(lower(interno.import_testo(r.dati, v_mappa, 'email')), s.email),
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
