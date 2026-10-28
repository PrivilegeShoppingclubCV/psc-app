"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { conEsito, fineGiorno, inizioGiorno, intero, messaggioDb, numero, spunta, testo, testoONull } from "@/lib/admin/form";
import { richiediAdmin } from "@/lib/admin/sessione";

export async function salvaOfferta(form: FormData) {
  const { supabase, userId } = await richiediAdmin();
  const id = testo(form, "id");
  const pagina = id ? `/admin/offerte/${id}` : "/admin/offerte/nuova";
  const errore = (m: string) => redirect(conEsito(pagina, { errore: m }));

  const titolo = testo(form, "titolo");
  if (!titolo) errore("Il titolo è obbligatorio.");
  const prezzoSoci = numero(form, "prezzo_soci");
  const prezzoListino = numero(form, "prezzo_listino");
  const ordine = intero(form, "ordine");
  if (Number.isNaN(prezzoSoci) || Number.isNaN(prezzoListino)) errore("Scrivi i prezzi come numeri, es. 59,90.");
  if (Number.isNaN(ordine)) errore("L'ordine deve essere un numero intero.");
  const etichetta = testoONull(form, "etichetta");
  if (prezzoSoci === null && !etichetta) errore("Indica il prezzo soci oppure un'etichetta (es. -30%).");

  const dal = testo(form, "valida_dal");
  const al = testo(form, "valida_al");
  const livello = testo(form, "livello_minimo");

  const dati = {
    titolo,
    marca: testoONull(form, "marca"),
    descrizione: testoONull(form, "descrizione"),
    prezzo_soci: prezzoSoci,
    prezzo_listino: prezzoListino,
    etichetta,
    immagine_path: testoONull(form, "immagine_path"),
    valida_dal: dal ? inizioGiorno(dal) : new Date().toISOString(),
    valida_al: al ? fineGiorno(al) : null,
    solo_tesserati: spunta(form, "solo_tesserati"),
    livello_minimo: livello || null,
    pubblicata: spunta(form, "pubblicata"),
    in_evidenza: spunta(form, "in_evidenza"),
    ordine: ordine ?? 0,
  };

  const { data, error } = id
    ? await supabase.from("offerte").update(dati).eq("id", id).select("id").single()
    : await supabase.from("offerte").insert({ ...dati, creato_da: userId }).select("id").single();
  if (error) errore(messaggioDb(error));
  const offertaId = data!.id;

  // Negozi: nessuno spuntato = vale in tutti.
  const negozi = form.getAll("negozi").map(String).filter(Boolean);
  const { error: e1 } = await supabase.from("offerte_negozi").delete().eq("offerta_id", offertaId);
  if (e1) errore(messaggioDb(e1));
  if (negozi.length) {
    const { error: e2 } = await supabase.from("offerte_negozi").insert(negozi.map((negozio_id) => ({ offerta_id: offertaId, negozio_id })));
    if (e2) errore(messaggioDb(e2));
  }

  revalidatePath("/offerte");
  revalidatePath("/home");
  revalidatePath("/admin", "layout");
  redirect(conEsito(`/admin/offerte/${offertaId}`, { ok: id ? "Offerta salvata." : "Offerta creata." }));
}

export async function pubblicaOfferta(form: FormData) {
  const { supabase } = await richiediAdmin();
  const id = testo(form, "id");
  const pubblicata = form.get("pubblicata") === "true";
  const { error } = await supabase.from("offerte").update({ pubblicata }).eq("id", id);
  revalidatePath("/offerte");
  revalidatePath("/home");
  redirect(conEsito(testo(form, "torna") || "/admin/offerte", error
    ? { errore: messaggioDb(error) }
    : { ok: pubblicata ? "Offerta pubblicata." : "Offerta tolta dall'app (ora è in bozza)." }));
}

export async function eliminaOfferta(form: FormData) {
  const { supabase } = await richiediAdmin();
  const id = testo(form, "id");
  const { error } = await supabase.from("offerte").delete().eq("id", id);
  if (error) redirect(conEsito(`/admin/offerte/${id}`, { errore: messaggioDb(error) }));
  revalidatePath("/offerte");
  revalidatePath("/home");
  redirect(conEsito("/admin/offerte", { ok: "Offerta eliminata." }));
}
