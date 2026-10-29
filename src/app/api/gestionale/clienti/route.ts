import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { leggiCsv, decodificaCsv } from "@/lib/gestionale/csv";
import { chiaveDa, errore, erroreDb, nonConfigurato, supabaseGestionale } from "@/lib/gestionale/api";

// Il server dei negozi manda qui il CSV dei clienti esportato da ReadyPro:
//   POST /api/gestionale/clienti
//   Authorization: Bearer <chiave>
//   X-Nome-File: clienti.csv          (facoltativo)
//   corpo = il file così com'è
// Vercel accetta corpi fino a 4,5 MB: decine di migliaia di clienti.

const MAX_BYTE = 4 * 1024 * 1024;
const MAX_RIGHE = 50_000;

export async function POST(request: Request) {
  const supabase = supabaseGestionale();
  if (!supabase) return nonConfigurato();
  const chiave = chiaveDa(request);
  if (!chiave) return errore(401, "Chiave del gestionale mancante o non valida.");

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length === 0) return errore(400, "Il file è vuoto.");
  if (bytes.length > MAX_BYTE) return errore(413, "File troppo grande: esporta solo i clienti modificati o dividi il file.");

  const { intestazioni, righe } = leggiCsv(decodificaCsv(bytes));
  if (righe.length === 0) return errore(400, "Il file non contiene righe dopo l'intestazione.");
  if (righe.length > MAX_RIGHE) return errore(413, `Troppe righe (${righe.length}): il massimo è ${MAX_RIGHE}.`);

  const { data, error } = await supabase.rpc("gestionale_ricevi_soci", {
    p_chiave: chiave,
    p_nome_file: request.headers.get("x-nome-file") ?? "clienti.csv",
    p_impronta_file: createHash("sha256").update(bytes).digest("hex"),
    p_righe: righe,
  });
  if (error) return erroreDb(error);

  return NextResponse.json({ ...data, intestazioni });
}
