"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { leggiRighe } from "@/lib/prodotti/righe";

const BLOCCO = 500;
const FORMATI = {
  titoli: "colonne riconosciute dalla riga dei titoli",
  excel: "senza titoli, colonne del tuo foglio (con Valore fermo)",
  readypro: "senza titoli, colonne di ReadyPro (senza Valore fermo)",
};
const euro = (n: number | null) => (n === null ? "—" : n.toLocaleString("it-IT", { style: "currency", currency: "EUR" }));

/** Le righe si leggono nel browser e vanno al database a blocchi: un magazzino intero supera il limite di una richiesta. */
export function Importa() {
  const [testo, setTesto] = useState("");
  const [completo, setCompleto] = useState(true);
  const [stato, setStato] = useState<{ fase: "pronto" | "invio" | "fatto" | "errore"; messaggio?: string; inviati?: number }>({ fase: "pronto" });
  const lettura = useMemo(() => (testo.trim() ? leggiRighe(testo) : null), [testo]);

  async function importa() {
    if (!lettura?.righe.length) return;
    const supabase = createClient();
    if (!supabase) return setStato({ fase: "errore", messaggio: "Database non collegato." });
    const idImport = crypto.randomUUID();
    let inviati = 0;
    setStato({ fase: "invio", inviati });
    for (let i = 0; i < lettura.righe.length; i += BLOCCO) {
      const { data, error } = await supabase.rpc("importa_prodotti", { p_import: idImport, p_righe: lettura.righe.slice(i, i + BLOCCO) });
      if (error) {
        return setStato({ fase: "errore", messaggio: `Import fermato dopo ${inviati} prodotti: ${error.message}. Il magazzino non è stato azzerato: puoi riprovare.` });
      }
      inviati += Number(data ?? 0);
      setStato({ fase: "invio", inviati });
    }
    let azzerati = 0;
    if (completo) {
      const { data, error } = await supabase.rpc("chiudi_import_prodotti", { p_import: idImport });
      if (error) return setStato({ fase: "errore", messaggio: `Prodotti salvati, ma non ho azzerato quelli mancanti: ${error.message}` });
      azzerati = Number(data ?? 0);
    }
    setStato({
      fase: "fatto",
      messaggio: `${inviati} prodotti salvati.${completo ? ` ${azzerati} prodotti che non erano nell'elenco ora risultano esauriti.` : ""}`,
    });
    setTesto("");
  }

  return (
    <div className="admin-form">
      <section className="admin-card">
        <h2 className="t-title">Incolla le righe</h2>
        <p className="t-caption">
          In Excel seleziona le righe dei prodotti, meglio con la riga dei titoli, copia e incolla qui. Le colonne che non servono
          (giorni dall&apos;ultimo invio, percentuale ricalcolata, …) vengono ignorate; il valore fermo lo ricalcola l&apos;app.
          I prodotti si riconoscono dal codice EAN: reincollare aggiorna pezzi e prezzi senza toccare le foto.
        </p>
        <textarea
          className="psc-field__input admin-textarea admin-incolla"
          aria-label="Righe copiate da Excel"
          value={testo}
          onChange={(e) => { setTesto(e.target.value); if (stato.fase !== "invio") setStato({ fase: "pronto" }); }}
          placeholder={"Codice Ean\tMarca\tCodice Sku\tDescrizione\t…"}
          rows={10}
          spellCheck={false}
          disabled={stato.fase === "invio"}
        />
        {stato.fase === "fatto" && (
          <p className="notice notice--ok" role="status">{stato.messaggio} <Link href="/admin/prodotti">Vai ai prodotti</Link></p>
        )}
        {stato.fase === "errore" && <p className="notice notice--errore" role="alert">{stato.messaggio}</p>}
      </section>

      {lettura && (
        <section className="admin-card">
          <h2 className="t-title">{lettura.righe.length === 1 ? "1 prodotto pronto" : `${lettura.righe.length} prodotti pronti`}</h2>
          <p className="t-caption">
            Letti con {FORMATI[lettura.formato]}.
            {lettura.duplicati > 0 && ` ${lettura.duplicati} righe con un EAN già presente: vale l'ultima.`}
            {lettura.errori.length > 0 && ` ${lettura.errori.length} righe scartate.`}
          </p>
          {lettura.errori.length > 0 && (
            <ul className="notice notice--errore admin-errori">
              {lettura.errori.slice(0, 15).map((e) => <li key={e.riga}>Riga {e.riga}: {e.motivo}</li>)}
              {lettura.errori.length > 15 && <li>… e altre {lettura.errori.length - 15}</li>}
            </ul>
          )}
          {lettura.righe.length > 0 && (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr><th>EAN</th><th>Prodotto</th><th className="num">Pezzi</th><th className="num">Listino</th><th className="num">Tesserati</th><th className="num">Valore fermo</th><th>Scadenza</th></tr>
                </thead>
                <tbody>
                  {lettura.righe.slice(0, 8).map((r) => (
                    <tr key={r.ean}>
                      <td className="min">{r.ean}</td>
                      <td>{r.descrizione}<div className="t-caption">{[r.marca, r.colore, r.taglia].filter(Boolean).join(" · ")}</div></td>
                      <td className="num">{r.disponibilita}</td>
                      <td className="num">{euro(r.prezzo_listino)}</td>
                      <td className="num">{euro(r.prezzo_soci)}</td>
                      <td className="num">{euro(Math.max(r.disponibilita, 0) * (r.prezzo_soci ?? 0))}</td>
                      <td className="min">{r.scadenza ? r.scadenza.split("-").reverse().join("/") : r.note_scadenza ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {lettura.righe.length > 8 && <p className="t-caption">Sono le prime 8 righe su {lettura.righe.length}.</p>}

          <label className="spunta admin-spunta">
            <input type="checkbox" checked={completo} onChange={(e) => setCompleto(e.target.checked)} disabled={stato.fase === "invio"} />
            <span>
              È tutto il magazzino
              <span className="t-caption admin-spunta__help">I prodotti già salvati che non sono in queste righe risultano esauriti ed escono dalle offerte. Togli la spunta se stai incollando solo una parte.</span>
            </span>
          </label>
          <div className="admin-azioni">
            <button type="button" className="psc-btn psc-btn--primary" onClick={importa} disabled={!lettura.righe.length || stato.fase === "invio"}>
              {stato.fase === "invio" ? `Invio… ${stato.inviati} / ${lettura.righe.length}` : lettura.righe.length === 1 ? "Importa 1 prodotto" : `Importa ${lettura.righe.length} prodotti`}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
