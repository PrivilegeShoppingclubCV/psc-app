-- Costo di una generazione di foto, modificabile dal pannello (Admin → Foto prodotto).
-- Ogni generazione riuscita viene contata, anche se la foto poi è scartata, rifatta o mai caricata.

insert into public.impostazioni (chiave, valore, descrizione) values
  ('foto_costo_generazione_eur', '0.04', 'Costo stimato di una foto generata con lo strumento foto, in euro')
on conflict (chiave) do nothing;

-- Le generazioni già registrate avevano il costo provvisorio di 0,15 €: le porto al costo vero.
update public.foto_generazioni set costo_eur = 0.04 where esito = 'ok';

-- Se lo strumento non manda il costo, usa quello delle impostazioni.
create or replace function public.foto_registra(
  p_ean           text,
  p_esito         text,
  p_durata_ms     integer default null,
  p_modello       text default null,
  p_modello_testo text default null,
  p_errore        text default null,
  p_sovrascritta  boolean default false,
  p_costo_eur     numeric default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_op    public.foto_operatori;
  v_id    bigint;
  v_costo numeric;
begin
  v_op := interno.foto_operatore_corrente();
  if v_op.id is null then
    raise exception 'Non sei autorizzato a generare foto' using errcode = '42501';
  end if;
  if p_ean !~ '^\d{8,14}$' then
    raise exception 'EAN non valido' using errcode = '22023';
  end if;
  if p_esito = 'ok' then
    v_costo := coalesce(
      p_costo_eur,
      (select (valore #>> '{}')::numeric from public.impostazioni where chiave = 'foto_costo_generazione_eur'),
      0.04
    );
  end if;
  insert into public.foto_generazioni
    (operatore_id, email, ean, durata_ms, modello, modello_testo, esito, errore, sovrascritta, costo_eur)
  values
    (v_op.id, v_op.email, p_ean, p_durata_ms, left(p_modello, 120), left(p_modello_testo, 120),
     case when p_esito = 'ok' then 'ok' else 'errore' end, left(p_errore, 500),
     coalesce(p_sovrascritta, false), v_costo)
  returning id into v_id;
  return v_id;
end;
$$;
