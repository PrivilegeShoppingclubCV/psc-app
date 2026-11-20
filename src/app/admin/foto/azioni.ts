"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { conEsito, messaggioDb, testo, testoONull } from "@/lib/admin/form";
import { richiediAdmin } from "@/lib/admin/sessione";

const PAGINA = "/admin/foto";

export async function aggiungiOperatoreFoto(form: FormData) {
  const { supabase } = await richiediAdmin();
  const email = testo(form, "email").toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) redirect(conEsito(PAGINA, { errore: "Scrivi un'email valida." }));
  const { error } = await supabase
    .from("foto_operatori")
    .upsert({ email, nome: testoONull(form, "nome"), attivo: true }, { onConflict: "email" });
  revalidatePath(PAGINA);
  redirect(conEsito(PAGINA, error ? { errore: messaggioDb(error) } : { ok: `${email} ora può generare le foto.` }));
}

export async function attivaOperatoreFoto(form: FormData) {
  const { supabase } = await richiediAdmin();
  const attivo = testo(form, "attivo") === "1";
  const { error } = await supabase.from("foto_operatori").update({ attivo }).eq("id", testo(form, "id"));
  revalidatePath(PAGINA);
  redirect(conEsito(PAGINA, error ? { errore: messaggioDb(error) } : { ok: attivo ? "Accesso riattivato." : "Accesso disattivato: le sue foto restano nel registro." }));
}
