"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { conEsito, messaggioDb, testo } from "@/lib/admin/form";
import { richiediAdmin } from "@/lib/admin/sessione";

export async function annullaBuonoAdmin(form: FormData) {
  const { supabase } = await richiediAdmin();
  const { error } = await supabase.rpc("annulla_buono", { p_id: testo(form, "id") });
  revalidatePath("/admin/buoni");
  redirect(conEsito("/admin/buoni", error ? { errore: messaggioDb(error) } : { ok: "Buono annullato: i punti sono tornati al socio." }));
}
