// Solo server: non importare da componenti "use client".
import { createClient } from "@supabase/supabase-js";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { supabaseUrl } from "./config";

// Chiave segreta di Supabase (sb_secret_... o la vecchia service_role): solo sul server,
// mai con il prefisso NEXT_PUBLIC_. L'integrazione Supabase di Vercel la crea con uno
// di questi nomi. Serve al recupero dell'email della tessera (controlla_email_tessera).
const chiaveSegreta = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export const haChiaveSegreta = Boolean(supabaseUrl && chiaveSegreta);

/** Client con la chiave segreta. Null se la chiave non è impostata. */
export function clientSegreto() {
  if (!haChiaveSegreta) return null;
  return createClient(supabaseUrl, chiaveSegreta, { auth: { persistSession: false, autoRefreshToken: false } });
}

// Cifratura per i cookie che non devono essere leggibili nel browser (l'email della
// tessera che il socio non conosce). Chiave ricavata dalla chiave segreta.
const chiaveCookie = () => createHash("sha256").update(`psc-cookie:${chiaveSegreta}`).digest();

export function cifra(testo: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", chiaveCookie(), iv);
  const dati = Buffer.concat([c.update(testo, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), dati]).toString("base64url");
}

export function decifra(valore: string | undefined): string | null {
  if (!valore || !haChiaveSegreta) return null;
  try {
    const b = Buffer.from(valore, "base64url");
    const d = createDecipheriv("aes-256-gcm", chiaveCookie(), b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
