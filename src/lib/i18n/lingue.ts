// Lingue delle pagine di benvenuto, accesso e iscrizione. L'italiano è la lingua
// di partenza: se il browser chiede una lingua che non abbiamo, si resta in italiano.
// Questo file va bene sia sul server sia nel browser.

export const LINGUE = [
  { codice: "it", nome: "Italiano" },
  { codice: "en", nome: "English" },
  { codice: "fr", nome: "Français" },
  { codice: "de", nome: "Deutsch" },
  { codice: "es", nome: "Español" },
  { codice: "pt", nome: "Português" },
  { codice: "ro", nome: "Română" },
  { codice: "pl", nome: "Polski" },
  { codice: "ru", nome: "Русский" },
  { codice: "zh", nome: "中文" },
  { codice: "ar", nome: "العربية" },
] as const;

export type Lingua = (typeof LINGUE)[number]["codice"];
export const LINGUA_BASE: Lingua = "it";
export const COOKIE_LINGUA = "psc_lingua";

const CODICI = new Set<string>(LINGUE.map((l) => l.codice));
export const isLingua = (v: unknown): v is Lingua => typeof v === "string" && CODICI.has(v);

/** Lingue che si leggono da destra a sinistra. */
export const direzione = (l: Lingua): "rtl" | "ltr" => (l === "ar" ? "rtl" : "ltr");

/**
 * Sceglie la lingua: prima quella scelta a mano (cookie), poi la prima delle
 * lingue del browser che abbiamo (intestazione Accept-Language), infine l'italiano.
 */
export function scegliLingua(cookie: string | undefined, acceptLanguage: string | null): Lingua {
  if (isLingua(cookie)) return cookie;
  const richieste = (acceptLanguage ?? "")
    .split(",")
    .map((parte, i) => {
      const [tag, ...opz] = parte.trim().split(";");
      const q = opz.map((o) => /^\s*q=([\d.]+)/.exec(o)?.[1]).find(Boolean);
      return { lingua: tag.split("-")[0].toLowerCase(), q: q ? Number(q) : 1, i };
    })
    .filter((r) => r.lingua && r.q > 0)
    .sort((a, b) => b.q - a.q || a.i - b.i);
  return richieste.map((r) => r.lingua).find(isLingua) ?? LINGUA_BASE;
}
