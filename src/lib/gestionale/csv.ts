// Lettura e scrittura dei CSV scambiati con il gestionale (ReadyPro).
// I gestionali italiani esportano spesso con ";" e in Windows-1252: il separatore
// si riconosce dalla riga di intestazione e la codifica dal contenuto.

export type RigaCsv = Record<string, string>;

/** UTF-8 se valido, altrimenti Windows-1252 (l'"ANSI" di Windows). */
export function decodificaCsv(bytes: Uint8Array): string {
  let testo: string;
  try {
    testo = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    testo = new TextDecoder("windows-1252").decode(bytes);
  }
  return testo.replace(/^﻿/, "");
}

function separatore(intestazione: string): string {
  const conta = (c: string) => {
    let n = 0;
    let virgolette = false;
    for (const ch of intestazione) {
      if (ch === '"') virgolette = !virgolette;
      else if (ch === c && !virgolette) n++;
    }
    return n;
  };
  return [";", "\t", ","].reduce((migliore, c) => (conta(c) > conta(migliore) ? c : migliore), ";");
}

/** Celle grezze, riga per riga. Gestisce virgolette, "" dentro le virgolette e a capo nei campi. */
function celle(testo: string, sep: string): string[][] {
  const righe: string[][] = [];
  let riga: string[] = [];
  let cella = "";
  let virgolette = false;

  for (let i = 0; i < testo.length; i++) {
    const ch = testo[i];
    if (virgolette) {
      if (ch === '"' && testo[i + 1] === '"') {
        cella += '"';
        i++;
      } else if (ch === '"') {
        virgolette = false;
      } else {
        cella += ch;
      }
    } else if (ch === '"') {
      virgolette = true;
    } else if (ch === sep) {
      riga.push(cella);
      cella = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && testo[i + 1] === "\n") i++;
      riga.push(cella);
      righe.push(riga);
      riga = [];
      cella = "";
    } else {
      cella += ch;
    }
  }
  if (cella !== "" || riga.length > 0) {
    riga.push(cella);
    righe.push(riga);
  }
  return righe;
}

/**
 * Righe come oggetti {intestazione: valore}, tutto testo: i numeri tessera
 * non perdono gli zeri iniziali. Le righe vuote si saltano; un'intestazione
 * ripetuta diventa "Nome (2)".
 */
export function leggiCsv(testo: string): { intestazioni: string[]; righe: RigaCsv[] } {
  const primaRiga = testo.slice(0, testo.search(/\r|\n|$/));
  const [testa = [], ...corpo] = celle(testo, separatore(primaRiga));

  const viste = new Map<string, number>();
  const intestazioni = testa.map((h, i) => {
    const nome = h.trim() || `Colonna ${i + 1}`;
    const n = (viste.get(nome) ?? 0) + 1;
    viste.set(nome, n);
    return n === 1 ? nome : `${nome} (${n})`;
  });

  const righe = corpo
    .filter((r) => r.some((c) => c.trim() !== ""))
    .map((r) => Object.fromEntries(intestazioni.map((h, i) => [h, (r[i] ?? "").trim()])));

  return { intestazioni, righe };
}

/** CSV con ";" e a capo CRLF, come se lo aspettano i programmi Windows. */
export function scriviCsv(colonne: string[], righe: Record<string, unknown>[]): string {
  const cella = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [colonne, ...righe.map((r) => colonne.map((c) => r[c]))]
    .map((r) => r.map(cella).join(";"))
    .join("\r\n") + "\r\n";
}
