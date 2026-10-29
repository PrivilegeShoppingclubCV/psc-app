import { chiaveDa, errore, erroreDb, nonConfigurato, supabaseGestionale } from "@/lib/gestionale/api";
import { scriviCsv } from "@/lib/gestionale/csv";

// Il server dei negozi scarica qui le tessere date dall'app (digitali nate in app,
// fisiche consegnate dal pannello), da importare in ReadyPro. Una riga per tessera;
// altra_tessera è l'altro codice attivo dello stesso socio, se ne ha uno:
//   GET /api/gestionale/nuovi-iscritti
//   Authorization: Bearer <chiave>
// 204 = nessuna tessera nuova. 200 = CSV (UTF-8, ";") con l'id del lotto
// nell'intestazione X-Lotto: dopo aver salvato il file il server conferma il lotto
// (POST /api/gestionale/nuovi-iscritti/conferma), altrimenti al giro dopo le
// stesse tessere tornano in un lotto nuovo.

const COLONNE = [
  "numero_tessera", "tipo_tessera", "altra_tessera", "cognome", "nome", "email", "telefono", "data_nascita",
  "cap", "citta", "negozio", "iscritto_il", "consenso_privacy", "consenso_marketing",
];

export async function GET(request: Request) {
  const supabase = supabaseGestionale();
  if (!supabase) return nonConfigurato();
  const chiave = chiaveDa(request);
  if (!chiave) return errore(401, "Manca la chiave del gestionale.");

  const { data, error } = await supabase.rpc("gestionale_nuovi_iscritti", { p_chiave: chiave });
  if (error) return erroreDb(error);

  const { lotto, righe } = data as { lotto: string | null; righe: Record<string, unknown>[] };
  if (!lotto) return new Response(null, { status: 204 });

  return new Response(scriviCsv(COLONNE, righe), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="nuovi-iscritti-${lotto}.csv"`,
      "Cache-Control": "no-store",
      "X-Lotto": lotto,
      "X-Righe": String(righe.length),
    },
  });
}
