// Chi usa la cassa: admin o operatori dei negozi (tabella staff).
// Anche qui l'ultima difesa sono le funzioni del database (verifica_buono, usa_buono).

import { cache } from "react";
import { redirect } from "next/navigation";
import { getSupabase } from "@/lib/dati";

type Supabase = NonNullable<Awaited<ReturnType<typeof getSupabase>>>;

export type AccessoCassa =
  | { stato: "non_configurato" }
  | { stato: "non_entrato" }
  | { stato: "non_staff"; email: string }
  | { stato: "staff"; email: string; nome: string | null; admin: boolean; negozioId: string | null; supabase: Supabase };

export const getAccessoCassa = cache(async (): Promise<AccessoCassa> => {
  const supabase = await getSupabase();
  if (!supabase) return { stato: "non_configurato" };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { stato: "non_entrato" };
  const { data } = await supabase.from("staff").select("ruolo, nome, negozio_id").eq("user_id", user.id).maybeSingle();
  if (!data) return { stato: "non_staff", email: user.email ?? "" };
  return { stato: "staff", email: user.email ?? "", nome: data.nome, admin: data.ruolo === "admin", negozioId: data.negozio_id, supabase };
});

export async function richiediStaff() {
  const accesso = await getAccessoCassa();
  if (accesso.stato !== "staff") redirect("/cassa");
  return accesso;
}
