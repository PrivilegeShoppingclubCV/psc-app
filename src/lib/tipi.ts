// Forme dei dati usate dalle schermate. Arrivano da Supabase (src/lib/dati.ts)
// oppure, finché Supabase non è configurato, dai dati finti di src/lib/mock-data.ts.

export interface Socio {
  nome: string;
  cognome: string;
  email: string;
  /** Il codice da mostrare in cassa. null = nessuna tessera attiva (es. persa e non ancora sostituita). */
  numeroTessera: string | null;
  /** Nome del livello da mostrare ("Classic", "Gold"). */
  livello: string;
  iscrittoDal: string;
  codiceInvito: string;
  /** La tessera da mostrare è stata creata in app e la cassa non la conosce ancora: il codice a barre resta nascosto. */
  inAttivazione: boolean;
  /**
   * La tessera attiva del socio (al massimo una): la digitale finché non riceve
   * quella di plastica, poi la fisica, che nel telefono si vede con il suo codice.
   */
  tessere: TesseraSocio[];
  /**
   * Minorenne (iscritto in app) che aspetta l'ok di un genitore:
   * - "iscrizione": sotto i 14 anni, la tessera non è ancora attiva;
   * - "punti_offerte": da 14 a 17 anni, punti e offerte restano spenti;
   * - null: niente da approvare (adulto, o il genitore ha già risposto).
   */
  attesaGenitore: "iscrizione" | "punti_offerte" | null;
  /** false = le vendite non danno punti (minorenne senza ok del genitore). */
  puntiAttivi: boolean;
  /** Iscritto dall'app con il cellulare di una tessera fatta in negozio senza email: si uniscono in negozio. */
  daUnire: boolean;
}

export interface TesseraSocio {
  /** Codice letto dalla cassa: testo, zeri iniziali compresi, mai rigenerato. */
  codice: string;
  /** "fisica" = stampata e consegnata in negozio; "digitale" = creata dall'app (900000000123). */
  tipo: "fisica" | "digitale";
  inAttivazione: boolean;
}

/** Quale tessera mostrare in cassa: il database ne lascia attiva una sola, la fisica se c'è. */
export function tesseraDaMostrare(tessere: TesseraSocio[]): TesseraSocio | undefined {
  return tessere.find((t) => t.tipo === "fisica") ?? tessere[0];
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
  /** "staff" = scritta nel pannello; "prodotto" = presa dal magazzino per la vetrina. */
  tipo: "staff" | "prodotto";
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
  /** Colore e taglia dei prodotti del magazzino. */
  dettaglio?: string;
}

/** Il primo premio non ancora raggiunto, o l'ultimo se li ha superati tutti. */
export function prossimoPremio(premi: Premio[], saldo: number): Premio | undefined {
  return premi.find((p) => p.soglia > saldo) ?? premi[premi.length - 1];
}

/** Dati che il socio può modificare dal profilo. Date come AAAA-MM-GG, "" = non indicato. */
export interface Recapiti {
  telefono: string;
  nascita: string;
  indirizzo: string;
  cap: string;
  citta: string;
  negozioPreferitoId: string | null;
}
