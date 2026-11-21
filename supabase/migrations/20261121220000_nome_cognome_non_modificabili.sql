-- Nome e cognome non si cambiano più dall'app (decisione di Daniele, 2026-11-21).
-- aggiorna_profilo tiene la stessa firma ma ignora p_nome e p_cognome: il socio
-- li fa correggere con "Segnala un dato sbagliato" e un admin li cambia dal pannello.

create or replace function public.aggiorna_profilo(
  p_telefono             text,
  p_data_nascita         date,
  p_cap                  text,
  p_citta                text,
  p_negozio_preferito_id uuid,
  p_indirizzo            text default null,
  p_nome                 text default null,
  p_cognome              text default null
)
returns public.soci
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_telefono text := interno.pulisci_telefono(p_telefono);
  v_socio    public.soci;
  v_nome     text;
  v_cognome  text;
begin
  if v_telefono is null then
    raise exception 'Il numero di telefono è obbligatorio.';
  end if;
  perform interno.controlla_recapiti(p_data_nascita, p_cap, p_citta);
  perform interno.controlla_indirizzo(p_indirizzo);

  select * into v_socio from public.soci where user_id = auth.uid() and stato = 'attivo' for update;
  if not found then
    raise exception 'Nessuna tessera collegata al tuo account.';
  end if;
  -- Nome e cognome non si cambiano dall'app (decisione di Daniele): restano quelli
  -- salvati, qualunque cosa arrivi. Si correggono con una segnalazione o dal pannello.
  v_nome := v_socio.nome;
  v_cognome := v_socio.cognome;

  update public.soci s set
    nome = v_nome,
    cognome = v_cognome,
    telefono = v_telefono,
    data_nascita = p_data_nascita,
    cap = nullif(btrim(p_cap), ''),
    citta = nullif(btrim(p_citta), ''),
    indirizzo = nullif(btrim(p_indirizzo), ''),
    negozio_preferito_id = p_negozio_preferito_id,
    profilo_modificato_il = now(),
    profilo_lotto_id = null
  where s.id = v_socio.id
    and (s.nome, s.cognome, s.telefono, s.data_nascita, s.cap, s.citta, s.indirizzo, s.negozio_preferito_id) is distinct from
        (v_nome, v_cognome, v_telefono, p_data_nascita, nullif(btrim(p_cap), ''), interno.luogo_elegante(p_citta),
         interno.luogo_elegante(p_indirizzo), p_negozio_preferito_id)
  returning * into v_socio;

  if not found then
    select * into v_socio from public.soci where user_id = auth.uid() and stato = 'attivo';
  end if;
  return v_socio;
end;
$$;
