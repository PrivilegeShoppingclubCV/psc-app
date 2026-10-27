// Forme dei dati usate dalle schermate. Arrivano da Supabase (src/lib/dati.ts)
// oppure, finché Supabase non è configurato, dai dati finti di src/lib/mock-data.ts.

export interface Socio {
  nome: string;
  cognome: string;
  email: string;
  /** Numero tessera: chiave importata dal gestionale, sempre testo e mai rigenerata. */
  numeroTessera: string;
  /** Nome del livello da mostrare ("Classic", "Gold"). */
  livello: string;
  iscrittoDal: string;
  codiceInvito: string;
  /** Tessera creata in app che la cassa non conosce ancora: il codice a barre resta nascosto. */
  inAttivazione: boolean;
}

export interface MovimentoPunti {
  id: string;
  data: string;
  descrizione: string;
  negozio?: string;
  punti: number;
}

export interface Premio {
  id: string;
  nome: string;
  soglia: number;
}

export interface Negozio {
  id: string;
  nome: string;
  indirizzo: string;
  orari: string;
}

export interface Offerta {
  id: string;
  marca: string;
  nome: string;
  prezzoSoci: number | null;
  prezzoListino: number | null;
  /** Per le offerte senza prezzo: "-30%", "2x1". */
  etichetta?: string;
  /** Fine validità; assente se l'offerta non scade. */
  scadenza: string | null;
  soloTesserati: boolean;
  immagineUrl?: string;
}

/** Il primo premio non ancora raggiunto, o l'ultimo se li ha superati tutti. */
export function prossimoPremio(premi: Premio[], saldo: number): Premio | undefined {
  return premi.find((p) => p.soglia > saldo) ?? premi[premi.length - 1];
}
