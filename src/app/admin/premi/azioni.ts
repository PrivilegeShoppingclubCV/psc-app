"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { conEsito, intero, messaggioDb, numero, spunta, testo, testoONull } from "@/lib/admin/form";
import { richiediAdmin } from "@/lib/admin/sessione";

export async function salvaPremio(form: FormData) {
  const { supabase } = await richiediAdmin();
  const id = testo(form, "id");
  const pagina = `/admin/premi/${id || "nuovo"}`;
  const errore = (m: string) => redirect(conEsito(pagina, { errore: m }));

  const nome = testo(form, "nome");
  const soglia = intero(form, "soglia_punti");
  const valore = numero(form, "valore_euro");
  const ordine = intero(form, "ordine");
  if (!nome) errore("Il nome è obbligatorio.");
  if (!soglia || Number.isNaN(soglia) || soglia <= 0) errore("I punti necessari sono un numero intero maggiore di zero.");
  if (Number.isNaN(valore)) errore("Scrivi il valore come numero, es. 10 o 12,50.");
  if (Number.isNaN(ordine)) errore("L'ordine deve essere un numero intero.");

  const dati = {
    nome,
    descrizione: testoONull(form, "descrizione"),
    soglia_punti: soglia,
    valore_euro: valore,
    immagine_path: testoONull(form, "immagine_path"),
    attivo: spunta(form, "attivo"),
    ordine: ordine ?? 0,
  };
  const { data, error } = id
    ? await supabase.from("premi").update(dati).eq("id", id).select("id").single()
    : await supabase.from("premi").insert(dati).select("id").single();
  if (error) errore(messaggioDb(error));

  revalidatePath("/punti");
  revalidatePath("/home");
  redirect(conEsito(`/admin/premi/${data!.id}`, { ok: id ? "Premio salvato." : "Premio creato." }));
}
