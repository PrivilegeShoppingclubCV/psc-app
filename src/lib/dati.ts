// Letture dal database per le pagine (Server Components).
// Finché Supabase non è configurato restituiscono i dati finti di mock-data.ts,
// così le anteprime senza chiavi continuano a funzionare.

import { cache } from "react";
import * as mock from "./mock-data";
import { createClient } from "./supabase/server";
import type { MovimentoPunti, Negozio, Offerta, Premio, Socio } from "./tipi";

export interface Sessione {
  /** false = Supabase non configurato, l'app usa i dati finti. */
  configurato: boolean;
  /** null = non ha fatto l'accesso. */
  email: string | null;
  /** null = account senza tessera collegata (o tessera non attiva). */
  socio: (Socio & { id: string }) | null;
}

// Una sola istanza del client e una sola lettura della sessione per richiesta.
export const getSupabase = cache(createClient);

const DESCRIZIONI: Record<string, string> = {
  saldo_iniziale: "Saldo importato dal gestionale",
  acquisto: "Acquisto",
  riscatto: "Premio riscattato",
  bonus: "Bonus",
  invito: "Invito di un amico",
  rettifica: "Rettifica",
  storno: "Storno",
  scadenza: "Punti scaduti",
};

export const getSessione = cache(async (): Promise<Sessione> => {
  const supabase = await getSupabase();
  if (!supabase) return { configurato: false, email: mock.socio.email, socio: { ...mock.socio, id: "mock" } };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { configurato: true, email: null, socio: null };

  const { data, error } = await supabase
    .from("soci")
    .select("id, numero_tessera, nome, cognome, email, iscritto_il, codice_invito, stato_cassa, livelli(nome)")
    .eq("user_id", user.id)
    .eq("stato", "attivo")
    .maybeSingle();
  if (error) throw error;

  return {
    configurato: true,
    email: user.email ?? null,
    socio: data && {
      id: data.id,
      numeroTessera: data.numero_tessera,
      nome: data.nome ?? "",
      cognome: data.cognome ?? "",
      email: data.email ?? user.email ?? "",
      iscrittoDal: data.iscritto_il,
      codiceInvito: data.codice_invito,
      inAttivazione: data.stato_cassa === "in_attivazione",
      livello: (data.livelli as unknown as { nome: string } | null)?.nome ?? "Classic",
    },
  };
});

// Le query filtrano sempre per socio_id: lo staff, per le regole di accesso,
// vedrebbe anche i movimenti degli altri soci.

export async function getSaldo(socioId: string): Promise<number> {
  const supabase = await getSupabase();
  if (!supabase) return mock.saldoPunti;
  const { data, error } = await supabase.from("saldi_punti").select("saldo").eq("socio_id", socioId).maybeSingle();
  if (error) throw error;
  return data?.saldo ?? 0;
}

export async function getMovimenti(socioId: string): Promise<MovimentoPunti[]> {
  const supabase = await getSupabase();
  if (!supabase) return mock.movimenti;
  const { data, error } = await supabase
    .from("movimenti_punti")
    .select("id, data_movimento, tipo, descrizione, punti, negozi(nome)")
    .eq("socio_id", socioId)
    .order("data_movimento", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data.map((m) => ({
    id: m.id,
    data: m.data_movimento,
    descrizione: m.descrizione ?? DESCRIZIONI[m.tipo] ?? m.tipo,
    negozio: (m.negozi as unknown as { nome: string } | null)?.nome,
    punti: m.punti,
  }));
}

export async function getPremi(): Promise<Premio[]> {
  const supabase = await getSupabase();
  if (!supabase) return mock.premi;
  const { data, error } = await supabase
    .from("premi")
    .select("id, nome, soglia_punti")
    .eq("attivo", true)
    .order("soglia_punti");
  if (error) throw error;
  return data.map((p) => ({ id: p.id, nome: p.nome, soglia: p.soglia_punti }));
}

export async function getNegozi(): Promise<Negozio[]> {
  const supabase = await getSupabase();
  if (!supabase) return mock.negozi;
  const { data, error } = await supabase
    .from("negozi")
    .select("id, nome, indirizzo, cap, citta, orari_testo")
    .eq("attivo", true)
    .order("ordine")
    .order("nome");
  if (error) throw error;
  return data.map((n) => ({
    id: n.id,
    nome: n.nome,
    indirizzo: [n.indirizzo, [n.cap, n.citta].filter(Boolean).join(" ")].filter(Boolean).join(", "),
    orari: n.orari_testo ?? "",
  }));
}

export async function getOfferte(): Promise<Offerta[]> {
  const supabase = await getSupabase();
  if (!supabase) return mock.offerte;
  const adesso = new Date().toISOString();
  // Le regole di accesso nascondono già le bozze ai soci; i filtri servono
  // perché admin e operatori, che vedono tutto, nell'app vedano solo le offerte in corso.
  const { data, error } = await supabase
    .from("offerte")
    .select("id, titolo, marca, prezzo_soci, prezzo_listino, etichetta, valida_al, solo_tesserati, immagine_path")
    .eq("pubblicata", true)
    .lte("valida_dal", adesso)
    .or(`valida_al.is.null,valida_al.gt.${adesso}`)
    .order("in_evidenza", { ascending: false })
    .order("ordine")
    .order("valida_al", { nullsFirst: false });
  if (error) throw error;
  return data.map((o) => ({
    id: o.id,
    marca: o.marca ?? "",
    nome: o.titolo,
    prezzoSoci: o.prezzo_soci,
    prezzoListino: o.prezzo_listino,
    etichetta: o.etichetta ?? undefined,
    scadenza: o.valida_al,
    soloTesserati: o.solo_tesserati,
    immagineUrl: o.immagine_path ? supabase.storage.from("offerte").getPublicUrl(o.immagine_path).data.publicUrl : undefined,
  }));
}
