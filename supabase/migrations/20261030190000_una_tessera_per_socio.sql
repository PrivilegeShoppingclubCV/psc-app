-- Una tessera per socio.
--
-- Prima un socio poteva avere una fisica e una digitale attive insieme, con due
-- codici diversi in cassa. Daniele ha scelto una tessera sola: chi ha solo
-- l'app ha la digitale (APP000123); quando lo staff gli consegna la tessera di
-- plastica, la fisica prende il suo posto e il telefono mostra il codice della
-- fisica. Chi ha già la fisica e scarica l'app vede nel telefono quella.
-- In ReadyPro resta un cliente solo: col lotto arriva la tessera nuova con
-- tessera_precedente, il codice da sostituire su quel cliente.

alter table public.tessere
  -- La tessera di cui questa ha preso il posto (bloccata), per dire a ReadyPro
  -- quale cliente aggiornare.
  add column sostituisce_id uuid references public.tessere (id) on delete set null;

-- Soci che oggi hanno due tessere attive: resta la fisica.
update public.tessere d set
  stato = 'bloccata',
  bloccata_il = now(),
  motivo_blocco = 'Unita alla tessera fisica ' || f.codice
from public.tessere f
where d.socio_id = f.socio_id and d.tipo = 'digitale' and f.tipo = 'fisica'
  and d.stato = 'attiva' and f.stato = 'attiva';

drop index public.tessere_una_attiva_per_tipo;
create unique index tessere_una_attiva_per_socio on public.tessere (socio_id) where stato = 'attiva';

-- La digitale in più non serve più: il telefono mostra la fisica.
drop function public.attiva_tessera_digitale();

-- ---------------------------------------------------------------------------
-- Consegna della fisica a un socio che esiste già
-- ---------------------------------------------------------------------------

-- Se ha la digitale, la fisica la sostituisce (nessun motivo da scrivere). Se
-- ha già una fisica serve il motivo (persa, rovinata). In tutti e due i casi
-- quella vecchia si blocca.
create or replace function public.staff_assegna_tessera_fisica(p_socio_id uuid, p_codice text, p_motivo_sostituzione text default null)
returns public.tessere
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vecchia public.tessere;
  v_tessera public.tessere;
begin
  perform interno.richiedi_staff();
  perform 1 from public.soci where id = p_socio_id and stato = 'attivo' for update;
  if not found then
    raise exception 'Socio non trovato o non attivo.';
  end if;
  v_tessera := interno.prendi_tessera_fisica(p_codice);

  select * into v_vecchia from public.tessere
  where socio_id = p_socio_id and stato = 'attiva' for update;
  if found then
    if v_vecchia.tipo = 'fisica' and nullif(btrim(p_motivo_sostituzione), '') is null then
      raise exception 'Il socio ha già la tessera fisica %: indica perché la sostituisci.', v_vecchia.codice;
    end if;
    update public.tessere set
      stato = 'bloccata',
      bloccata_il = now(),
      motivo_blocco = coalesce(nullif(btrim(p_motivo_sostituzione), ''), 'Sostituita dalla tessera fisica ' || v_tessera.codice)
    where id = v_vecchia.id;
  end if;

  perform interno.consegna_tessera_fisica(v_tessera.id, p_socio_id);
  update public.tessere set sostituisce_id = v_vecchia.id where id = v_tessera.id returning * into v_tessera;
  return v_tessera;
end;
$$;

-- ---------------------------------------------------------------------------
-- Unione di due schede: se una ha la fisica e l'altra la digitale, resta la
-- fisica. Due fisiche o due digitali attive: lo staff sceglie quale bloccare.
-- ---------------------------------------------------------------------------

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
    email                = coalesce(email, v_togli.email),
    telefono             = coalesce(telefono, v_togli.telefono),
    data_nascita         = coalesce(data_nascita, v_togli.data_nascita),
    cap                  = coalesce(cap, v_togli.cap),
    citta                = coalesce(citta, v_togli.citta),
    negozio_preferito_id = coalesce(negozio_preferito_id, v_togli.negozio_preferito_id),
    iscritto_il          = least(iscritto_il, v_togli.iscritto_il),
    dati_gestionale      = v_togli.dati_gestionale || dati_gestionale
  where id = p_tieni
  returning * into v_tieni;
  return v_tieni;
end;
$$;

-- ---------------------------------------------------------------------------
-- Import dal gestionale
-- ---------------------------------------------------------------------------

-- Un codice nuovo per il socio prende il posto della sua tessera attiva,
-- qualunque tipo sia: in cassa il cliente ha un codice solo.
create or replace function interno.import_aggancia_tessera(p_socio_id uuid, p_codice text, p_batch_id uuid)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_tessera public.tessere;
  v_vecchia uuid;
  v_avviso  text;
begin
  select * into v_tessera from public.tessere where codice = p_codice for update;

  if found and v_tessera.socio_id is distinct from p_socio_id and v_tessera.socio_id is not null then
    return format('La tessera %s è di un altro socio: non spostata.', p_codice);
  end if;

  if found and v_tessera.socio_id = p_socio_id then
    update public.tessere set
      stato_cassa = 'attiva',
      attivata_in_cassa_il = coalesce(attivata_in_cassa_il, now()),
      ultimo_import_id = p_batch_id
    where id = v_tessera.id;
    return null;
  end if;

  -- Codice nuovo o ancora nel magazzino: il gestionale dice che è di questo
  -- socio, quindi ha sostituito la sua tessera in cassa.
  update public.tessere set stato = 'bloccata', bloccata_il = now(), motivo_blocco = 'Sostituita nel gestionale da ' || p_codice
  where socio_id = p_socio_id and stato = 'attiva'
  returning id, format('Tessera %s sostituita da %s.', codice, p_codice) into v_vecchia, v_avviso;

  if v_tessera.id is null then
    insert into public.tessere (codice, tipo, socio_id, stato, attivata_in_cassa_il, ultimo_import_id, consegnata_il, sostituisce_id)
    values (p_codice, interno.tipo_da_codice(p_codice), p_socio_id, 'attiva', now(), p_batch_id, now(), v_vecchia);
  else
    update public.tessere set
      socio_id = p_socio_id, stato = 'attiva', stato_cassa = 'attiva',
      attivata_in_cassa_il = now(), ultimo_import_id = p_batch_id, consegnata_il = now(), sostituisce_id = v_vecchia
    where id = v_tessera.id;
  end if;
  return v_avviso;
end;
$$;

-- Come prima, ma altra_tessera serve solo a trovare il socio (es. il vecchio
-- codice APP di un cliente a cui ReadyPro ha già messo la fisica): non diventa
-- una seconda tessera attiva.
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
          nome, cognome, email, telefono, data_nascita, cap, citta,
          livello, negozio_preferito_id, iscritto_il, origine, dati_gestionale, ultimo_import_id
        ) values (
          interno.import_testo(r.dati, v_mappa, 'nome'),
          interno.import_testo(r.dati, v_mappa, 'cognome'),
          lower(interno.import_testo(r.dati, v_mappa, 'email')),
          interno.import_testo(r.dati, v_mappa, 'telefono'),
          interno.import_data(interno.import_testo(r.dati, v_mappa, 'data_nascita')),
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
        update public.soci s set
          nome                 = coalesce(interno.import_testo(r.dati, v_mappa, 'nome'), s.nome),
          cognome              = coalesce(interno.import_testo(r.dati, v_mappa, 'cognome'), s.cognome),
          email                = coalesce(lower(interno.import_testo(r.dati, v_mappa, 'email')), s.email),
          telefono             = coalesce(interno.import_testo(r.dati, v_mappa, 'telefono'), s.telefono),
          data_nascita         = coalesce(interno.import_data(interno.import_testo(r.dati, v_mappa, 'data_nascita')), s.data_nascita),
          cap                  = coalesce(interno.import_testo(r.dati, v_mappa, 'cap'), s.cap),
          citta                = coalesce(interno.import_testo(r.dati, v_mappa, 'citta'), s.citta),
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

-- app -> ReadyPro: una riga per tessera nuova; tessera_precedente è il codice
-- che sostituisce sullo stesso cliente (vuoto per un cliente nuovo).
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
begin
  perform 1 from public.tessere t
  join public.soci s on s.id = t.socio_id
  where t.stato_cassa = 'in_attivazione' and t.stato = 'attiva' and s.stato = 'attivo'
    and (t.lotto_cassa_id is null
         or exists (select 1 from public.gestionale_lotti l where l.id = t.lotto_cassa_id and l.confermato_il is null))
  for update of t;
  if not found then
    return jsonb_build_object('lotto', null, 'righe', '[]'::jsonb);
  end if;

  insert into public.gestionale_lotti (chiave_id, righe) values (v_chiave_id, 0) returning id into v_lotto_id;

  update public.tessere t set lotto_cassa_id = v_lotto_id
  from public.soci s
  where s.id = t.socio_id
    and t.stato_cassa = 'in_attivazione' and t.stato = 'attiva' and s.stato = 'attivo'
    and (t.lotto_cassa_id is null
         or exists (select 1 from public.gestionale_lotti l where l.id = t.lotto_cassa_id and l.confermato_il is null));

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
      'negozio', n.codice_gestionale,
      'iscritto_il', to_char(s.iscritto_il, 'DD/MM/YYYY'),
      'consenso_privacy', case cp.concesso when true then 'SI' when false then 'NO' end,
      'consenso_marketing', case cm.concesso when true then 'SI' when false then 'NO' end
    ) order by t.creato_il), '[]'::jsonb)
  into v_righe
  from public.tessere t
  join public.soci s on s.id = t.socio_id
  left join public.tessere p on p.id = t.sostituisce_id
  left join public.negozi n on n.id = s.negozio_preferito_id
  left join public.consensi_attuali cp on cp.socio_id = s.id and cp.tipo = 'privacy'
  left join public.consensi_attuali cm on cm.socio_id = s.id and cm.tipo = 'marketing'
  where t.lotto_cassa_id = v_lotto_id;

  update public.gestionale_lotti set righe = jsonb_array_length(v_righe) where id = v_lotto_id;
  return jsonb_build_object('lotto', v_lotto_id, 'righe', v_righe);
end;
$$;

