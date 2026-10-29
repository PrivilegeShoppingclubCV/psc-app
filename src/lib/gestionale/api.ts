// Parti comuni degli endpoint usati dal server dei negozi (src/app/api/gestionale/).
// Il server si presenta con "Authorization: Bearer <chiave>"; la chiave la
// controlla il database (gestionale_verifica_chiave), qui si inoltra soltanto.
// Basta la anon key: le funzioni del database non fanno nulla senza una chiave valida.

import { createClient, type PostgrestError } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "@/lib/supabase/config";

export function supabaseGestionale() {
  if (!isSupabaseConfigured) return null;
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * La chiave dall'intestazione, solo se ha la forma di quelle create da
 * gestionale_crea_chiave (psc_ + 64 cifre esadecimali): una richiesta con una
 * chiave inventata si ferma qui, prima di leggere e inoltrare un file di 4 MB.
 */
export function chiaveDa(request: Request): string | null {
  const h = request.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(psc_[0-9a-f]{64})$/i.exec(h);
  return m ? m[1] : null;
}

export function errore(stato: number, messaggio: string) {
  return NextResponse.json({ errore: messaggio }, { status: stato });
}

export function erroreDb(e: PostgrestError) {
  // 42501 = chiave non valida o revocata.
  if (e.code === "42501") return errore(401, e.message);
  console.error("gestionale:", e);
  return errore(500, e.message);
}

export function nonConfigurato() {
  return errore(503, "Supabase non è ancora configurato.");
}
