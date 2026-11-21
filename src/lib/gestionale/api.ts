// Parti comuni degli endpoint usati dal server dei negozi (src/app/api/gestionale/).
// Il server si presenta con "Authorization: Bearer <chiave>"; la chiave la
// controlla il database (gestionale_verifica_chiave), qui si inoltra soltanto.
// Basta la anon key: le funzioni del database non fanno nulla senza una chiave valida.

import { createHash } from "node:crypto";
import { createClient, type PostgrestError } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { leggiCsv, decodificaCsv } from "@/lib/gestionale/csv";
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

// Vercel accetta corpi fino a 4,5 MB; lo script manda blocchi da 1000 righe.
const MAX_BYTE = 4 * 1024 * 1024;
const MAX_RIGHE = 50_000;

/**
 * Riceve un CSV dal server dei negozi e lo passa alla funzione del database
 * (gestionale_ricevi_soci, gestionale_ricevi_vendite), che controlla la chiave.
 */
export async function riceviCsv(request: Request, funzione: string, nomePredefinito: string) {
  const supabase = supabaseGestionale();
  if (!supabase) return nonConfigurato();
  const chiave = chiaveDa(request);
  if (!chiave) return errore(401, "Chiave del gestionale mancante o non valida.");

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length === 0) return errore(400, "Il file è vuoto.");
  if (bytes.length > MAX_BYTE) return errore(413, "File troppo grande: esporta solo le righe modificate o dividi il file.");

  const { intestazioni, righe } = leggiCsv(decodificaCsv(bytes));
  if (righe.length === 0) return errore(400, "Il file non contiene righe dopo l'intestazione.");
  if (righe.length > MAX_RIGHE) return errore(413, `Troppe righe (${righe.length}): il massimo è ${MAX_RIGHE}.`);

  // Il database ha pochi secondi per ogni chiamata (limite di Supabase per le
  // richieste con la anon key): un blocco da 1000 clienti tutti con la tessera
  // non ci stava. Qui il file si passa a pezzi, ognuno con il suo tempo.
  const impronta = createHash("sha256").update(bytes).digest("hex");
  const pezzi = Math.ceil(righe.length / RIGHE_PER_CHIAMATA);
  const totale: Record<string, unknown> = {};
  for (let i = 0; i < pezzi; i++) {
    const { data, error } = await supabase.rpc(funzione, {
      p_chiave: chiave,
      p_nome_file: request.headers.get("x-nome-file") ?? nomePredefinito,
      // Un'impronta per pezzo: con quella del file intero il secondo pezzo
      // sembrerebbe "lo stesso file" del primo e verrebbe saltato.
      p_impronta_file: pezzi === 1 ? impronta : `${impronta}:${i + 1}/${pezzi}`,
      p_righe: righe.slice(i * RIGHE_PER_CHIAMATA, (i + 1) * RIGHE_PER_CHIAMATA),
    });
    if (error) {
      if (i === 0) return erroreDb(error);
      // I pezzi già elaborati restano: lo script rimanda il file e quelli tornano uguali.
      console.error("gestionale:", error);
      return errore(500, `${error.message} (dopo ${i * RIGHE_PER_CHIAMATA} righe elaborate)`);
    }
    sommaEsito(totale, data as Record<string, unknown>);
  }

  return NextResponse.json({ ...totale, ...(pezzi > 1 && { pezzi }), intestazioni });
}

const RIGHE_PER_CHIAMATA = 200;

/** Somma i conteggi dei pezzi (righe_ok, righe_saltate…); per il resto vale l'ultimo. */
function sommaEsito(totale: Record<string, unknown>, esito: Record<string, unknown> | null) {
  for (const [k, v] of Object.entries(esito ?? {})) {
    totale[k] = typeof v === "number" && typeof totale[k] === "number" ? (totale[k] as number) + v : v;
  }
}
