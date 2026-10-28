"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { conEsito, messaggioDb, testo, testoONull } from "@/lib/admin/form";
import { richiediAdmin } from "@/lib/admin/sessione";

const RUOLI = ["admin", "operatore"];

export async function aggiungiStaff(form: FormData) {
  const { supabase } = await richiediAdmin();
  const email = testo(form, "email");
  const ruolo = testo(form, "ruolo");
  if (!email || !RUOLI.includes(ruolo)) redirect(conEsito("/admin/staff", { errore: "Indica email e ruolo." }));
  const { error } = await supabase.rpc("admin_aggiungi_staff", {
    p_email: email,
    p_ruolo: ruolo,
    p_negozio_id: testo(form, "negozio_id") || null,
    p_nome: testoONull(form, "nome"),
  });
  revalidatePath("/admin/staff");
  redirect(conEsito("/admin/staff", error ? { errore: messaggioDb(error) } : { ok: `${email} ora è ${ruolo}.` }));
}

export async function modificaStaff(form: FormData) {
  const { supabase } = await richiediAdmin();
  const userId = testo(form, "user_id");
  const ruolo = testo(form, "ruolo");
  if (!RUOLI.includes(ruolo)) redirect(conEsito("/admin/staff", { errore: "Ruolo non valido." }));
  const { error } = await supabase
    .from("staff")
    .update({ ruolo, negozio_id: testo(form, "negozio_id") || null })
    .eq("user_id", userId);
  revalidatePath("/admin/staff");
  redirect(conEsito("/admin/staff", error ? { errore: messaggioDb(error) } : { ok: "Ruolo aggiornato." }));
}

export async function rimuoviStaff(form: FormData) {
  const { supabase, userId: io } = await richiediAdmin();
  const userId = testo(form, "user_id");
  if (userId === io) redirect(conEsito("/admin/staff", { errore: "Non puoi toglierti da solo: chiedi a un altro admin." }));
  const { error } = await supabase.from("staff").delete().eq("user_id", userId);
  revalidatePath("/admin/staff");
  redirect(conEsito("/admin/staff", error ? { errore: messaggioDb(error) } : { ok: "Tolto dallo staff. L'account resta, senza accesso al pannello." }));
}
