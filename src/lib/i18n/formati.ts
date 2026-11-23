// Prezzi, punti e date nel formato di ogni lingua. Ora e date sempre sull'ora italiana.
import type { Lingua } from "./lingue";

/** Lingua → impostazione di Intl. Arabo con le cifre 0-9 come su scontrini e tessere. */
const LOCALE: Record<Lingua, string> = {
  it: "it-IT", en: "en-GB", fr: "fr-FR", de: "de-DE", es: "es-ES", pt: "pt-PT",
  ro: "ro-RO", pl: "pl-PL", ru: "ru-RU", zh: "zh-CN", ar: "ar-u-nu-latn",
};

const cache = new Map<Lingua, ReturnType<typeof crea>>();

function crea(l: Lingua) {
  const locale = LOCALE[l];
  const euro = new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" });
  // "always": in italiano Intl non separa le migliaia sotto 10.000 (1240), il design system vuole 1.240.
  const numero = new Intl.NumberFormat(locale, { useGrouping: "always" });
  const data = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Rome" });
  const ora = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
  return {
    locale,
    euro: (v: number) => euro.format(v),
    punti: (v: number) => numero.format(v),
    data: (iso: string) => data.format(new Date(iso)),
    ora: (d: Date) => ora.format(d),
    /** Data e ora; solo la data se il gestionale non ha mandato l'ora (mezzanotte UTC). */
    dataOra: (iso: string, modello: string) => {
      const d = new Date(iso);
      const soloData = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
      return soloData ? data.format(d) : modello.replace("{data}", data.format(d)).replace("{ora}", ora.format(d));
    },
  };
}

export function formati(l: Lingua) {
  let f = cache.get(l);
  if (!f) cache.set(l, (f = crea(l)));
  return f;
}
export type Formati = ReturnType<typeof formati>;
