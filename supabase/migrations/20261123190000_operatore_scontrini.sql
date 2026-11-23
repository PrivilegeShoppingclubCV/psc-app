-- Operatore che ha battuto lo scontrino (colonna "Operatore" del CSV vendite).
-- Scritta in modo da poter essere eseguita anche due volte.

-- Chi ha battuto lo scontrino (colonna "Operatore" del CSV vendite): lo vede solo
-- l'amministrazione nella scheda del socio, mai il socio. Per questo sta in una
-- tabella a parte invece che in una colonna di scontrini, che il socio legge.
create table if not exists public.scontrini_operatori (
  numero_documento text primary key references public.scontrini (numero_documento) on delete cascade,
  operatore        text not null
);
alter table public.scontrini_operatori enable row level security;
drop policy if exists "scontrini_operatori: solo admin" on public.scontrini_operatori;
create policy "scontrini_operatori: solo admin" on public.scontrini_operatori
  for select to authenticated using (public.is_admin());
grant select on public.scontrini_operatori to authenticated;

create or replace function interno.salva_operatori_scontrini(p_batch_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_mappa jsonb := (select mappatura_colonne from public.import_batch where id = p_batch_id);
begin
  if v_mappa is null or not (v_mappa ? 'operatore' and v_mappa ? 'riferimento') then
    return;
  end if;
  insert into public.scontrini_operatori (numero_documento, operatore)
  select distinct on (s.numero_documento) s.numero_documento, o.operatore
  from public.import_righe r
  cross join lateral (select interno.import_testo(r.dati, v_mappa, 'riferimento') as numero,
                             interno.import_testo(r.dati, v_mappa, 'operatore') as operatore) o
  join public.scontrini s on s.numero_documento = o.numero
  where r.batch_id = p_batch_id and o.operatore is not null
  on conflict (numero_documento) do update set operatore = excluded.operatore;
end;
$$;

-- Stesso trigger degli scontrini: prima lo scontrino, poi il suo operatore.
create or replace function interno.scontrini_da_batch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform interno.salva_scontrini(new.id);
  perform interno.salva_operatori_scontrini(new.id);
  return new;
end;
$$;

update public.impostazioni
set valore = jsonb_build_object('operatore', 'Operatore') || valore
where chiave = 'gestionale_mappatura_vendite'
  and valore ? 'numero_tessera';

revoke execute on all functions in schema interno from public;
