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

export async function salvaMappatura(form: FormData) {
  const { supabase } = await richiediAdmin();
  let valore: unknown;
  try {
    valore = JSON.parse(testo(form, "mappatura") || "{}");
  } catch {
    redirect(conEsito("/admin/gestionale", { errore: "La mappatura non è JSON valido: controlla virgolette e virgole." }));
  }
  const valida = valore && typeof valore === "object" && !Array.isArray(valore)
    && Object.values(valore).every((v) => typeof v === "string");
  if (!valida) redirect(conEsito("/admin/gestionale", { errore: "La mappatura è un elenco campo → colonna, es. {\"numero_tessera\": \"Codice a barre\"}." }));

  const { error } = await supabase
    .from("impostazioni")
    .update({ valore })
    .eq("chiave", "gestionale_mappatura_soci");
  redirect(conEsito("/admin/gestionale", error ? { errore: messaggioDb(error) } : { ok: "Mappatura salvata: vale dal prossimo file inviato da ReadyPro." }));
}

/** Elabora un file arrivato prima che la mappatura fosse impostata. */
export async function elaboraImport(form: FormData) {
  const { supabase } = await richiediAdmin();
  const id = testo(form, "id");
  const { data: mappa } = await supabase.from("impostazioni").select("valore").eq("chiave", "gestionale_mappatura_soci").maybeSingle();
  const mappatura = (mappa?.valore ?? {}) as Record<string, string>;
  if (!mappatura.numero_tessera) redirect(conEsito("/admin/gestionale", { errore: "Prima salva la mappatura, con almeno numero_tessera." }));

  const { error: e1 } = await supabase.from("import_batch").update({ mappatura_colonne: mappatura }).eq("id", id);
  if (e1) redirect(conEsito("/admin/gestionale", { errore: messaggioDb(e1) }));
  const { error } = await supabase.rpc("importa_soci", { p_batch_id: id });
  revalidatePath("/admin", "layout");
  redirect(conEsito("/admin/gestionale", error ? { errore: messaggioDb(error) } : { ok: "File elaborato: vedi l'esito qui sotto." }));
}
