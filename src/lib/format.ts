const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
// "always": in italiano Intl non separa le migliaia sotto 10.000 (1240), il design system vuole 1.240.
const numero = new Intl.NumberFormat("it-IT", { useGrouping: "always" });
const data = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Rome" });

export const formatEuro = (v: number) => euro.format(v);
export const formatPunti = (v: number) => numero.format(v);
export const formatData = (iso: string) => data.format(new Date(iso));
/** "004718" → "PSC 004718", come stampato sulla tessera. */
export const formatTessera = (n: string) => `PSC ${n}`;
/** 5 → "1 punto ogni 5 € spesi"; 1 → "1 punto ogni euro speso". */
export const formatRegolaPunti = (euroPerPunto: number) =>
  euroPerPunto === 1 ? "1 punto ogni euro speso" : `1 punto ogni ${numero.format(euroPerPunto)} € spesi`;
