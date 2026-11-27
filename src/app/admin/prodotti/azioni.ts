"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { conEsito, intero, messaggioDb, spunta, testo, testoONull } from "@/lib/admin/form";
import { richiediAdmin } from "@/lib/admin/sessione";

export async function salvaProdotto(form: FormData) {
  const { supabase } = await richiediAdmin();
  const id = testo(form, "id");
  const puntiExtra = intero(form, "punti_extra");
  if (Number.isNaN(puntiExtra) || (puntiExtra !== null && puntiExtra < 0)) {
    redirect(conEsito(`/admin/prodotti/${id}`, { errore: "I punti extra devono essere un numero intero, es. 50." }));
  }
  const { error } = await supabase
    .from("prodotti")
    .update({
      immagine_path: testoONull(form, "immagine_path"),
      nascosto: spunta(form, "nascosto"),
      punti_extra: puntiExtra || null,
      nota_extra: testoONull(form, "nota_extra"),
    })
    .eq("id", id);
  revalidatePath("/offerte", "layout");
  redirect(conEsito(`/admin/prodotti/${id}`, error ? { errore: messaggioDb(error) } : { ok: "Prodotto salvato." }));
}

export async function rigeneraVetrina() {
  const { supabase } = await richiediAdmin();
  const { error } = await supabase.rpc("vetrina_rigenera");
  revalidatePath("/offerte", "layout");
  redirect(conEsito("/admin/prodotti", error ? { errore: messaggioDb(error) } : { ok: "Vetrina di oggi rifatta con i prodotti e le foto attuali." }));
}

