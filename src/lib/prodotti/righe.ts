// Lettura delle righe del magazzino copiate dall'Excel (o esportate da ReadyPro).
// Excel copia le celle separate da tabulazioni, una riga per prodotto. Funziona
// con o senza la riga dei titoli e con o senza la colonna "Valore fermo", che
// ReadyPro non ha: il valore fermo lo ricalcola il database (pezzi × prezzo tesserati).
// Niente dipendenze dal browser o dal server: la userà anche l'invio automatico da ReadyPro.

export interface RigaProdotto {
  ean: string;
  sku: string | null;
  marca: string | null;
  descrizione: string;
  colore: string | null;
  taglia: string | null;
  disponibilita: number;
  prezzo_listino: number | null;
  prezzo_soci: number | null;
  iva: number | null;
  scadenza: string | null;
  scadenza_2: string | null;
  note_scadenza: string | null;
  tipo_6: string | null;
  tipo_7: string | null;
  categoria: string | null;
}

export interface Lettura {
  righe: RigaProdotto[];
  errori: { riga: number; motivo: string }[];
  /** Come sono state riconosciute le colonne. */
  formato: "titoli" | "excel" | "readypro";
  duplicati: number;
}

type Campo = "ean" | "sku" | "marca" | "descrizione" | "colore" | "taglia" | "disponibilita" | "prezzo_listino"
  | "prezzo_soci" | "iva" | "note1" | "note2" | "tipo_6" | "tipo_7" | "categoria";

// Ordine delle colonne del foglio di Daniele; ReadyPro è uguale ma senza "Valore fermo" (posizione 7).
const COLONNE_EXCEL: (Campo | null)[] = ["ean", "marca", "sku", "descrizione", "colore", "taglia", "disponibilita", null,
  "prezzo_listino", "prezzo_soci", null, "iva", "note1", "note2", "tipo_6", "tipo_7", "categoria"];
const COLONNE_READYPRO = COLONNE_EXCEL.filter((_, i) => i !== 7);

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

function campoDaTitolo(titolo: string): Campo | null {
  const t = norm(titolo);
  if (!t) return null;
  if (t.includes("ean")) return "ean";
  if (t.includes("sku")) return "sku";
  if (t.startsWith("marca")) return "marca";
  if (t.startsWith("descrizione")) return "descrizione";
  if (t.startsWith("colore")) return "colore";
  if (t.includes("taglia") || t.startsWith("misura")) return "taglia";
  if (t.startsWith("disp")) return "disponibilita";
  if (t.includes("listino")) return "prezzo_listino";
  if (t.includes("tesserat")) return "prezzo_soci";
  if (t.startsWith("imposte") || t === "iva") return "iva";
  if (t.startsWith("note 2")) return "note2";
  if (t.startsWith("note 1") || t.startsWith("scadenza")) return "note1";
  if (t === "tipo 6") return "tipo_6";
  if (t === "tipo 7") return "tipo_7";
  if (t.startsWith("categoria")) return "categoria";
  return null;
}

/** "€ 1.234,56" → 1234.56; vuoto → null; non numero → NaN. */
export function leggiNumero(v: string): number | null {
  const s = v.replace(/[€%\s ]/g, "");
  if (!s) return null;
  const n = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  return /^-?\d+(\.\d+)?$/.test(n) ? Number(n) : NaN;
}

/** Pezzi: "1.234" sono milleduecentotrentaquattro, non 1,234. */
function leggiPezzi(v: string): number {
  const s = v.replace(/[\s .]/g, "").replace(/,\d*$/, "");
  return /^-?\d+$/.test(s) ? Number(s) : NaN;
}

/** Data in "18/11/2028", "18-11-28", "11/2028" (fine mese) o "2028-11-18" → "2028-11-18". */
export function leggiData(v: string): string | null {
  const due = (n: number) => String(n).padStart(2, "0");
  const anno = (a: string) => (a.length === 2 ? 2000 + Number(a) : Number(a));
  const valida = (a: number, m: number, g: number) => {
    const d = new Date(Date.UTC(a, m - 1, g));
    return d.getUTCFullYear() === a && d.getUTCMonth() === m - 1 && d.getUTCDate() === g ? `${a}-${due(m)}-${due(g)}` : null;
  };
  let m = v.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (m) return valida(Number(m[1]), Number(m[2]), Number(m[3]));
  m = v.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/);
  if (m) return valida(anno(m[3]), Number(m[2]), Number(m[1]));
  m = v.match(/\b(\d{1,2})[/.-](\d{4})\b/);
  if (m) {
    const [a, mese] = [Number(m[2]), Number(m[1])];
    return valida(a, mese, new Date(Date.UTC(a, mese, 0)).getUTCDate());
  }
  return null;
}

export function leggiRighe(testo: string): Lettura {
  const linee = testo.replace(/\r\n?/g, "\n").split("\n").map((l) => l.split("\t").map((c) => c.trim().replace(/^"(.*)"$/s, "$1")));
  const piene = linee.map((celle, i) => ({ celle, numero: i + 1 })).filter((l) => l.celle.some(Boolean));

  let colonne: (Campo | null)[];
  let formato: Lettura["formato"];
  let dati = piene;
  if (piene[0]?.celle.some((c) => norm(c).includes("ean"))) {
    const visti = new Set<Campo>();
    colonne = piene[0].celle.map((t) => {
      const c = campoDaTitolo(t);
      if (!c || visti.has(c)) return null;
      visti.add(c);
      return c;
    });
    formato = "titoli";
    dati = piene.slice(1);
  } else {
    // Senza titoli: nel foglio con il valore fermo la decima colonna è il prezzo
    // tesserati, in ReadyPro è la percentuale di sconto.
    const readypro = dati.slice(0, 20).some((l) => (l.celle[9] ?? "").includes("%"));
    colonne = readypro ? COLONNE_READYPRO : COLONNE_EXCEL;
    formato = readypro ? "readypro" : "excel";
  }

  const righe: RigaProdotto[] = [];
  const errori: Lettura["errori"] = [];
  const perEan = new Map<string, number>();
  let duplicati = 0;

  for (const { celle, numero } of dati) {
    const v: Partial<Record<Campo, string>> = {};
    colonne.forEach((c, i) => { if (c) v[c] = celle[i] ?? ""; });
    const testoONull = (c: Campo) => v[c]?.trim() || null;

    const ean = (v.ean ?? "").replace(/\s/g, "");
    if (!ean) { errori.push({ riga: numero, motivo: "Manca il codice EAN" }); continue; }
    if (/e\+?\d/i.test(ean)) { errori.push({ riga: numero, motivo: `EAN in formato scientifico (${ean}): in Excel allarga la colonna o formattala come testo` }); continue; }
    const descrizione = v.descrizione?.trim();
    if (!descrizione) { errori.push({ riga: numero, motivo: `Manca la descrizione (EAN ${ean})` }); continue; }

    const disponibilita = v.disponibilita ? leggiPezzi(v.disponibilita) : 0;
    const prezzoListino = leggiNumero(v.prezzo_listino ?? "");
    const prezzoSoci = leggiNumero(v.prezzo_soci ?? "");
    const iva = leggiNumero(v.iva ?? "");
    if (Number.isNaN(disponibilita)) { errori.push({ riga: numero, motivo: `Pezzi non numerici: "${v.disponibilita}" (EAN ${ean})` }); continue; }
    if (Number.isNaN(prezzoListino) || Number.isNaN(prezzoSoci)) { errori.push({ riga: numero, motivo: `Prezzo non numerico (EAN ${ean})` }); continue; }

    const note1 = v.note1?.trim() ?? "";
    const note2 = v.note2?.trim() ?? "";
    const scadenza = note1 ? leggiData(note1) : null;
    const scadenza2 = note2 ? leggiData(note2) : null;
    const note = [scadenza ? "" : note1, scadenza2 ? "" : note2].filter(Boolean).join(" · ") || null;

    const riga: RigaProdotto = {
      ean,
      sku: testoONull("sku"),
      marca: testoONull("marca"),
      descrizione,
      colore: testoONull("colore"),
      taglia: testoONull("taglia"),
      disponibilita,
      prezzo_listino: prezzoListino,
      prezzo_soci: prezzoSoci,
      iva: Number.isNaN(iva) ? null : iva,
      scadenza,
      scadenza_2: scadenza2,
      note_scadenza: note,
      tipo_6: testoONull("tipo_6"),
      tipo_7: testoONull("tipo_7"),
      categoria: testoONull("categoria"),
    };
    // Lo stesso EAN due volte: vale l'ultima riga.
    const prima = perEan.get(ean);
    if (prima !== undefined) { righe[prima] = riga; duplicati++; } else { perEan.set(ean, righe.length); righe.push(riga); }
  }
  return { righe, errori, formato, duplicati };
}
