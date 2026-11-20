"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { conEsito, messaggioDb, spunta, testo, testoONull } from "@/lib/admin/form";
import { richiediAdmin } from "@/lib/admin/sessione";

export async function salvaProdotto(form: FormData) {
  const { supabase } = await richiediAdmin();
  const id = testo(form, "id");
  const { error } = await supabase
    .from("prodotti")
    .update({ immagine_path: testoONull(form, "immagine_path"), nascosto: spunta(form, "nascosto") })
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

