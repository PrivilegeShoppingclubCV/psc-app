"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { conEsito, messaggioDb, spunta, testo } from "@/lib/admin/form";
import { richiediAdmin } from "@/lib/admin/sessione";

const PAGINA = "/admin/tessere";
const MASSIMO = 5000;

/**
 * Codici da caricare: un elenco (uno per riga, o separati da virgole e punti e
 * virgola) oppure un intervallo "da"–"a", che tiene gli zeri iniziali di "da"
 * (000100 → 000101 …).
 */
function codiciDa(form: FormData): string[] | string {
  const elenco = testo(form, "elenco").split(/[\n,;]+/).map((c) => c.replace(/\s/g, "")).filter(Boolean);
  const da = testo(form, "da").replace(/\s/g, "");
  const a = testo(form, "a").replace(/\s/g, "");
  if (!da && !a) return elenco;
  if (!/^\d+$/.test(da) || !/^\d+$/.test(a)) return "L'intervallo funziona solo con codici di sole cifre.";
  const inizio = BigInt(da);
  const fine = BigInt(a);
  if (fine < inizio) return "Il codice finale deve venire dopo quello iniziale.";
  if (fine - inizio >= BigInt(MASSIMO)) return `Al massimo ${MASSIMO} codici per volta.`;
  const intervallo: string[] = [];
  for (let n = inizio; n <= fine; n++) intervallo.push(n.toString().padStart(da.length, "0"));
  return [...elenco, ...intervallo];
}

export async function caricaTessere(form: FormData) {
  const { supabase } = await richiediAdmin();
  const codici = codiciDa(form);
  if (typeof codici === "string") redirect(conEsito(PAGINA, { errore: codici }));
  if (!codici.length) redirect(conEsito(PAGINA, { errore: "Scrivi i codici o un intervallo." }));
  if (codici.length > MASSIMO) redirect(conEsito(PAGINA, { errore: `Al massimo ${MASSIMO} codici per volta.` }));

  const { data, error } = await supabase.rpc("staff_carica_tessere_fisiche", { p_codici: codici });
  if (error) redirect(conEsito(PAGINA, { errore: messaggioDb(error) }));
  const esito = data as { caricate: number; gia_presenti: number; rifiutati: string[] };
  revalidatePath(PAGINA);
  const parti = [`${esito.caricate} tessere caricate`];
  if (esito.gia_presenti) parti.push(`${esito.gia_presenti} c'erano già`);
  if (esito.rifiutati.length) parti.push(`rifiutate perché non hanno il formato giusto: ${esito.rifiutati.slice(0, 20).join(", ")}${esito.rifiutati.length > 20 ? "…" : ""}`);
  redirect(conEsito(PAGINA, { ok: `${parti.join(", ")}.` }));
}

export async function togliDalMagazzino(form: FormData) {
  const { supabase } = await richiediAdmin();
  const codice = testo(form, "codice");
  const { error } = await supabase.rpc("staff_togli_dal_magazzino", { p_codice: codice });
  revalidatePath(PAGINA);
  redirect(conEsito(PAGINA, error ? { errore: messaggioDb(error) } : { ok: `Tessera ${codice} tolta dal magazzino.` }));
}

export async function salvaRegole(form: FormData) {
  const { supabase } = await richiediAdmin();
  const formato = testo(form, "formato");
  try {
    if (formato) new RegExp(formato);
  } catch {
    redirect(conEsito(PAGINA, { errore: "Il formato non è un'espressione regolare valida." }));
  }
  const { error } = await supabase.from("impostazioni").upsert([
    { chiave: "tessera_fisica_formato", valore: formato },
    { chiave: "tessere_fisiche_solo_magazzino", valore: spunta(form, "solo_magazzino") },
  ]);
  revalidatePath(PAGINA);
  redirect(conEsito(PAGINA, error ? { errore: messaggioDb(error) } : { ok: "Regole salvate." }));
}
