"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { conEsito, messaggioDb, testo } from "@/lib/admin/form";
import { richiediAdmin } from "@/lib/admin/sessione";

export type EsitoChiave = { chiave?: string; errore?: string } | null;

/** Restituisce la chiave in chiaro alla pagina (mai nell'indirizzo): si vede una volta sola. */
export async function creaChiave(_prima: EsitoChiave, form: FormData): Promise<EsitoChiave> {
  const { supabase } = await richiediAdmin();
  const { data, error } = await supabase.rpc("gestionale_crea_chiave", { p_nome: testo(form, "nome") });
  revalidatePath("/admin/gestionale");
  return error ? { errore: messaggioDb(error) } : { chiave: data as string };
}

export async function revocaChiave(form: FormData) {
  const { supabase } = await richiediAdmin();
  const { error } = await supabase.rpc("gestionale_revoca_chiave", { p_id: testo(form, "id") });
  revalidatePath("/admin/gestionale");
  redirect(conEsito("/admin/gestionale", error ? { errore: messaggioDb(error) } : { ok: "Chiave revocata: smette subito di funzionare." }));
}

// I due file che arrivano da ReadyPro: per ognuno la sua mappatura e la sua funzione di import.
const FILE = {
  soci: { chiave: "gestionale_mappatura_soci", importa: "importa_soci", richiesti: ["numero_tessera"] },
  vendite: { chiave: "gestionale_mappatura_vendite", importa: "importa_movimenti_punti", richiesti: ["numero_tessera", "importo|punti"] },
  // Le righe non passano da un import da elaborare: si salvano appena arrivano.
  righe: { chiave: "gestionale_mappatura_righe", importa: null, richiesti: [] },
} as const;

function tipoFile(form: FormData) {
  const t = testo(form, "tipo");
  return t === "vendite" ? FILE.vendite : t === "righe" ? FILE.righe : FILE.soci;
}

const mancanti = (m: Record<string, string>, richiesti: readonly string[]) =>
  richiesti.filter((r) => !r.split("|").some((c) => m[c]));

export async function salvaMappatura(form: FormData) {
  const { supabase } = await richiediAdmin();
  const file = tipoFile(form);
  let valore: unknown;
  try {
    valore = JSON.parse(testo(form, "mappatura") || "{}");
  } catch {
    redirect(conEsito("/admin/gestionale", { errore: "La mappatura non è JSON valido: controlla virgolette e virgole." }));
  }
  const valida = valore && typeof valore === "object" && !Array.isArray(valore)
    && Object.values(valore).every((v) => typeof v === "string");
  if (!valida) redirect(conEsito("/admin/gestionale", { errore: "La mappatura è un elenco campo → colonna, es. {\"numero_tessera\": \"Cod.Barre\"}." }));

  const { error } = await supabase
    .from("impostazioni")
    .update({ valore })
    .eq("chiave", file.chiave);
  redirect(conEsito("/admin/gestionale", error ? { errore: messaggioDb(error) } : { ok: "Mappatura salvata: vale dal prossimo file inviato da ReadyPro." }));
}

/** Elabora un file arrivato prima che la mappatura fosse impostata. */
export async function elaboraImport(form: FormData) {
  const { supabase } = await richiediAdmin();
  const file = tipoFile(form);
  if (!file.importa) redirect("/admin/gestionale");
  const id = testo(form, "id");
  const { data: mappa } = await supabase.from("impostazioni").select("valore").eq("chiave", file.chiave).maybeSingle();
  const mappatura = (mappa?.valore ?? {}) as Record<string, string>;
  const manca = mancanti(mappatura, file.richiesti);
  if (manca.length) redirect(conEsito("/admin/gestionale", { errore: `Prima salva la mappatura, con almeno ${manca.join(" e ").replace("|", " o ")}.` }));

  const { error: e1 } = await supabase.from("import_batch").update({ mappatura_colonne: mappatura }).eq("id", id);
  if (e1) redirect(conEsito("/admin/gestionale", { errore: messaggioDb(e1) }));
  const { error } = await supabase.rpc(file.importa, { p_batch_id: id });
  revalidatePath("/admin", "layout");
  redirect(conEsito("/admin/gestionale", error ? { errore: messaggioDb(error) } : { ok: "File elaborato: vedi l'esito qui sotto." }));
}

export async function salvaRegolaPunti(form: FormData) {
  const { supabase } = await richiediAdmin();
  const euro = Number(testo(form, "euro_per_punto").replace(",", "."));
  if (!Number.isFinite(euro) || euro <= 0) redirect(conEsito("/admin/gestionale", { errore: "Scrivi quanti euro servono per 1 punto, es. 5." }));
  const dal = testo(form, "punti_dal");
  if (dal && !/^\d{4}-\d{2}-\d{2}$/.test(dal)) redirect(conEsito("/admin/gestionale", { errore: "Data di avvio non valida." }));
  const [a, b] = await Promise.all([
    supabase.from("impostazioni").update({ valore: euro }).eq("chiave", "euro_per_punto"),
    supabase.from("impostazioni").update({ valore: dal }).eq("chiave", "punti_dal"),
  ]);
  const error = a.error ?? b.error;
  revalidatePath("/punti");
  redirect(conEsito("/admin/gestionale", error ? { errore: messaggioDb(error) } : { ok: "Regola dei punti salvata: vale per le prossime vendite." }));
}
