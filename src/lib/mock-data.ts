// Dati finti: li usa src/lib/dati.ts finché Supabase non è configurato
// (anteprime senza chiavi, sviluppo in locale).

import type { Buono, MovimentoPunti, Negozio, Offerta, Premio, Recapiti, Scontrino, Socio } from "./tipi";

export const socio: Socio = {
  nome: "Giulia",
  cognome: "Rossi",
  email: "giulia.rossi@example.com",
  numeroTessera: "004718",
  livello: "Gold",
  iscrittoDal: "2024-03-12",
  codiceInvito: "GIULIA-7K2",
  inAttivazione: false,
  tessere: [{ codice: "004718", tipo: "fisica", inAttivazione: false }],
  attesaGenitore: null,
  puntiAttivi: true,
  daUnire: false,
};

export const recapiti: Recapiti = { telefono: "3331234567", nascita: "", indirizzo: "", cap: "00053", citta: "Civitavecchia", negozioPreferitoId: null };

export const movimenti: MovimentoPunti[] = [
  { id: "m1", data: "2026-10-21", descrizione: "Acquisto", negozio: "Negozio Centro", punti: 86 },
  { id: "m2", data: "2026-10-09", descrizione: "Acquisto", negozio: "Negozio Stazione", punti: 154 },
  { id: "m3", data: "2026-09-28", descrizione: "Buono da 10 € riscattato", punti: -1000 },
  { id: "m4", data: "2026-09-14", descrizione: "Acquisto", negozio: "Negozio Centro", punti: 212 },
  { id: "m5", data: "2026-01-01", descrizione: "Saldo importato dal gestionale", punti: 1788 },
];

export const scontrini: Scontrino[] = [
  { id: "s1", numero: "48213", data: "2026-10-21T16:42:00Z", totale: 43.9, negozio: "Negozio Centro", punti: 8, righe: [] },
  { id: "s2", numero: "47880", data: "2026-10-09T00:00:00Z", totale: 77.5, negozio: "Negozio Stazione", punti: 15, righe: [] },
  { id: "s3", numero: "46889", data: "2026-10-08T12:15:00Z", totale: 20.5, negozio: "Negozio Centro", punti: 4, righe: [] },
  { id: "s4", numero: "46852", data: "2026-10-08T18:15:00Z", totale: 24.0, negozio: "Negozio Centro", punti: 4, righe: [] },
  { id: "s5", numero: "46815", data: "2026-10-07T12:15:00Z", totale: 27.5, negozio: "Negozio Centro", punti: 5, righe: [] },
  { id: "s6", numero: "46778", data: "2026-10-07T18:15:00Z", totale: 31.0, negozio: "Negozio Centro", punti: 6, righe: [] },
  { id: "s7", numero: "46741", data: "2026-10-06T12:15:00Z", totale: 34.5, negozio: "Negozio Centro", punti: 6, righe: [] },
  { id: "s8", numero: "46704", data: "2026-10-06T18:15:00Z", totale: 38.0, negozio: "Negozio Centro", punti: 7, righe: [] },
  { id: "s9", numero: "46667", data: "2026-10-05T12:15:00Z", totale: 41.5, negozio: "Negozio Centro", punti: 8, righe: [] },
  { id: "s10", numero: "46630", data: "2026-10-05T18:15:00Z", totale: 45.0, negozio: "Negozio Centro", punti: 9, righe: [] },
  { id: "s11", numero: "46593", data: "2026-10-04T12:15:00Z", totale: 48.5, negozio: "Negozio Centro", punti: 9, righe: [] },
  { id: "s12", numero: "46556", data: "2026-10-04T18:15:00Z", totale: 52.0, negozio: "Negozio Centro", punti: 10, righe: [] },
  { id: "s13", numero: "46519", data: "2026-10-03T12:15:00Z", totale: 55.5, negozio: "Negozio Centro", punti: 11, righe: [] },
];

export const buoni: Buono[] = [
  { id: "b1", codice: "K7QM4TXR", premio: "Buono da 10 €", punti: 200, stato: "attivo", creatoIl: "2026-11-20T10:00:00Z", scadeIl: "2026-12-20T10:00:00Z", usatoIl: null },
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
  { id: "o1", tipo: "staff", marca: "Esempio", nome: "Maglione girocollo in lana merino", prezzoSoci: 59.9, prezzoListino: 89.9, scadenza: "2026-11-09", soloTesserati: true, puntiExtra: 50, notaExtra: "2° pezzo a metà prezzo", descrizione: "Lana merino extrafine, vestibilità regolare." },
  { id: "o2", tipo: "staff", marca: "Esempio", nome: "Sciarpa in cashmere", prezzoSoci: 39.9, prezzoListino: 55, scadenza: "2026-11-16", soloTesserati: true },
  { id: "o3", tipo: "staff", marca: "Esempio", nome: "Borsa a mano in pelle", prezzoSoci: 119, prezzoListino: 160, scadenza: "2026-11-30", soloTesserati: false },
];
