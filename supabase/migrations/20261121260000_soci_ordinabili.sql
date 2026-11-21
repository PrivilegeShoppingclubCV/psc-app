-- Pannello Soci: elenco ordinabile anche per punti. La vista prende il saldo
-- di ogni socio, così l'ordine lo fa il database su tutti i soci (non solo
-- sulla pagina che si vede). Le colonne esistenti restano uguali, in fondo si
-- aggiunge "saldo".

create or replace view public.soci_con_tessere
with (security_invoker = true)
as
select
  s.id, s.nome, s.cognome, s.email, s.telefono, s.livello, s.stato, s.origine, s.user_id, s.iscritto_il,
  t.fisica, t.digitale,
  concat_ws(' ', t.fisica, t.digitale) as codici,
  coalesce(t.in_attivazione, false) as in_attivazione,
  coalesce((select sum(m.punti) from public.movimenti_punti m where m.socio_id = s.id), 0)::integer as saldo
from public.soci s
left join lateral (
  select
    max(codice) filter (where tipo = 'fisica') as fisica,
    max(codice) filter (where tipo = 'digitale') as digitale,
    bool_or(stato_cassa = 'in_attivazione') as in_attivazione
  from public.tessere where socio_id = s.id and stato = 'attiva'
) t on true;

-- Per ordinare in fretta per data di iscrizione e per cognome.
create index if not exists soci_iscritto_il_idx on public.soci (iscritto_il);
create index if not exists soci_cognome_nome_idx on public.soci (cognome, nome);
