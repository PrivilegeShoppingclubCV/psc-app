-- Scheda prodotto nell'app: toccando un'offerta si apre una scheda con prezzo
-- tesserati, prezzo di cartellino, sconto e gli eventuali "extra".
--
-- Due campi facoltativi, sia sulle offerte dello staff sia sui prodotti del
-- magazzino (questi li scrive solo il pannello: l'import da ReadyPro non li tocca):
--   * punti_extra: punti in più promessi a chi compra il prodotto. Per ora si
--     mostrano soltanto nella scheda: non vengono accreditati in automatico.
--   * nota_extra: una riga libera, es. "2° pezzo a metà prezzo".
-- Rieseguibile.

alter table public.offerte add column if not exists punti_extra integer;
alter table public.offerte add column if not exists nota_extra text;
alter table public.prodotti add column if not exists punti_extra integer;
alter table public.prodotti add column if not exists nota_extra text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'offerte_punti_extra_positivi') then
    alter table public.offerte add constraint offerte_punti_extra_positivi check (punti_extra is null or punti_extra > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'prodotti_punti_extra_positivi') then
    alter table public.prodotti add constraint prodotti_punti_extra_positivi check (punti_extra is null or punti_extra > 0);
  end if;
end $$;

comment on column public.offerte.punti_extra is 'Punti in più mostrati nella scheda del prodotto (non accreditati in automatico).';
comment on column public.offerte.nota_extra is 'Altra offerta sul prodotto, mostrata nella scheda.';
comment on column public.prodotti.punti_extra is 'Punti in più mostrati nella scheda del prodotto (non accreditati in automatico).';
comment on column public.prodotti.nota_extra is 'Altra offerta sul prodotto, mostrata nella scheda.';
