import type { richiediAdmin } from "./sessione";

export type ClienteDaCompletare = {
  id_readypro: string | null; cognome: string; nome: string; email: string | null; cellulare: string | null;
  tessera: string | null; iscritto_il: string; manca: string; telefono_app: string | null; email_app: string | null;
};

/** La data da cui partire: AAAA-MM-GG valida, altrimenti il 7 dicembre 2023 (apertura del negozio). */
export const dataInizio = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "2023-12-07");

export async function clientiDaCompletare(supabase: Awaited<ReturnType<typeof richiediAdmin>>["supabase"], dal: string) {
  const { data, error } = await supabase.rpc("admin_clienti_da_completare", { p_dal: dal });
  return { clienti: (data ?? []) as ClienteDaCompletare[], error };
}
