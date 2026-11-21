"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { conEsito, messaggioDb, testo } from "@/lib/admin/form";
import { richiediAdmin } from "@/lib/admin/sessione";

export async function risolviSegnalazione(form: FormData) {
  const { supabase } = await richiediAdmin();
  const { error } = await supabase.rpc("admin_risolvi_segnalazione", { p_id: testo(form, "id"), p_nota: testo(form, "nota") || null });
  revalidatePath("/admin/segnalazioni");
  redirect(conEsito("/admin/segnalazioni", error ? { errore: messaggioDb(error) } : { ok: "Segnalazione risolta." }));
}
