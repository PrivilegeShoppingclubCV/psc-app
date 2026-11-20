"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { conEsito, messaggioDb, spunta, testo, testoONull } from "@/lib/admin/form";
import { richiediAdmin } from "@/lib/admin/sessione";
import { urlFotoVerticale } from "@/lib/foto-sito";

export async function salvaProdotto(form: FormData) {
  const { supabase } = await richiediAdmin();
  const id = testo(form, "id");
  const { error } = await supabase
    .from("prodotti")
    .update({ immagine_path: testoONull(form, "immagine_path"), nascosto: spunta(form, "nascosto") })
    .eq("id", id);
  revalidatePath("/offerte", "layout");
  redirect(conEsito(`/admin/prodotti/${id}`, error ? { errore: messaggioDb(error) } : { ok: "Prodotto salvato." }));
}

export async function rigeneraVetrina() {
  const { supabase } = await richiediAdmin();
  const { error } = await supabase.rpc("vetrina_rigenera");
  revalidatePath("/offerte", "layout");
  redirect(conEsito("/admin/prodotti", error ? { errore: messaggioDb(error) } : { ok: "Vetrina di oggi rifatta con i prodotti e le foto attuali." }));
}

/** C'è la foto sul sito? (HEAD: non scarica l'immagine) */
async function esisteSulSito(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: "HEAD", cache: "no-store", signal: AbortSignal.timeout(8000) });
    return r.ok && (r.headers.get("content-type") ?? "image/").startsWith("image/");
  } catch {
    return false;
  }
}

/**
 * Per i prodotti senza foto controlla se sul sito c'è verticali/<EAN>.jpg
 * (caricata dallo strumento foto) e, se c'è, la collega al prodotto.
 * Poi rifà la vetrina di oggi, così i prodotti nuovi possono entrarci subito.
 */
export async function cercaFotoSito() {
  const { supabase } = await richiediAdmin();
  const senza: { id: string; ean: string }[] = [];
  for (let da = 0; ; da += 1000) {
    const { data, error } = await supabase
      .from("prodotti")
      .select("id, ean")
      .is("immagine_path", null)
      .order("ean")
      .range(da, da + 999);
    if (error) redirect(conEsito("/admin/prodotti", { errore: messaggioDb(error) }));
    senza.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }

  const trovate: { id: string; url: string }[] = [];
  const PARALLELE = 20;
  for (let i = 0; i < senza.length; i += PARALLELE) {
    const gruppo = senza.slice(i, i + PARALLELE);
    const esiti = await Promise.all(gruppo.map((p) => esisteSulSito(urlFotoVerticale(p.ean))));
    gruppo.forEach((p, j) => esiti[j] && trovate.push({ id: p.id, url: urlFotoVerticale(p.ean) }));
  }

  for (const t of trovate) {
    const { error } = await supabase.from("prodotti").update({ immagine_path: t.url }).eq("id", t.id);
    if (error) redirect(conEsito("/admin/prodotti", { errore: messaggioDb(error) }));
  }
  if (trovate.length) await supabase.rpc("vetrina_rigenera");
  revalidatePath("/offerte", "layout");
  revalidatePath("/admin/prodotti");
  redirect(
    conEsito("/admin/prodotti", {
      ok: trovate.length
        ? `Collegate ${trovate.length} foto dal sito su ${senza.length} prodotti senza foto. Vetrina di oggi rifatta.`
        : `Nessuna foto nuova sul sito per i ${senza.length} prodotti senza foto.`,
    }),
  );
}
