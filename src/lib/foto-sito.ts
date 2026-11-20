/**
 * Foto dei prodotti sul sito privilegeshoppingclub.it.
 *
 * Lo strumento "Foto prodotto ambientate" carica per ogni prodotto:
 *   <base>/<EAN>.png            quadrato originale 2K (lo usa la newsletter)
 *   <base>/verticali/<EAN>.jpg  verticale 4:5 1080×1350 compressa (la usa l'app)
 *
 * Nel database `prodotti.immagine_path` può quindi contenere o un percorso del
 * bucket Supabase "prodotti" (foto caricate dal pannello) o un indirizzo completo
 * https:// (foto prese dal sito).
 */

export const FOTO_SITO_BASE = (
  process.env.NEXT_PUBLIC_FOTO_SITO_URL || "https://www.privilegeshoppingclub.it/foto-prodotti"
).replace(/\/+$/, "");

/** La foto verticale per l'app, dato l'EAN. */
export function urlFotoVerticale(ean: string): string {
  return `${FOTO_SITO_BASE}/verticali/${encodeURIComponent(ean)}.jpg`;
}

/** Indirizzo da mettere nell'<img>: un URL completo resta com'è, un percorso si appende al bucket. */
export function urlImmagine(urlBase: string, percorso: string): string {
  return /^https?:\/\//i.test(percorso) ? percorso : `${urlBase}/${percorso}`;
}
