-- Collegare la tessera: il numero digitato dal socio non deve essere identico,
-- carattere per carattere, a quello salvato.
--
-- Le tessere importate da ReadyPro hanno il Cod.Barre a 12 cifre con gli zeri
-- davanti (es. 000000033367). Chi la collega scrive spesso il numero senza zeri
-- (33367), oppure le 13 cifre stampate sotto il codice a barre, che hanno in
-- fondo la cifra di controllo EAN-13 (0000000333674). Prima il confronto era
-- esatto e la risposta era "Numero tessera ed email non corrispondono".
--
-- Ora, se numero digitato e codice salvato sono fatti solo di cifre, si
-- confrontano senza zeri iniziali; e un numero di 13 cifre vale anche senza
-- l'ultima. Resta obbligatorio che l'email dell'accesso sia quella del socio, quindi
-- non diventa più facile indovinare una tessera altrui. Si tolgono anche gli spazi
-- attorno all'email salvata.

create or replace function interno.stesso_numero_tessera(p_codice text, p_digitato text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_codice = p_digitato
    or (
      p_codice ~ '^[0-9]+$' and p_digitato ~ '^[0-9]+$'
      and (
        ltrim(p_codice, '0') = ltrim(p_digitato, '0')
        or (length(p_digitato) = 13 and ltrim(p_codice, '0') = ltrim(left(p_digitato, 12), '0'))
      )
    );
$$;
revoke execute on function interno.stesso_numero_tessera(text, text) from public;

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
    raise exception 'Numero tessera ed email non corrispondono. Se in negozio non hai lasciato questa email, chiedi il codice da mostrare alla cassa.';
  end if;
  if v_socio.user_id is not null then
    raise exception 'Questa tessera è già collegata a un altro account. Chiedi in negozio.';
  end if;

  update public.soci set user_id = auth.uid() where id = v_socio.id returning * into v_socio;
  return v_socio;
end;
$$;
