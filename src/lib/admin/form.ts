// Lettura dei moduli del pannello e date nel fuso dei negozi.

const FUSO = "Europe/Rome";

export const testo = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
export const testoONull = (f: FormData, k: string) => testo(f, k) || null;
export const spunta = (f: FormData, k: string) => f.get(k) === "on";

/** Numero scritto all'italiana ("1.500", "12,50") o vuoto. NaN se non è un numero. */
export function numero(f: FormData, k: string): number | null {
  const v = testo(f, k).replace(/\s|€/g, "");
  if (!v) return null;
  const normale = v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v;
  return /^-?\d+(\.\d+)?$/.test(normale) ? Number(normale) : NaN;
}

export function intero(f: FormData, k: string): number | null {
  const n = numero(f, k);
  return n === null || Number.isInteger(n) ? n : NaN;
}

/** Scostamento di Roma rispetto a UTC in quel giorno, es. "+01:00" o "+02:00". */
function scostamento(data: string): string {
  const nome = new Intl.DateTimeFormat("en-US", { timeZone: FUSO, timeZoneName: "longOffset" })
    .formatToParts(new Date(`${data}T12:00:00Z`))
    .find((p) => p.type === "timeZoneName")?.value ?? "GMT+01:00";
  return nome === "GMT" ? "+00:00" : nome.slice(3);
}

/** "2026-10-31" → mezzanotte di quel giorno a Roma, in ISO. */
export function inizioGiorno(data: string): string {
  return new Date(`${data}T00:00:00${scostamento(data)}`).toISOString();
}

/** "2026-10-31" → mezzanotte del giorno dopo a Roma: l'offerta vale per tutto il 31. */
export function fineGiorno(data: string): string {
  const dopo = new Date(`${data}T12:00:00Z`);
  dopo.setUTCDate(dopo.getUTCDate() + 1);
  return inizioGiorno(dopo.toISOString().slice(0, 10));
}

/** Istante ISO → "2026-10-31" nel fuso di Roma (per i campi data). */
export function giorno(iso: string | null, fine = false): string {
  if (!iso) return "";
  const t = new Date(iso).getTime() - (fine ? 1 : 0);
  return new Intl.DateTimeFormat("sv-SE", { timeZone: FUSO }).format(t);
}

export const dataOra = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("it-IT", { timeZone: FUSO, dateStyle: "short", timeStyle: "short" }).format(new Date(iso)) : "—";

export const dataBreve = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("it-IT", { timeZone: FUSO, day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso)) : "—";

/** Indirizzo con l'esito dell'operazione, letto da <Esito> in cima alla pagina. */
export const conEsito = (pagina: string, esito: { ok?: string; errore?: string }) => {
  const [percorso, query = ""] = pagina.split("?");
  const q = new URLSearchParams(query);
  q.delete("ok");
  q.delete("errore");
  if (esito.ok) q.set("ok", esito.ok);
  if (esito.errore) q.set("errore", esito.errore);
  return `${percorso}?${q}`;
};

/** Messaggio leggibile da un errore di Supabase. */
export function messaggioDb(e: { message: string; code?: string }): string {
  if (e.code === "23505") return "Esiste già un elemento con questo valore (codice o numero duplicato).";
  if (e.code === "42501") return "Non hai i permessi per questa operazione.";
  if (e.code === "23514" && /valida_al/.test(e.message)) return "La data di fine deve venire dopo la data di inizio.";
  return e.message;
}

/** Indirizzo pubblico di un bucket di Storage: si aggiunge il percorso salvato nella tabella. */
export const urlBucket = (bucket: string) =>
  `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/public/${bucket}`;
