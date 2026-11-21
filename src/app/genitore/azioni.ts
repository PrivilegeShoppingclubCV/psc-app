"use server";

// Consenso del genitore per i soci minorenni (migrazione 20261121160000):
// il ragazzo crea un link dall'app e lo manda al genitore, che approva da /genitore/<codice>.

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSupabase } from "@/lib/dati";
import { conErrore, testo } from "../accesso/flusso";

/** Crea il link da mandare al genitore. */
export async function creaLinkGenitore(): Promise<{ url: string } | { errore: string }> {
  const supabase = await getSupabase();
  const h = await headers();
  const origine = h.get("origin") ?? `https://${h.get("host")}`;
  if (!supabase) return { url: `${origine}/genitore/anteprima` };
  const { data, error } = await supabase.rpc("crea_link_genitore");
  if (error) return { errore: error.message };
  return { url: `${origine}/genitore/${data as string}` };
}

/** Il genitore approva dal link. */
export async function approvaGenitore(form: FormData) {
  const codice = testo(form, "codice");
  const pagina = `/genitore/${encodeURIComponent(codice)}`;
  const supabase = await getSupabase();
  if (!supabase) redirect(`${pagina}?fatto=1`);

  const campi = { nome: testo(form, "nome"), cognome: testo(form, "cognome"), email: testo(form, "email") };
  const { error } = await supabase.rpc("approva_genitore", {
    p_token: codice,
    p_nome: campi.nome,
    p_cognome: campi.cognome,
    p_email: campi.email,
    p_dichiara: form.get("dichiaro") === "on",
    p_iscrizione: form.get("iscrizione") === "on",
    p_punti: form.get("punti") === "on",
    p_marketing: form.get("marketing") === "on",
    p_user_agent: (await headers()).get("user-agent"),
  });
  if (error) redirect(conErrore(pagina, error.message, campi));
  redirect(`${pagina}?fatto=1`);
}
