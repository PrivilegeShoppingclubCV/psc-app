"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { FOTO_SITO_BASE, urlFotoVerticale } from "@/lib/foto-sito";

/**
 * Collega ai prodotti senza foto la verticale caricata sul sito dallo strumento foto
 * (verticali/<EAN>.jpg). Il controllo lo fa il browser, caricando l'immagine come
 * farebbe l'app: dal server dell'app il sito Aruba può rispondere diversamente
 * (protezioni anti-bot), mentre così si vede esattamente quello che vedono i soci.
 * Nel prodotto si salva solo il link: la foto resta sul sito.
 */
function esisteFoto(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => {
      img.src = "";
      resolve(false);
    }, 15000);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img.naturalWidth > 0);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(false);
    };
    img.src = `${url}?controllo=${Date.now()}`;
  });
}

export function PrendiFotoSito() {
  const router = useRouter();
  const [stato, setStato] = useState("");
  const [errore, setErrore] = useState("");
  const [inCorso, setInCorso] = useState(false);

  async function avvia() {
    const supabase = createClient();
    if (!supabase) return setErrore("Database non collegato.");
    setInCorso(true);
    setErrore("");
    setStato("Cerco i prodotti senza foto…");
    try {
      const senza: { id: string; ean: string }[] = [];
      for (let da = 0; ; da += 1000) {
        const { data, error } = await supabase.from("prodotti").select("id, ean").is("immagine_path", null).order("ean").range(da, da + 999);
        if (error) throw error;
        senza.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }

      const trovate: { id: string; ean: string }[] = [];
      let fatti = 0;
      const PARALLELE = 12;
      for (let i = 0; i < senza.length; i += PARALLELE) {
        const gruppo = senza.slice(i, i + PARALLELE);
        const esiti = await Promise.all(gruppo.map((p) => esisteFoto(urlFotoVerticale(p.ean.trim()))));
        gruppo.forEach((p, j) => esiti[j] && trovate.push(p));
        fatti += gruppo.length;
        setStato(`Controllo ${fatti} di ${senza.length} prodotti senza foto · trovate ${trovate.length}`);
      }

      for (const t of trovate) {
        const { error } = await supabase.from("prodotti").update({ immagine_path: urlFotoVerticale(t.ean.trim()) }).eq("id", t.id);
        if (error) throw error;
      }
      if (trovate.length) await supabase.rpc("vetrina_rigenera");
      setStato(
        trovate.length
          ? `Collegate ${trovate.length} foto dal sito (${trovate.slice(0, 8).map((t) => t.ean).join(", ")}${trovate.length > 8 ? "…" : ""}). Vetrina di oggi rifatta.`
          : `Nessuna foto nuova in ${FOTO_SITO_BASE}/verticali/ per i ${senza.length} prodotti senza foto.`,
      );
      router.refresh();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : String(e));
    } finally {
      setInCorso(false);
    }
  }

  return (
    <div className="admin-foto-sito">
      <button type="button" className="psc-btn psc-btn--secondary" onClick={avvia} disabled={inCorso} title={`Cerca le foto in ${FOTO_SITO_BASE}/verticali/`}>
        {inCorso ? "Cerco…" : "Prendi foto dal sito"}
      </button>
      {stato && <p className="t-caption" role="status">{stato}</p>}
      {errore && <p className="admin-errore-campo" role="alert">{errore}</p>}
    </div>
  );
}
