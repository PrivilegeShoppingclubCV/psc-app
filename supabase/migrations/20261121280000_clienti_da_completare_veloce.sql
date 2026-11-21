-- "Clienti da completare" andava in timeout: a ogni apertura rileggeva tutte
-- le righe di tutti i file clienti degli ultimi 30 giorni (con gli invii
-- completi sono decine di migliaia) per tenere l'ultima di ogni cliente.
--
-- Ora c'è una tabella con l'ultima riga ricevuta per ogni cliente di ReadyPro,
-- aggiornata da sola a ogni file che arriva. La pagina legge solo quella.

create table public.clienti_readypro (
  chiave          text primary key,           -- ID di ReadyPro (o la riga, se manca)
  dati            jsonb not null,
  ricevuto_il     timestamptz not null,       -- quando è arrivato il file
  numero_riga     integer not null
);
comment on table public.clienti_readypro is
  'Ultima riga ricevuta da ReadyPro per ogni cliente (anche quelli senza tessera, che l''import salta). Si aggiorna da sola.';
-- Nessuna policy: si legge solo dalle funzioni del pannello.
alter table public.clienti_readypro enable row level security;

create function interno.aggiorna_clienti_readypro()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.clienti_readypro as c (chiave, dati, ricevuto_il, numero_riga)
  select distinct on (coalesce(n.dati ->> 'ID', 'riga:' || n.id))
    coalesce(n.dati ->> 'ID', 'riga:' || n.id), n.dati, b.creato_il, n.numero_riga
  from nuove n
  join public.import_batch b on b.id = n.batch_id and b.tipo = 'soci'
  order by coalesce(n.dati ->> 'ID', 'riga:' || n.id), b.creato_il desc, n.numero_riga desc
  on conflict (chiave) do update set
    dati = excluded.dati, ricevuto_il = excluded.ricevuto_il, numero_riga = excluded.numero_riga
  -- Un file più vecchio arrivato dopo non sovrascrive i dati più recenti.
  where (excluded.ricevuto_il, excluded.numero_riga) >= (c.ricevuto_il, c.numero_riga);
  return null;
end;
$$;

create trigger import_righe_clienti_readypro
  after insert on public.import_righe
  referencing new table as nuove
  for each statement execute function interno.aggiorna_clienti_readypro();

-- Prima carica con le righe già ricevute (può metterci qualche secondo).
insert into public.clienti_readypro (chiave, dati, ricevuto_il, numero_riga)
select distinct on (coalesce(r.dati ->> 'ID', 'riga:' || r.id))
  coalesce(r.dati ->> 'ID', 'riga:' || r.id), r.dati, b.creato_il, r.numero_riga
from public.import_righe r
join public.import_batch b on b.id = r.batch_id and b.tipo = 'soci'
order by coalesce(r.dati ->> 'ID', 'riga:' || r.id), b.creato_il desc, r.numero_riga desc
on conflict (chiave) do nothing;

-- Stessi risultati di prima, ma dalla tabella nuova. La data si calcola solo
-- per i clienti a cui manca qualcosa (è la parte più lenta).
create or replace function public.admin_clienti_da_completare(p_dal date default '2023-12-07')
returns table (
  id_readypro text, cognome text, nome text, email text, cellulare text,
  tessera text, iscritto_il date, manca text, telefono_app text, email_app text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_mappa jsonb := coalesce(
    nullif((select valore from public.impostazioni where chiave = 'gestionale_mappatura_soci'), '{}'::jsonb),
    (select mappatura_colonne from public.import_batch where tipo = 'soci' order by creato_il desc limit 1),
    '{}');
begin
  perform interno.richiedi_admin();
  if v_mappa ->> 'iscritto_il' is null then
    v_mappa := v_mappa || '{"iscritto_il": "Dett."}';
  end if;
  return query
  -- Come interno.import_testo, ma scritto qui: chiamare la funzione per ogni
  -- campo di ogni cliente era la parte più lenta. "=valore" è un valore fisso.
  with m as (
    select k, v_mappa ->> k as col from unnest(array['cognome', 'nome', 'email', 'telefono', 'numero_tessera', 'iscritto_il']) k
  ),
  campi as (
    select
      max(col) filter (where k = 'cognome') as cog, max(col) filter (where k = 'nome') as nom,
      max(col) filter (where k = 'email') as mail, max(col) filter (where k = 'telefono') as tel,
      max(col) filter (where k = 'numero_tessera') as tes, max(col) filter (where k = 'iscritto_il') as dal
    from m
  ),
  c as materialized (
    select
      u.dati ->> 'ID' as id_rp,
      nullif(btrim(case when left(f.cog, 1) = '=' then substr(f.cog, 2) else u.dati ->> f.cog end), '') as cog,
      nullif(btrim(case when left(f.nom, 1) = '=' then substr(f.nom, 2) else u.dati ->> f.nom end), '') as nom,
      lower(nullif(btrim(case when left(f.mail, 1) = '=' then substr(f.mail, 2) else u.dati ->> f.mail end), '')) as mail,
      nullif(btrim(case when left(f.tel, 1) = '=' then substr(f.tel, 2) else u.dati ->> f.tel end), '') as tel,
      nullif(regexp_replace(coalesce(case when left(f.tes, 1) = '=' then substr(f.tes, 2) else u.dati ->> f.tes end, ''), '\s', '', 'g'), '') as tes,
      nullif(btrim(case when left(f.dal, 1) = '=' then substr(f.dal, 2) else u.dati ->> f.dal end), '') as dal_testo
    from public.clienti_readypro u cross join campi f
  ),
  incompleti as materialized (
    select c.*, interno.data_o_null(c.dal_testo) as dal
    from c
    where c.cog is not null and c.nom is not null
      and (c.mail is not null or c.tel is not null or c.tes is not null)
      -- Ordini dei marketplace: ReadyPro li registra come clienti con un'email finta.
      and coalesce(c.mail, '') !~ '@(marketplace\.amazon\.|members\.ebay\.)'
      and (c.mail is null or c.tel is null or c.tes is null)
  )
  select i.id_rp, interno.testo_elegante(i.cog), interno.testo_elegante(i.nom), i.mail, i.tel, i.tes, i.dal,
    concat_ws(', ',
      case when i.mail is null then 'email' end,
      case when i.tel is null then 'cellulare' end,
      case when i.tes is null then 'tessera' end),
    s.telefono,
    case when i.mail is null then s.email end
  from incompleti i
  left join lateral (
    select so.telefono, so.email
    from public.tessere t join public.soci so on so.id = t.socio_id
    where i.tes is not null and t.codice = i.tes
    limit 1
  ) s on true
  where i.dal >= p_dal
  order by i.dal desc, i.cog, i.nom;
end;
$$;
