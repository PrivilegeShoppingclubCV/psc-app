import { chiaveDa, errore, erroreDb, nonConfigurato, supabaseGestionale } from "@/lib/gestionale/api";
import { scriviCsv } from "@/lib/gestionale/csv";

// Il server dei negozi scarica qui le tessere date dall'app (digitali nate in app,
// fisiche consegnate dal pannello), da importare in ReadyPro. Una riga per tessera;
// tessera_precedente è il codice che sostituisce sullo stesso cliente, se c'era:
//   GET /api/gestionale/nuovi-iscritti
//   Authorization: Bearer <chiave>
// 204 = nessuna tessera nuova. 200 = CSV (UTF-8, ";") con l'id del lotto
// nell'intestazione X-Lotto: dopo aver salvato il file il server conferma il lotto
// (POST /api/gestionale/nuovi-iscritti/conferma), altrimenti al giro dopo le
// stesse tessere tornano in un lotto nuovo.

const COLONNE = [
  "numero_tessera", "tipo_tessera", "tessera_precedente", "cognome", "nome", "email", "telefono", "data_nascita",
  "cap", "citta", "negozio", "iscritto_il", "consenso_privacy", "consenso_marketing",
  // In fondo, per non spostare le colonne di un filtro di importazione già fatto:
  // ReadyPro ha un campo solo per il nome ("Ragione sociale oppure cognome e nome")
  // e in anagrafica lo scrive "COGNOME NOME".
  "ragione_sociale",
  // Dal 2026-11-21: via e numero civico.
  "indirizzo",
];

const ragioneSociale = (r: Record<string, unknown>) =>
  [r.cognome, r.nome].map((v) => String(v ?? "").trim()).filter(Boolean).join(" ").toLocaleUpperCase("it-IT");

export async function GET(request: Request) {
  const supabase = supabaseGestionale();
  if (!supabase) return nonConfigurato();
  const chiave = chiaveDa(request);
  if (!chiave) return errore(401, "Chiave del gestionale mancante o non valida.");

  const { data, error } = await supabase.rpc("gestionale_nuovi_iscritti", { p_chiave: chiave });
  if (error) return erroreDb(error);

  const { lotto, righe } = data as { lotto: string | null; righe: Record<string, unknown>[] };
  if (!lotto) return new Response(null, { status: 204 });

  return new Response(scriviCsv(COLONNE, righe.map((r) => ({ ...r, ragione_sociale: ragioneSociale(r) }))), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="nuovi-iscritti-${lotto}.csv"`,
      "Cache-Control": "no-store",
      "X-Lotto": lotto,
      "X-Righe": String(righe.length),
    },
  });
}
