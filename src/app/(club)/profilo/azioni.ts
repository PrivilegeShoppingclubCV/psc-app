"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getRecapiti, getSessione, getSupabase } from "@/lib/dati";
import { conErrore, testo } from "../../accesso/flusso";

// Le modifiche vanno anche a ReadyPro: il server dei negozi le scarica con i nuovi iscritti.
export async function salvaRecapiti(form: FormData) {
  const supabase = await getSupabase();
  if (!supabase) redirect("/profilo");
  const { socio } = await getSessione();
  if (!socio) redirect("/collega-tessera");

  const campi = { telefono: testo(form, "telefono"), nascita: testo(form, "nascita"), indirizzo: testo(form, "indirizzo"), cap: testo(form, "cap"), citta: testo(form, "citta") };
  if (!campi.telefono) redirect(conErrore("/profilo/dati", "Il numero di telefono è obbligatorio.", campi));

  // Il negozio preferito non è in questo modulo: si tiene quello che c'è.
  const { negozioPreferitoId } = await getRecapiti(socio.id);
  const { error } = await supabase.rpc("aggiorna_profilo", {
    p_telefono: campi.telefono,
    p_data_nascita: campi.nascita || null,
    p_cap: campi.cap || null,
    p_citta: campi.citta || null,
    p_negozio_preferito_id: negozioPreferitoId,
    p_indirizzo: campi.indirizzo || null,
  });
  if (error) redirect(conErrore("/profilo/dati", error.message, campi));
  revalidatePath("/profilo");
  redirect("/profilo?salvato=1");
}
