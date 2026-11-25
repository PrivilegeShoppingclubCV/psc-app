"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatEuro } from "@/lib/format";
import { urlImmagine } from "@/lib/foto-sito";

export type RigaProdotto = {
  id: string;
  ean: string;
  sku: string | null;
  marca: string | null;
  descrizione: string;
  colore: string | null;
  taglia: string | null;
  disponibilita: number;
  prezzo_listino: number | null;
  prezzo_soci: number | null;
  valore_fermo: number;
  immagine_path: string | null;
};

/** La selezione resta mentre si cambia pagina o si cerca, finché non si svuota. */
const CHIAVE = "psc-admin-newsletter";

function leggiSelezione(): RigaProdotto[] {
  try {
    const v = JSON.parse(localStorage.getItem(CHIAVE) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function salvaSelezione(righe: RigaProdotto[]) {
  try {
    localStorage.setItem(CHIAVE, JSON.stringify(righe));
  } catch {
    /* la selezione vale solo per questa pagina */
  }
}

/**
 * La newsletter prende la foto quadrata dal sito con l'EAN: c'è solo per i prodotti
 * la cui foto viene dal sito (link a .../verticali/<EAN>.jpg), non per quelle
 * caricate a mano nel bucket dell'app.
 */
function fotoSulSito(p: RigaProdotto): boolean {
  return !!p.immagine_path && /^https?:\/\/.+\/verticali\//i.test(p.immagine_path);
}

const numero = (v: number | null) =>
  v === null || v === undefined ? "" : v.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Una riga per prodotto, 8 colonne separate da tab, come le righe copiate dal gestionale
 * che il box "Incolla prodotti" del generatore newsletter si aspetta:
 * EAN · codice · descrizione · pezzi · valore fermo · listino · tesserati · sconto.
 */
export function rigaNewsletter(p: RigaProdotto): string {
  const sconto =
    p.prezzo_listino && p.prezzo_soci !== null && p.prezzo_listino > p.prezzo_soci
      ? `${numero((1 - p.prezzo_soci / p.prezzo_listino) * 100)}%`
      : "0%";
  const pulito = (s: string | null) => String(s ?? "").replace(/[\t\r\n]+/g, " ").trim();
  return [
    p.ean,
    pulito(p.sku) || "-",
    pulito(p.descrizione),
    String(p.disponibilita),
    `€ ${numero(p.valore_fermo)}`,
    `€ ${numero(p.prezzo_listino ?? p.prezzo_soci)}`,
    `€ ${numero(p.prezzo_soci)}`,
    sconto,
  ].join("\t");
}

async function copia(testo: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(testo);
    return true;
  } catch {
    return false;
  }
}

export function TabellaProdotti({ prodotti, fotoBucket }: { prodotti: RigaProdotto[]; fotoBucket: string }) {
  const [scelti, setScelti] = useState<RigaProdotto[]>([]);
  const [testo, setTesto] = useState("");
  const [esito, setEsito] = useState("");

  useEffect(() => setScelti(leggiSelezione()), []);

  const aggiorna = (righe: RigaProdotto[]) => {
    setScelti(righe);
    salvaSelezione(righe);
    setTesto("");
    setEsito("");
  };
  const scelto = (id: string) => scelti.some((s) => s.id === id);
  const cambia = (p: RigaProdotto) =>
    aggiorna(scelto(p.id) ? scelti.filter((s) => s.id !== p.id) : [...scelti, p]);

  const selezionabili = prodotti.filter(fotoSulSito);
  const tuttiPagina = selezionabili.length > 0 && selezionabili.every((p) => scelto(p.id));
  const cambiaPagina = () =>
    aggiorna(
      tuttiPagina
        ? scelti.filter((s) => !selezionabili.some((p) => p.id === s.id))
        : [...scelti, ...selezionabili.filter((p) => !scelto(p.id))],
    );

  async function esporta() {
    const t = scelti.map(rigaNewsletter).join("\n");
    setTesto(t);
    const ok = await copia(t);
    setEsito(
      ok
        ? `${scelti.length} prodotti copiati: incollali in "Incolla prodotti" del generatore newsletter.`
        : "Il browser non ha permesso di copiare: seleziona il testo qui sotto e copialo a mano.",
    );
  }

  return (
    <>
      <div className="admin-newsletter" role="region" aria-label="Esporta per newsletter">
        <span className="t-caption">
          {scelti.length
            ? `${scelti.length} prodott${scelti.length === 1 ? "o scelto" : "i scelti"} per la newsletter`
            : "Spunta i prodotti con foto sul sito per esportarli nella newsletter"}
        </span>
        <button type="button" className="psc-btn psc-btn--primary admin-btn--small" disabled={!scelti.length} onClick={esporta}>
          Esporta per newsletter
        </button>
        {scelti.length > 0 && (
          <button type="button" className="psc-btn psc-btn--secondary admin-btn--small" onClick={() => aggiorna([])}>
            Svuota
          </button>
        )}
      </div>
      {esito && <p className="t-caption" role="status">{esito}</p>}
      {testo && (
        <textarea
          className="psc-field__input admin-newsletter__testo"
          readOnly
          rows={Math.min(10, scelti.length + 1)}
          value={testo}
          onFocus={(e) => e.currentTarget.select()}
        />
      )}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  aria-label="Scegli tutti i prodotti con foto di questa pagina"
                  checked={tuttiPagina}
                  disabled={!selezionabili.length}
                  onChange={cambiaPagina}
                />
              </th>
              <th></th><th>Prodotto</th><th>EAN</th><th className="num">Pezzi</th><th className="num">Tesserati</th><th className="num">Valore fermo</th>
            </tr>
          </thead>
          <tbody>
            {prodotti.map((p) => (
              <tr key={p.id}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Scegli ${p.descrizione} per la newsletter`}
                    title={fotoSulSito(p) ? undefined : "Serve la foto sul sito: la newsletter la prende da lì con l'EAN"}
                    checked={scelto(p.id)}
                    disabled={!fotoSulSito(p) && !scelto(p.id)}
                    onChange={() => cambia(p)}
                  />
                </td>
                <td>{p.immagine_path ? <img className="thumb" src={urlImmagine(fotoBucket, p.immagine_path)} alt="" /> : <span className="thumb" style={{ display: "block" }} />}</td>
                <td>
                  <Link href={`/admin/prodotti/${p.id}`}>{p.descrizione}</Link>
                  <div className="t-caption">{[p.marca, p.colore, p.taglia].filter(Boolean).join(" · ")}</div>
                </td>
                <td className="min">{p.ean}</td>
                <td className="num">{p.disponibilita}</td>
                <td className="num">{p.prezzo_soci !== null ? formatEuro(p.prezzo_soci) : "—"}</td>
                <td className="num">{formatEuro(p.valore_fermo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
