-- Nome e cognome spezzati nel punto sbagliato (segnalato da Daniele, 2026-11-23).
--
-- ReadyPro, nell'importazione, ha un campo solo per cognome e nome ("Ragione
-- sociale oppure cognome e nome") e poi li separa da solo: a volte nel punto
-- sbagliato, e l'export clienti riporta "Mammoli D" come cognome e "aniele" come
-- nome. L'import clienti dell'app copiava quella divisione sulla scheda.
--
-- 1. interno.ripara_nome_cognome rimette a posto le divisioni evidentemente
--    sbagliate:
--    - una lettera sola in fondo al cognome ("Mammoli D" + "aniele");
--    - un pezzo corto in fondo al cognome e il nome che comincia minuscolo
--      ("Mammoli Da" + "niele");
--    - il nome che comincia con un pezzo minuscolo staccato ("Mammol" + "i Daniele"),
--      tranne de/di/da/del/della/... che possono far parte del nome.
-- 2. importa_soci: nome e cognome dal file passano da ripara_nome_cognome; se hanno
--    le stesse lettere di quelli già salvati (stessa persona, solo divisa in un
--    altro punto) resta la divisione dell'app.
-- 3. Le schede già rovinate si sistemano con lo SQL una tantum
--    nome-cognome-spezzati.sql (in Project files), con anteprima.
--
-- Si può eseguire anche più volte.

create or replace function interno.ripara_nome_cognome(
  p_cognome text, p_nome text, out cognome text, out nome text)
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_coda  text;
  v_testa text;
begin
  cognome := nullif(btrim(regexp_replace(p_cognome, '\s+', ' ', 'g')), '');
  nome := nullif(btrim(regexp_replace(p_nome, '\s+', ' ', 'g')), '');
  if cognome is null or nome is null then
    return;
  end if;

  -- Un pezzo di nome finito in fondo al cognome.
  v_coda := substring(cognome from ' ([[:alpha:]]{1,3})$');
  if v_coda is not null
     and (length(v_coda) = 1 or left(nome, 1) ~ '[[:lower:]]') then
    cognome := btrim(left(cognome, length(cognome) - length(v_coda)));
    nome := v_coda || nome;
    return;
  end if;

  -- Un pezzo di cognome finito all'inizio del nome.
  v_testa := substring(nome from '^([[:lower:]]{1,3}) [[:upper:]]');
  if v_testa is not null
     and v_testa not in ('de', 'di', 'da', 'del', 'dei', 'della', 'la', 'le', 'lo', 'van', 'von')
     and right(cognome, 1) ~ '[[:alpha:]]' then
    cognome := cognome || v_testa;
    nome := btrim(substr(nome, length(v_testa) + 1));
  end if;
end;
$$;

-- Stesse lettere, nello stesso ordine, a parte spazi e maiuscole.
create or replace function interno.stesse_lettere(p_cognome_a text, p_nome_a text, p_cognome_b text, p_nome_b text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select lower(regexp_replace(coalesce(p_cognome_a, '') || coalesce(p_nome_a, ''), '\s', '', 'g'))
       = lower(regexp_replace(coalesce(p_cognome_b, '') || coalesce(p_nome_b, ''), '\s', '', 'g'))
     and coalesce(p_cognome_a, p_nome_a) is not null;
$$;

revoke execute on all functions in schema interno from public;

-- Import clienti: come in 20261123120000, con nome e cognome rimessi a posto.

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
  v_nome        text;
  v_cognome     text;
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

      -- Nome e cognome: ReadyPro a volte li separa nel punto sbagliato
      -- ("Mammoli D" + "aniele"): si rimettono a posto prima di salvarli.
      select x.cognome, x.nome into v_cognome, v_nome
      from interno.ripara_nome_cognome(
        interno.import_testo(r.dati, v_mappa, 'cognome'),
        interno.import_testo(r.dati, v_mappa, 'nome')) x;

      -- Il gestionale è la fonte dei dati anagrafici: un valore presente nel file
      -- sovrascrive quello salvato, una cella vuota non cancella nulla.
      if v_nuovo then
        insert into public.soci (
          nome, cognome, email, telefono, data_nascita, indirizzo, cap, citta,
          livello, negozio_preferito_id, iscritto_il, origine, dati_gestionale, ultimo_import_id
        ) values (
          v_nome,
          v_cognome,
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
        -- Stesse lettere di nome e cognome già salvati, solo divise in un altro
        -- punto: è la stessa persona, si tiene la divisione dell'app (rimessa a
        -- posto se era rovinata). Un nome davvero cambiato in ReadyPro arriva.
        if v_app or interno.stesse_lettere(v_cognome, v_nome,
             (select cognome from public.soci where id = v_socio_id),
             (select nome from public.soci where id = v_socio_id)) then
          select x.cognome, x.nome into v_cognome, v_nome
          from public.soci s, interno.ripara_nome_cognome(s.cognome, s.nome) x
          where s.id = v_socio_id;
        end if;
        update public.soci s set
          nome                 = coalesce(v_nome, s.nome),
          cognome              = coalesce(v_cognome, s.cognome),
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
