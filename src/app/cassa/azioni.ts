"use server";

import { redirect } from "next/navigation";
import { testo } from "@/lib/admin/form";
import { richiediStaff } from "./sessione";

/** Il commesso segna il buono come usato. Il database rifiuta buoni usati, annullati o scaduti. */
export async function usaBuono(form: FormData) {
  const { supabase } = await richiediStaff();
  const codice = testo(form, "codice");
  const negozio = testo(form, "negozio");
  const { error } = await supabase.rpc("usa_buono", { p_codice: codice, p_negozio_id: negozio || null });
  const q = new URLSearchParams({ codice });
  if (error) q.set("errore", error.message);
  else q.set("usato", "1");
  redirect(`/cassa?${q}`);
}
