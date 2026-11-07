// Forme dei dati usate dalle schermate. Arrivano da Supabase (src/lib/dati.ts)
// oppure, finché Supabase non è configurato, dai dati finti di src/lib/mock-data.ts.

export interface Socio {
  nome: string;
  cognome: string;
  email: string;
  /**
   * Il codice da mostrare in cassa: la digitale se la cassa la conosce, altrimenti
   * la fisica, altrimenti la digitale in attivazione. null = nessuna tessera attiva.
   */
  numeroTessera: string | null;
  /** Nome del livello da mostrare ("Classic", "Gold"). */
  livello: string;
  iscrittoDal: string;
  codiceInvito: string;
  /** La tessera da mostrare è stata creata in app e la cassa non la conosce ancora: il codice a barre resta nascosto. */
  inAttivazione: boolean;
  /** Le tessere attive del socio: al massimo una fisica e una digitale, con gli stessi punti. */
  tessere: TesseraSocio[];
}

export interface TesseraSocio {
  /** Codice letto dalla cassa: testo, zeri iniziali compresi, mai rigenerato. */
  codice: string;
  /** "fisica" = stampata e consegnata in negozio; "digitale" = creata dall'app (900000000123). */
  tipo: "fisica" | "digitale";
  inAttivazione: boolean;
}

/** Quale tessera mostrare in cassa: prima una che la cassa conosce, a parità la digitale. */
export function tesseraDaMostrare(tessere: TesseraSocio[]): TesseraSocio | undefined {
  const peso = (t: TesseraSocio) => (t.inAttivazione ? 2 : 0) + (t.tipo === "digitale" ? 0 : 1);
  return [...tessere].sort((a, b) => peso(a) - peso(b))[0];
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
