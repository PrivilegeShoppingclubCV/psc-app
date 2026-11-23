-- Recupero dell'email della tessera.
--
-- Chi collega la tessera dall'app scrive numero ed email. Se l'email non è quella
-- salvata nella scheda (quella arrivata da ReadyPro), invece di mandare il codice
-- all'indirizzo sbagliato l'app lo dice subito, mostra l'email giusta mascherata
-- (m•••@g•••.com) e propone di mandare il codice di accesso a quella.
--
-- I numeri tessera sono in sequenza e facili da indovinare, quindi:
--  * l'email completa non esce mai verso il browser: queste funzioni le chiama
--    solo il server dell'app con la chiave segreta (ruolo service_role);
--  * il codice si manda solo all'email salvata, mai a una scritta dall'utente;
--  * tentativi limitati per indirizzo IP, per tessera e in totale (sotto).
--
-- Da eseguire a mano su Supabase dopo il merge, come le altre migrazioni.

create table interno.controlli_tessera (
  id        bigint generated always as identity primary key,
  creato_il timestamptz not null default now(),
  tipo      text not null check (tipo in ('controllo', 'invio')),
  ip        text,
  tessera   text,
  esito     text not null
);
create index controlli_tessera_ip_idx on interno.controlli_tessera (ip, creato_il);
create index controlli_tessera_tessera_idx on interno.controlli_tessera (tessera, creato_il);
create index controlli_tessera_creato_idx on interno.controlli_tessera (creato_il);
alter table interno.controlli_tessera enable row level security;

-- Limiti in un'ora. Contano solo i controlli che non vanno a buon fine (chi
-- scrive numero ed email giusti non scopre niente di nuovo), così un commesso
-- che aiuta tanti clienti dal wifi del negozio non resta bloccato.
create function interno.troppi_controlli_tessera(p_ip text, p_tessera text, p_tipo text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select
    -- Stesso indirizzo IP: 10 errori l'ora.
    (select count(*) from interno.controlli_tessera
      where ip = p_ip and tipo = 'controllo' and esito <> 'ok' and creato_il > now() - interval '1 hour') >= 10
    -- Stessa tessera: 5 errori l'ora.
    or (select count(*) from interno.controlli_tessera
      where tessera = p_tessera and tipo = 'controllo' and esito <> 'ok' and creato_il > now() - interval '1 hour') >= 5
    -- Email mascherate mostrate in tutto l'app: 60 l'ora (frena chi prova tutti i numeri da tanti IP).
    or (select count(*) from interno.controlli_tessera
      where tipo = 'controllo' and esito = 'email_diversa' and creato_il > now() - interval '1 hour') >= 60
    -- Invii all'email della tessera: 3 l'ora per tessera e 10 per IP.
    or (p_tipo = 'invio' and (
      (select count(*) from interno.controlli_tessera
        where tessera = p_tessera and tipo = 'invio' and esito = 'ok' and creato_il > now() - interval '1 hour') >= 3
      or (select count(*) from interno.controlli_tessera
        where ip = p_ip and tipo = 'invio' and esito = 'ok' and creato_il > now() - interval '1 hour') >= 10));
$$;
revoke execute on function interno.troppi_controlli_tessera(text, text, text) from public;

/**
 * Controlla numero tessera ed email scritti nel modulo "Ho già la tessera".
 * p_tipo = 'controllo': risponde con l'esito; p_tipo = 'invio': come sopra ma
 * con i limiti degli invii, e l'esito 'email_diversa' vale come "manda il codice".
 *
 * Esiti: ok (l'email è quella della scheda), email_diversa, senza_email,
 * non_trovata, troppi_tentativi. Con email_diversa torna anche l'email salvata:
 * la funzione è riservata al server (service_role), che la mostra solo mascherata.
 */
create function public.controlla_email_tessera(
  p_numero_tessera text,
  p_email          text default null,
  p_ip             text default null,
  p_tipo           text default 'controllo'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_digitato text := interno.pulisci_codice(regexp_replace(coalesce(p_numero_tessera, ''), '[-.]', '', 'g'));
  v_email    text := lower(btrim(coalesce(p_email, '')));
  v_ip       text := left(nullif(btrim(coalesce(p_ip, '')), ''), 64);
  v_tipo     text := case when p_tipo = 'invio' then 'invio' else 'controllo' end;
  v_salvata  text;
  v_esito    text;
  v_t        record;
begin
  if v_digitato is null then
    return jsonb_build_object('esito', 'non_trovata');
  end if;
  -- Il registro tiene solo l'ultimo giorno.
  delete from interno.controlli_tessera where creato_il < now() - interval '1 day';

  -- La stessa tessera che cercherebbe collega_tessera: attiva, di un socio attivo,
  -- prima il numero esatto.
  select t.codice, s.email, s.user_id into v_t
  from public.tessere t
  join public.soci s on s.id = t.socio_id
  where t.stato = 'attiva'
    and s.stato = 'attivo'
    and interno.stesso_numero_tessera(t.codice, v_digitato)
  order by (t.codice = v_digitato) desc, (lower(btrim(s.email)) = v_email) desc
  limit 1;

  if v_t.codice is null then
    v_esito := 'non_trovata';
  else
    -- Se la tessera è già collegata a un account si entra con l'email di quell'account.
    v_salvata := lower(btrim(coalesce(
      (select u.email from auth.users u where u.id = v_t.user_id),
      v_t.email, '')));
    v_esito := case
      when v_salvata = '' then 'senza_email'
      when v_salvata = v_email then 'ok'
      else 'email_diversa'
    end;
  end if;

  -- Chi scrive numero ed email giusti passa sempre: così chi prova a bloccare una
  -- tessera altrui con tanti tentativi non blocca il vero socio.
  -- I limiti per tessera valgono sul codice salvato (33367 e 000000033367 sono la stessa).
  v_digitato := coalesce(v_t.codice, v_digitato);
  if v_esito <> 'ok' and interno.troppi_controlli_tessera(v_ip, v_digitato, v_tipo) then
    insert into interno.controlli_tessera (tipo, ip, tessera, esito) values (v_tipo, v_ip, v_digitato, 'troppi_tentativi');
    return jsonb_build_object('esito', 'troppi_tentativi');
  end if;

  insert into interno.controlli_tessera (tipo, ip, tessera, esito)
  values (v_tipo, v_ip, v_digitato,
          case when v_tipo = 'invio' and v_esito = 'email_diversa' then 'ok' else v_esito end);

  return case when v_esito = 'email_diversa'
    then jsonb_build_object('esito', v_esito, 'email', v_salvata)
    else jsonb_build_object('esito', v_esito)
  end;
end;
$$;
revoke execute on function public.controlla_email_tessera(text, text, text, text) from public, anon, authenticated;
grant execute on function public.controlla_email_tessera(text, text, text, text) to service_role;
