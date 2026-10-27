// Dati finti: li usa src/lib/dati.ts finché Supabase non è configurato
// (anteprime senza chiavi, sviluppo in locale).

import type { MovimentoPunti, Negozio, Offerta, Premio, Socio } from "./tipi";

export const socio: Socio = {
  nome: "Giulia",
  cognome: "Rossi",
  email: "giulia.rossi@example.com",
  numeroTessera: "004718",
  livello: "Gold",
  iscrittoDal: "2024-03-12",
  codiceInvito: "GIULIA-7K2",
  inAttivazione: false,
};

export const movimenti: MovimentoPunti[] = [
  { id: "m1", data: "2026-10-21", descrizione: "Acquisto", negozio: "Negozio Centro", punti: 86 },
  { id: "m2", data: "2026-10-09", descrizione: "Acquisto", negozio: "Negozio Stazione", punti: 154 },
  { id: "m3", data: "2026-09-28", descrizione: "Buono da 10 € riscattato", punti: -1000 },
  { id: "m4", data: "2026-09-14", descrizione: "Acquisto", negozio: "Negozio Centro", punti: 212 },
  { id: "m5", data: "2026-01-01", descrizione: "Saldo importato dal gestionale", punti: 1788 },
];

export const saldoPunti = movimenti.reduce((tot, m) => tot + m.punti, 0);

export const premi: Premio[] = [
  { id: "p1", nome: "Buono da 10 €", soglia: 1000 },
  { id: "p2", nome: "Buono da 15 €", soglia: 1500 },
  { id: "p3", nome: "Buono da 30 €", soglia: 2500 },
];

export const negozi: Negozio[] = [
  { id: "n1", nome: "Negozio Centro", indirizzo: "Via Roma 1", orari: "Lun–Sab 9:30–19:30" },
  { id: "n2", nome: "Negozio Stazione", indirizzo: "Piazza Garibaldi 12", orari: "Lun–Dom 9:00–20:00" },
  { id: "n3", nome: "Outlet", indirizzo: "Via delle Industrie 40", orari: "Mar–Dom 10:00–19:00" },
];

export const offerte: Offerta[] = [
  { id: "o1", marca: "Esempio", nome: "Maglione girocollo in lana merino", prezzoSoci: 59.9, prezzoListino: 89.9, scadenza: "2026-11-09", soloTesserati: true },
  { id: "o2", marca: "Esempio", nome: "Sciarpa in cashmere", prezzoSoci: 39.9, prezzoListino: 55, scadenza: "2026-11-16", soloTesserati: true },
  { id: "o3", marca: "Esempio", nome: "Borsa a mano in pelle", prezzoSoci: 119, prezzoListino: 160, scadenza: "2026-11-30", soloTesserati: false },
];
