"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabase } from "@/lib/dati";

/** Chi ha solo la tessera fisica aggiunge quella digitale (APP000123), con gli stessi punti. */
export async function attivaTesseraDigitale() {
  const supabase = await getSupabase();
  if (!supabase) redirect("/profilo");
  const { error } = await supabase.rpc("attiva_tessera_digitale");
  if (error) redirect(`/profilo?${new URLSearchParams({ errore: error.message })}`);
  revalidatePath("/", "layout");
  redirect("/home");
}
