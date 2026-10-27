import { NextResponse } from "next/server";
import { chiaveDa, errore, erroreDb, nonConfigurato, supabaseGestionale } from "@/lib/gestionale/api";

// Il server conferma di aver salvato il lotto nella cartella da cui ReadyPro importa:
//   POST /api/gestionale/nuovi-iscritti/conferma?lotto=<id>
//   Authorization: Bearer <chiave>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const supabase = supabaseGestionale();
  if (!supabase) return nonConfigurato();
  const chiave = chiaveDa(request);
  if (!chiave) return errore(401, "Manca la chiave del gestionale.");

  const lotto = new URL(request.url).searchParams.get("lotto") ?? "";
  if (!UUID.test(lotto)) return errore(400, "Lotto mancante o non valido.");

  const { error } = await supabase.rpc("gestionale_conferma_lotto", { p_chiave: chiave, p_lotto: lotto });
  if (error) return erroreDb(error);
  return NextResponse.json({ esito: "confermato", lotto });
}
