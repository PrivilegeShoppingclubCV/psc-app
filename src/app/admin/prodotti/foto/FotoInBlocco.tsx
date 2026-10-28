"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const TIPI = ["image/jpeg", "image/png", "image/webp", "image/avif"];
const MAX = 5 * 1024 * 1024;

type Esito = { file: string; ean: string; esito: "ok" | "errore"; messaggio: string };

/** Il nome del file è il codice EAN (8003007827320.jpg, anche 8003007827320_1.jpg): la foto va al prodotto con quell'EAN. */
export function FotoInBlocco() {
  const [esiti, setEsiti] = useState<Esito[]>([]);
  const [inCorso, setInCorso] = useState(false);
  const [sostituisci, setSostituisci] = useState(false);

  async function carica(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    const supabase = createClient();
    if (!files.length || !supabase) return;
    setInCorso(true);
    setEsiti([]);

    const conEan = files.map((f) => ({ f, ean: f.name.match(/^\s*(\d{6,14})/)?.[1] ?? "" }));
    const eans = [...new Set(conEan.map((x) => x.ean).filter(Boolean))];
    const prodotti = new Map<string, { id: string; immagine_path: string | null }>();
    for (let i = 0; i < eans.length; i += 200) {
      const { data } = await supabase.from("prodotti").select("id, ean, immagine_path").in("ean", eans.slice(i, i + 200));
      (data ?? []).forEach((p) => prodotti.set(p.ean, p));
    }

    const usati = new Set<string>();
    for (const { f, ean } of conEan) {
      const aggiungi = (esito: Esito["esito"], messaggio: string) => setEsiti((x) => [...x, { file: f.name, ean, esito, messaggio }]);
      const p = prodotti.get(ean);
      if (!ean) { aggiungi("errore", "Il nome del file non inizia con un codice EAN"); continue; }
      if (!p) { aggiungi("errore", "Nessun prodotto con questo EAN: importa prima il magazzino"); continue; }
      if (usati.has(ean)) { aggiungi("errore", "Già caricata un'altra foto per questo EAN in questo invio"); continue; }
      if (p.immagine_path && !sostituisci) { aggiungi("errore", "Ha già una foto (spunta «Sostituisci» per cambiarla)"); continue; }
      if (!TIPI.includes(f.type)) { aggiungi("errore", "Formato non supportato: usa JPEG, PNG, WebP o AVIF"); continue; }
      if (f.size > MAX) { aggiungi("errore", "Supera 5 MB"); continue; }

      const estensione = f.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const percorso = `${ean}/${crypto.randomUUID()}.${estensione}`;
      const { error } = await supabase.storage.from("prodotti").upload(percorso, f, { contentType: f.type, cacheControl: "31536000" });
      if (error) { aggiungi("errore", error.message); continue; }
      const { error: e2 } = await supabase.from("prodotti").update({ immagine_path: percorso }).eq("id", p.id);
      if (e2) { aggiungi("errore", e2.message); continue; }
      usati.add(ean);
      aggiungi("ok", "Caricata");
    }
    setInCorso(false);
  }

  const ok = esiti.filter((x) => x.esito === "ok").length;
  return (
    <section className="admin-card">
      <h2 className="t-title">Carica più foto insieme</h2>
      <p className="t-caption">
        Chiama ogni file con il codice EAN del prodotto, ad esempio <code>8003007827320.jpg</code>. JPEG, PNG, WebP o AVIF, massimo 5 MB ciascuna.
        Le foto restano legate all&apos;EAN anche quando reimporti il magazzino.
      </p>
      <label className="spunta admin-spunta">
        <input type="checkbox" checked={sostituisci} onChange={(e) => setSostituisci(e.target.checked)} />
        <span>Sostituisci le foto già presenti</span>
      </label>
      <div className="admin-azioni">
        <label className="psc-btn psc-btn--primary">
          {inCorso ? `Carico… ${esiti.length}` : "Scegli le foto"}
          <input type="file" accept={TIPI.join(",")} multiple onChange={carica} disabled={inCorso} hidden />
        </label>
      </div>
      {esiti.length > 0 && (
        <>
          <p className="t-caption">{ok} caricate, {esiti.length - ok} non caricate.</p>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>File</th><th>EAN</th><th>Esito</th></tr></thead>
              <tbody>
                {esiti.map((x, i) => (
                  <tr key={i}>
                    <td>{x.file}</td>
                    <td className="min">{x.ean || "—"}</td>
                    <td>{x.esito === "ok" ? <span className="psc-badge psc-badge--success">{x.messaggio}</span> : <span className="admin-errore-campo">{x.messaggio}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
