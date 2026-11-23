// Recupero dell'email della tessera: chi scrive numero tessera ed email sbagliata
// vede l'email salvata in negozio, mascherata, e può farsi mandare lì il codice.
// L'email completa resta sul server: nel browser c'è solo un cookie cifrato.

import { cookies, headers } from "next/headers";
import { cifra, clientSegreto, decifra } from "@/lib/supabase/segreto";

export const COOKIE_RECUPERO = "psc_recupero";

export type EsitoTessera =
  | { esito: "ok" | "senza_email" | "non_trovata" | "troppi_tentativi" }
  | { esito: "email_diversa"; email: string };

async function ipRichiesta() {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim() || null;
}

/**
 * Controlla numero ed email con la chiave segreta (controlla_email_tessera).
 * Null se la chiave segreta non è impostata o il database non risponde:
 * allora si continua come prima, mandando il codice all'email scritta.
 */
export async function controllaTessera(numero: string, email: string | null, tipo: "controllo" | "invio"): Promise<EsitoTessera | null> {
  const db = clientSegreto();
  if (!db) return null;
  const { data, error } = await db.rpc("controlla_email_tessera", {
    p_numero_tessera: numero,
    p_email: email,
    p_ip: await ipRichiesta(),
    p_tipo: tipo,
  });
  if (error) {
    console.error("controllo email tessera", error.code ?? error.message);
    return null;
  }
  return data as EsitoTessera;
}

/** m•••@g•••.com: abbastanza per riconoscere la propria, non per scoprire quella di altri. */
export function mascheraEmail(email: string) {
  const [locale = "", dominio = ""] = email.split("@");
  const parti = dominio.split(".");
  const fine = parti.length > 1 ? `.${parti.pop()}` : "";
  return `${locale.slice(0, 1)}•••@${parti.join(".").slice(0, 1)}•••${fine}`;
}

type Recupero = { numero: string; email: string };

export async function salvaRecupero(r: Recupero) {
  (await cookies()).set(COOKIE_RECUPERO, cifra(JSON.stringify(r)), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 60,
  });
}

export async function leggiRecupero(): Promise<Recupero | null> {
  const testo = decifra((await cookies()).get(COOKIE_RECUPERO)?.value);
  if (!testo) return null;
  try {
    const r = JSON.parse(testo) as Recupero;
    return typeof r.numero === "string" && typeof r.email === "string" ? r : null;
  } catch {
    return null;
  }
}

export async function cancellaRecupero() {
  const store = await cookies();
  if (store.has(COOKIE_RECUPERO)) store.delete(COOKIE_RECUPERO);
}
