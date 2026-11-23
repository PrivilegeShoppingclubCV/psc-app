// Dati uguali per tutti i soci (premi, negozi, regola dei punti): si leggono con
// la chiave pubblica, senza la sessione di chi guarda, e si tengono in cache sul
// server per 5 minuti. Così mille soci che aprono "Punti" fanno una query, non mille.
// Quando l'admin li cambia dal pannello, updateTag svuota subito la cache.
import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { supabaseAnonKey, supabaseUrl } from "./supabase/config";

export const TAG = { premi: "premi", negozi: "negozi", regolaPunti: "regola-punti" } as const;

const CINQUE_MINUTI = 300;

const anonimo = () => createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });

export const premiAttivi = unstable_cache(async () => {
  const { data, error } = await anonimo().from("premi").select("id, nome, soglia_punti").eq("attivo", true).order("soglia_punti");
  if (error) throw error;
  return data;
}, ["premi-attivi"], { revalidate: CINQUE_MINUTI, tags: [TAG.premi] });

export const negoziAttivi = unstable_cache(async () => {
  const { data, error } = await anonimo().from("negozi").select("id, nome, indirizzo, cap, citta, orari_testo")
    .eq("attivo", true).order("ordine").order("nome");
  if (error) throw error;
  return data;
}, ["negozi-attivi"], { revalidate: CINQUE_MINUTI, tags: [TAG.negozi] });

/** null se la funzione manca (migrazione non applicata): chi la usa mostra la regola di default. */
export const euroPerPunto = unstable_cache(async () => {
  const { data, error } = await anonimo().rpc("euro_per_punto");
  return error ? null : Number(data) || null;
}, ["euro-per-punto"], { revalidate: CINQUE_MINUTI, tags: [TAG.regolaPunti] });
