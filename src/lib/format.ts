const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
// "always": in italiano Intl non separa le migliaia sotto 10.000 (1240), il design system vuole 1.240.
const numero = new Intl.NumberFormat("it-IT", { useGrouping: "always" });
const data = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Rome" });

const ora = new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });

export const formatEuro = (v: number) => euro.format(v);
export const formatPunti = (v: number) => numero.format(v);
export const formatData = (iso: string) => data.format(new Date(iso));
/** "004718" → "PSC 004718", come stampato sulla tessera. */
export const formatTessera = (n: string) => `PSC ${n}`;
/** Data e ora; solo la data se il gestionale non ha mandato l'ora (mezzanotte UTC). */
export const formatDataOra = (iso: string) => {
  const d = new Date(iso);
  const soloData = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
  return soloData ? data.format(d) : `${data.format(d)}, ore ${ora.format(d)}`;
};
