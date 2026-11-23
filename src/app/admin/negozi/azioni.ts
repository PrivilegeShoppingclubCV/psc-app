"use server";

import { revalidatePath, updateTag } from "next/cache";
import { TAG } from "@/lib/pubblico";
import { redirect } from "next/navigation";
import { conEsito, intero, messaggioDb, numero, spunta, testo, testoONull } from "@/lib/admin/form";
import { richiediAdmin } from "@/lib/admin/sessione";

export async function salvaNegozio(form: FormData) {
  const { supabase } = await richiediAdmin();
  const id = testo(form, "id");
  const pagina = `/admin/negozi/${id || "nuovo"}`;
  const errore = (m: string) => redirect(conEsito(pagina, { errore: m }));

  const nome = testo(form, "nome");
  if (!nome) errore("Il nome è obbligatorio.");
  const lat = numero(form, "latitudine");
  const lng = numero(form, "longitudine");
  const ordine = intero(form, "ordine");
  if (Number.isNaN(lat) || Number.isNaN(lng)) errore("Latitudine e longitudine sono numeri, es. 43,7696.");
  if (Number.isNaN(ordine)) errore("L'ordine deve essere un numero intero.");

  const dati = {
    nome,
    codice_gestionale: testoONull(form, "codice_gestionale"),
    indirizzo: testoONull(form, "indirizzo"),
    cap: testoONull(form, "cap"),
    citta: testoONull(form, "citta"),
    provincia: testoONull(form, "provincia")?.toUpperCase() ?? null,
    telefono: testoONull(form, "telefono"),
    email: testoONull(form, "email"),
    orari_testo: testoONull(form, "orari_testo"),
    latitudine: lat,
    longitudine: lng,
    immagine_path: testoONull(form, "immagine_path"),
    attivo: spunta(form, "attivo"),
    ordine: ordine ?? 0,
  };
  const { data, error } = id
    ? await supabase.from("negozi").update(dati).eq("id", id).select("id").single()
    : await supabase.from("negozi").insert(dati).select("id").single();
  if (error) errore(messaggioDb(error));

  updateTag(TAG.negozi);
  revalidatePath("/negozi");
  redirect(conEsito(`/admin/negozi/${data!.id}`, { ok: id ? "Negozio salvato." : "Negozio creato." }));
}
