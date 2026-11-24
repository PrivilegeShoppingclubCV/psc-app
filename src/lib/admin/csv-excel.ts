// Celle dei CSV che l'admin apre con Excel. Un testo scritto da un socio (nome,
// cognome, email…) che comincia con = + - @ Excel lo prende per una formula: con
// «=HYPERLINK(...)» o simili, aprendo il file si potrebbe finire su un sito o far
// partire un comando. Davanti a quei testi si mette un apostrofo: Excel li mostra
// come testo. Numeri e telefoni come «+39 333…» o «-5» restano come sono.
const FORMULA = /^[=+\-@\t\r]/;
const NUMERO_O_TELEFONO = /^[+-]?[\d\s().,/-]*$/;

export function cellaExcel(v: string | number | null | undefined): string {
  let s = String(v ?? "");
  if (FORMULA.test(s) && !NUMERO_O_TELEFONO.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
