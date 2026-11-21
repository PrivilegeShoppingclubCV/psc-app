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

  const campi = { nome: testo(form, "nome"), cognome: testo(form, "cognome"), telefono: testo(form, "telefono"), nascita: testo(form, "nascita"), indirizzo: testo(form, "indirizzo"), cap: testo(form, "cap"), citta: testo(form, "citta") };
  if (!campi.nome || !campi.cognome) redirect(conErrore("/profilo/dati", "Nome e cognome sono obbligatori.", campi));
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
    p_nome: campi.nome,
    p_cognome: campi.cognome,
  });
  if (error) redirect(conErrore("/profilo/dati", error.message, campi));
  revalidatePath("/profilo");
  redirect("/profilo?salvato=1");
}

const CAMPI_SEGNALAZIONE = ["nome", "cognome", "email", "telefono", "data_nascita", "indirizzo", "tessera", "punti", "altro"];

// Un dato sbagliato che il socio non può correggere da solo (es. l'email): arriva agli admin.
export async function segnalaDato(form: FormData) {
  const supabase = await getSupabase();
  if (!supabase) redirect("/profilo");
  const campo = testo(form, "campo");
  const messaggio = testo(form, "messaggio");
  const campi = { campo, messaggio };
  if (!CAMPI_SEGNALAZIONE.includes(campo)) redirect(conErrore("/profilo/segnala", "Scegli quale dato non è corretto.", campi));
  if (messaggio.length < 3) redirect(conErrore("/profilo/segnala", "Scrivi cosa non è corretto e il dato giusto.", campi));
  const { error } = await supabase.rpc("segnala_dato_errato", { p_campo: campo, p_messaggio: messaggio });
  if (error) redirect(conErrore("/profilo/segnala", error.message, campi));
  redirect("/profilo?segnalato=1");
}
