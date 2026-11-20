"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { urlImmagine } from "@/lib/foto-sito";

const TIPI = ["image/jpeg", "image/png", "image/webp", "image/avif"];
const MAX = 5 * 1024 * 1024;

/**
 * Carica l'immagine direttamente dal browser su Supabase Storage (bucket pubblico,
 * solo gli admin scrivono) e mette il percorso nel campo nascosto `name`.
 * Il file non passa dal server dell'app, che ha un limite di dimensione sulle richieste.
 */
export function ImmagineInput({ bucket, name = "immagine_path", valore, urlBase, cartella }: {
  bucket: "offerte" | "negozi" | "premi" | "prodotti";
  name?: string;
  valore: string | null;
  /** URL pubblico del bucket, a cui si aggiunge il percorso. */
  urlBase: string;
  /** Cartella dentro il bucket (per i prodotti, l'EAN). Di base l'anno. */
  cartella?: string;
}) {
  const [percorso, setPercorso] = useState(valore ?? "");
  const [stato, setStato] = useState<"" | "carico" | string>("");

  async function scegli(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!TIPI.includes(file.type)) return setStato("Formato non supportato: usa JPEG, PNG, WebP o AVIF.");
    if (file.size > MAX) return setStato("L'immagine supera 5 MB: riducila prima di caricarla.");

    const supabase = createClient();
    if (!supabase) return setStato("Database non collegato.");
    setStato("carico");
    const estensione = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const nuovo = `${cartella ?? new Date().getFullYear()}/${crypto.randomUUID()}.${estensione}`;
    const { error } = await supabase.storage.from(bucket).upload(nuovo, file, { contentType: file.type, cacheControl: "31536000" });
    if (error) return setStato(`Caricamento non riuscito: ${error.message}`);
    setPercorso(nuovo);
    setStato("");
  }

  return (
    <div className="admin-immagine">
      <input type="hidden" name={name} value={percorso} />
      <div className="admin-immagine__anteprima">
        {percorso ? <img src={urlImmagine(urlBase, percorso)} alt="" /> : <span className="t-caption">Nessuna immagine</span>}
      </div>
      <div className="admin-immagine__azioni">
        <label className="psc-btn psc-btn--secondary">
          {stato === "carico" ? "Carico…" : percorso ? "Cambia immagine" : "Carica immagine"}
          <input type="file" accept={TIPI.join(",")} onChange={scegli} disabled={stato === "carico"} hidden />
        </label>
        {percorso && <button type="button" className="psc-btn psc-btn--ghost" onClick={() => setPercorso("")}>Togli</button>}
      </div>
      {stato && stato !== "carico" && <p className="admin-errore-campo" role="alert">{stato}</p>}
      <p className="t-caption">JPEG, PNG, WebP o AVIF, massimo 5 MB. Salva il modulo per applicare la modifica.</p>
    </div>
  );
}
