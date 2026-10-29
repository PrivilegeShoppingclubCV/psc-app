-- Dati di esempio per il database locale (supabase db reset). Non va in produzione.
-- Gli stessi dati finti di src/lib/mock-data.ts.

insert into public.negozi (codice_gestionale, nome, indirizzo, orari_testo, ordine) values
  ('N01', 'Negozio Centro', 'Via Roma 1', 'Lun–Sab 9:30–19:30', 1),
  ('N02', 'Negozio Stazione', 'Piazza Garibaldi 12', 'Lun–Dom 9:00–20:00', 2),
  ('N03', 'Outlet', 'Via delle Industrie 40', 'Mar–Dom 10:00–19:00', 3);

insert into public.premi (nome, soglia_punti, valore_euro, ordine) values
  ('Buono da 10 €', 1000, 10, 1),
  ('Buono da 15 €', 1500, 15, 2),
  ('Buono da 30 €', 2500, 30, 3);

insert into public.offerte (marca, titolo, prezzo_soci, prezzo_listino, valida_al, solo_tesserati, pubblicata) values
  ('Esempio', 'Maglione girocollo in lana merino', 59.90, 89.90, '2026-11-09', true, true),
  ('Esempio', 'Sciarpa in cashmere', 39.90, 55.00, '2026-11-16', true, true),
  ('Esempio', 'Borsa a mano in pelle', 119.00, 160.00, '2026-11-30', false, true);

insert into public.soci (nome, cognome, email, livello, origine, iscritto_il, codice_invito, negozio_preferito_id)
select 'Giulia', 'Rossi', 'giulia.rossi@example.com', 'gold', 'import', '2024-03-12', 'GIULIA', id
from public.negozi where codice_gestionale = 'N01';

insert into public.tessere (codice, tipo, socio_id, attivata_in_cassa_il, consegnata_il)
select '004718', 'fisica', id, '2024-03-12', '2024-03-12' from public.soci where codice_invito = 'GIULIA';

-- Tessere fisiche stampate e non ancora consegnate.
insert into public.tessere (codice, tipo, stato)
select lpad(n::text, 6, '0'), 'fisica', 'da_consegnare' from generate_series(5001, 5010) n;

-- Prima il saldo iniziale, poi il resto: il riscatto richiede punti sufficienti.
insert into public.movimenti_punti (socio_id, punti, tipo, descrizione, fonte, data_movimento)
select id, 1788, 'saldo_iniziale', 'Saldo importato dal gestionale', 'import', '2026-01-01'
from public.soci where codice_invito = 'GIULIA';

insert into public.movimenti_punti (socio_id, punti, tipo, descrizione, negozio_id, fonte, data_movimento)
select s.id, m.punti, m.tipo, m.descrizione, n.id, m.fonte, m.data::timestamptz
from public.soci s
cross join (values
  (212, 'acquisto', 'Acquisto', 'N01', 'app', '2026-09-14'),
  (154, 'acquisto', 'Acquisto', 'N02', 'app', '2026-10-09'),
  (86, 'acquisto', 'Acquisto', 'N01', 'app', '2026-10-21')
) as m (punti, tipo, descrizione, negozio, fonte, data)
left join public.negozi n on n.codice_gestionale = m.negozio
where s.codice_invito = 'GIULIA';

insert into public.movimenti_punti (socio_id, punti, tipo, descrizione, premio_id, fonte, data_movimento)
select s.id, -1000, 'riscatto', 'Buono da 10 € riscattato', p.id, 'app', '2026-09-28'
from public.soci s, public.premi p
where s.codice_invito = 'GIULIA' and p.soglia_punti = 1000;
