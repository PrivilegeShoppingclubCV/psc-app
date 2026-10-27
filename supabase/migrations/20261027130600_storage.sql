-- Supabase Storage: dove finiscono le immagini e i file caricati dal pannello admin.
--
-- Bucket pubblici (offerte, negozi, premi): chiunque può vedere un'immagine
-- dal suo URL pubblico, servito dalla CDN di Supabase; solo gli admin caricano,
-- sostituiscono o cancellano. Nelle tabelle si salva il percorso dentro il
-- bucket (es. "2026/maglione-merino.webp"), non l'URL completo.
--
-- Bucket privato (import): i file CSV/Excel del gestionale, leggibili solo dagli
-- admin, perché contengono dati personali.
--
-- Logo, icone e font restano nel repository (public/), non qui.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('offerte', 'offerte', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
  ('negozi', 'negozi', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
  ('premi', 'premi', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
  ('import', 'import', false, 20971520, array[
    'text/csv',
    'text/plain',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ])
on conflict (id) do nothing;

create policy "immagini: gli admin vedono l'elenco dei file" on storage.objects
  for select to authenticated
  using (bucket_id in ('offerte', 'negozi', 'premi') and public.is_admin());
create policy "immagini: gli admin caricano" on storage.objects
  for insert to authenticated
  with check (bucket_id in ('offerte', 'negozi', 'premi') and public.is_admin());
create policy "immagini: gli admin sostituiscono" on storage.objects
  for update to authenticated
  using (bucket_id in ('offerte', 'negozi', 'premi') and public.is_admin())
  with check (bucket_id in ('offerte', 'negozi', 'premi') and public.is_admin());
create policy "immagini: gli admin cancellano" on storage.objects
  for delete to authenticated
  using (bucket_id in ('offerte', 'negozi', 'premi') and public.is_admin());

create policy "import: solo admin" on storage.objects
  for all to authenticated
  using (bucket_id = 'import' and public.is_admin())
  with check (bucket_id = 'import' and public.is_admin());
