// Chi sta usando il pannello admin. Lo chiamano il layout, le pagine e le azioni:
// il layout da solo non basta, perché le azioni si possono chiamare direttamente.
// Le regole di Supabase (RLS) restano comunque l'ultima difesa: anche saltando
// questi controlli, chi non è admin non legge né scrive nulla.

import { cache } from "react";
import { redirect } from "next/navigation";
import { getSupabase } from "@/lib/dati";

export type Accesso =
  | { stato: "non_configurato" }
  | { stato: "non_entrato" }
  | { stato: "non_admin"; email: string; operatore: boolean }
  | { stato: "admin"; email: string; userId: string; nome: string | null; supabase: NonNullable<Awaited<ReturnType<typeof getSupabase>>> };

export const getAccesso = cache(async (): Promise<Accesso> => {
  const supabase = await getSupabase();
  if (!supabase) return { stato: "non_configurato" };

  // getClaims controlla il token con le chiavi pubbliche di Supabase, senza
  // chiedere ogni volta al servizio Auth (una chiamata di rete in meno a pagina).
  const { data: claims } = await supabase.auth.getClaims();
  const user = claims?.claims.sub ? { id: claims.claims.sub, email: claims.claims.email as string | undefined } : null;
  if (!user) return { stato: "non_entrato" };

  const { data } = await supabase.from("staff").select("ruolo, nome").eq("user_id", user.id).maybeSingle();
  if (data?.ruolo !== "admin") return { stato: "non_admin", email: user.email ?? "", operatore: data?.ruolo === "operatore" };
  return { stato: "admin", email: user.email ?? "", userId: user.id, nome: data.nome, supabase };
});

/** Per pagine e azioni: il client Supabase dell'admin, oppure si torna al pannello (che spiega cosa manca). */
export async function richiediAdmin() {
  const accesso = await getAccesso();
  if (accesso.stato !== "admin") redirect("/admin");
  return accesso;
}
