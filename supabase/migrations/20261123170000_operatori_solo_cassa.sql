-- Gli operatori dei negozi usano solo la cassa (verifica buoni).
--
-- Richiesta della direzione: i dati del club (soci, punti, tessere, consensi,
-- scontrini, impostazioni, prodotti) li vede e li cambia solo l'amministrazione.
-- Finora molte regole (RLS) e funzioni aprivano la lettura a tutto lo staff con
-- public.is_staff(), operatori compresi, e un operatore poteva registrare
-- movimenti punti dalle API. Da qui:
--   * public.is_staff() vale solo per gli admin: tutte le regole che la usano
--     diventano "solo admin" senza riscriverle una per una;
--   * public.is_personale() (admin o operatore) resta solo per verifica_buono e
--     usa_buono, che mostrano al commesso premio, nome del socio e scadenza;
--   * via la regola che lasciava all'operatore registrare movimenti punti.
-- L'operatore continua a leggere la propria riga di staff e i negozi attivi.

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin();
$$;

comment on function public.is_staff() is
  'Dal 2026-11-23 vale solo per gli admin. Per la cassa (admin o operatori) usare public.is_personale().';

drop policy if exists "movimenti_punti: l'operatore registra in cassa" on public.movimenti_punti;
