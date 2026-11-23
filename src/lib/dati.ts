// Letture dal database per le pagine (Server Components).
// Finché Supabase non è configurato restituiscono i dati finti di mock-data.ts,
// così le anteprime senza chiavi continuano a funzionare.

import { cache } from "react";
import * as mock from "./mock-data";
import { createClient } from "./supabase/server";
import { tesseraDaMostrare, type MovimentoPunti, type Negozio, type Offerta, type Premio, type Recapiti, type RigaScontrino, type Scontrino, type Socio, type TesseraSocio } from "./tipi";

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

/** 18 anni compiuti (o data di nascita non indicata: soci importati). */
function maggiorenne(nascita: string | null) {
  if (!nascita) return true;
  const n = new Date(nascita);
  const oggi = new Date();
  const eta = oggi.getFullYear() - n.getFullYear() - (oggi < new Date(oggi.getFullYear(), n.getMonth(), n.getDate()) ? 1 : 0);
  return eta >= 18;
}

// I soci importati dal negozio hanno i punti già accesi: a loro non si chiede nulla.
function attesaGenitore(s: { stato: string; data_nascita: string | null; punti_attivi: boolean; autorizzazioni_genitore: { approvato_il: string | null }[] | null }): Socio["attesaGenitore"] {
  if (s.stato === "in_attesa") return "iscrizione";
  if (maggiorenne(s.data_nascita) || s.punti_attivi) return null;
  const approvato = (s.autorizzazioni_genitore ?? []).some((a) => a.approvato_il);
  return approvato ? null : "punti_offerte";
}

export const getSessione = cache(async (): Promise<Sessione> => {
  const supabase = await getSupabase();
  if (!supabase) return { configurato: false, email: mock.socio.email, socio: { ...mock.socio, id: "mock" } };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { configurato: true, email: null, socio: null };

  const { data, error } = await supabase
    .from("soci")
    .select("id, nome, cognome, email, iscritto_il, codice_invito, stato, data_nascita, punti_attivi, da_unire_con, livelli(nome), tessere(codice, tipo, stato_cassa), autorizzazioni_genitore(approvato_il)")
    .eq("user_id", user.id)
    .in("stato", ["attivo", "in_attesa"])
    .eq("tessere.stato", "attiva")
    .maybeSingle();
  if (error) throw error;

  const tessere: TesseraSocio[] = (data?.tessere ?? []).map((t) => ({
    codice: t.codice,
    tipo: t.tipo === "digitale" ? "digitale" : "fisica",
    inAttivazione: t.stato_cassa === "in_attivazione",
  }));
  const daMostrare = tesseraDaMostrare(tessere);

  return {
    configurato: true,
    email: user.email ?? null,
    socio: data && {
      id: data.id,
      numeroTessera: daMostrare?.codice ?? null,
      nome: data.nome ?? "",
      cognome: data.cognome ?? "",
      email: data.email ?? user.email ?? "",
      iscrittoDal: data.iscritto_il,
      codiceInvito: data.codice_invito,
      inAttivazione: daMostrare?.inAttivazione ?? false,
      tessere,
      livello: (data.livelli as unknown as { nome: string } | null)?.nome ?? "Classic",
      attesaGenitore: attesaGenitore(data),
      puntiAttivi: data.punti_attivi || maggiorenne(data.data_nascita),
      daUnire: data.da_unire_con !== null,
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

/** Euro di spesa per 1 punto (impostazioni.euro_per_punto, letta con una funzione: la tabella è solo per lo staff). */
export async function getEuroPerPunto(): Promise<number> {
  const supabase = await getSupabase();
  if (!supabase) return 5;
  // Se la migrazione non è ancora applicata la funzione manca: si mostra la regola di default invece di un errore.
  const { data, error } = await supabase.rpc("euro_per_punto");
  return (!error && Number(data)) || 5;
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

/** Scontrini degli ultimi 30 giorni (i più vecchi il database li cancella ogni notte). */
export async function getScontrini(socioId: string): Promise<Scontrino[]> {
  const supabase = await getSupabase();
  if (!supabase) return mock.scontrini;
  const dal = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("scontrini")
    .select("id, numero_documento, data_scontrino, totale, punti, righe, cassa, negozi(nome)")
    .eq("socio_id", socioId)
    .gte("data_scontrino", dal)
    .order("data_scontrino", { ascending: false })
    .order("numero_documento", { ascending: false })
    .limit(200);
  if (error) throw error;
  return data.map((s) => ({
    id: s.id,
    numero: s.numero_documento,
    data: s.data_scontrino,
    totale: Number(s.totale),
    negozio: (s.negozi as unknown as { nome: string } | null)?.nome ?? s.cassa ?? undefined,
    punti: s.punti,
    righe: Array.isArray(s.righe) ? (s.righe as RigaScontrino[]) : [],
  }));
}

export async function getRecapiti(socioId: string): Promise<Recapiti> {
  const supabase = await getSupabase();
  if (!supabase) return mock.recapiti;
  const { data, error } = await supabase
    .from("soci")
    .select("telefono, data_nascita, indirizzo, cap, citta, negozio_preferito_id")
    .eq("id", socioId)
    .single();
  if (error) throw error;
  return {
    telefono: data.telefono ?? "",
    nascita: data.data_nascita ?? "",
    indirizzo: data.indirizzo ?? "",
    cap: data.cap ?? "",
    citta: data.citta ?? "",
    negozioPreferitoId: data.negozio_preferito_id,
  };
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
    tipo: "staff" as const,
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

interface ProdottoDb {
  id: string;
  marca: string | null;
  descrizione: string;
  colore: string | null;
  taglia: string | null;
  prezzo_listino: number | null;
  prezzo_soci: number;
  immagine_path: string;
}

function daProdotto(supabase: NonNullable<Awaited<ReturnType<typeof getSupabase>>>, p: ProdottoDb): Offerta {
  return {
    id: p.id,
    tipo: "prodotto",
    marca: p.marca ?? "",
    nome: p.descrizione,
    dettaglio: [p.colore, p.taglia].filter(Boolean).join(" · ") || undefined,
    prezzoSoci: p.prezzo_soci,
    prezzoListino: p.prezzo_listino !== null && p.prezzo_listino > p.prezzo_soci ? p.prezzo_listino : null,
    scadenza: null,
    // I prodotti li vedono solo i soci: il bollino su ogni card sarebbe ripetitivo.
    soloTesserati: false,
    // Foto dal sito (URL completo) o dal bucket "prodotti".
    immagineUrl: /^https?:\/\//i.test(p.immagine_path)
      ? p.immagine_path
      : supabase.storage.from("prodotti").getPublicUrl(p.immagine_path).data.publicUrl,
  };
}

/**
 * Pagina Offerte: prima tutte le offerte dello staff in corso, poi i prodotti
 * della vetrina di oggi fino a vetrina_totale (scelti dal database, vedi la
 * migrazione prodotti_vetrina).
 */
export async function getVetrina(): Promise<Offerta[]> {
  const supabase = await getSupabase();
  if (!supabase) return mock.offerte;
  const [staff, prodotti, totale] = await Promise.all([
    getOfferte(),
    supabase.rpc("vetrina_del_giorno"),
    supabase.rpc("vetrina_impostazione", { p_chiave: "vetrina_totale", p_default: 10 }),
  ]);
  if (prodotti.error) throw prodotti.error;
  const posti = Math.max(0, Number(totale.data ?? 10) - staff.length);
  return [...staff, ...(prodotti.data as ProdottoDb[]).slice(0, posti).map((p) => daProdotto(supabase, p))];
}

export const PRODOTTI_PER_PAGINA = 40;

/** "Vedi tutte le offerte": i prodotti con foto che possono andare in offerta, dal punteggio più alto. */
export async function getCatalogo(pagina: number, cerca: string): Promise<{ prodotti: Offerta[]; totale: number }> {
  const supabase = await getSupabase();
  if (!supabase) return { prodotti: [], totale: 0 };
  let query = supabase
    .from("prodotti_in_offerta")
    .select("id, marca, descrizione, colore, taglia, prezzo_listino, prezzo_soci, immagine_path", { count: "exact" })
    .order("punteggio", { ascending: false })
    .order("ean")
    .range((pagina - 1) * PRODOTTI_PER_PAGINA, pagina * PRODOTTI_PER_PAGINA - 1);
  for (const parola of cerca.replace(/[,()*%\\]/g, " ").split(/\s+/).filter(Boolean)) {
    query = query.or(["marca", "descrizione", "categoria"].map((c) => `${c}.ilike.%${parola}%`).join(","));
  }
  const { data, count, error } = await query;
  if (error) throw error;
  return { prodotti: (data as ProdottoDb[]).map((p) => daProdotto(supabase, p)), totale: count ?? 0 };
}
