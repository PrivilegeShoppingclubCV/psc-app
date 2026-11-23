"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSessione, getSupabase } from "@/lib/dati";
import { conErrore, testo } from "../../accesso/flusso";
import { getTestiClub } from "@/lib/i18n";

/** Il socio conferma il premio: punti scalati e buono creato, poi si apre il buono. */
export async function riscattaPremio(form: FormData) {
  const premio = testo(form, "premio");
  const supabase = await getSupabase();
  if (!supabase) redirect("/punti/buoni/b1");
  const { socio } = await getSessione();
  if (!socio) redirect("/collega-tessera");

  const { data, error } = await supabase.rpc("riscatta_premio", { p_premio_id: premio });
  if (error) {
    const t = (await getTestiClub()).buono;
    const messaggio = /insufficienti/i.test(error.message) ? t.puntiInsufficienti : t.errore;
    redirect(conErrore(`/punti/premi/${encodeURIComponent(premio)}`, messaggio));
  }
  revalidatePath("/punti");
  revalidatePath("/home");
  redirect(`/punti/buoni/${(data as { id: string }).id}`);
}

/** Il socio annulla un buono non usato: i punti tornano sul saldo. */
export async function annullaBuono(form: FormData) {
  const id = testo(form, "id");
  const supabase = await getSupabase();
  if (!supabase) redirect("/punti");
  const { error } = await supabase.rpc("annulla_buono", { p_id: id });
  if (error) redirect(conErrore(`/punti/buoni/${encodeURIComponent(id)}`, (await getTestiClub()).buono.errore));
  revalidatePath("/punti");
  revalidatePath("/home");
  redirect(`/punti/buoni/${encodeURIComponent(id)}`);
}
