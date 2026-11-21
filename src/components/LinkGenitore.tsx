"use client";

import { useState, useTransition } from "react";
import { creaLinkGenitore } from "@/app/genitore/azioni";

/**
 * Tasto "Invia il link a un genitore": crea il link e apre la condivisione del
 * telefono (WhatsApp, SMS, email...). Dove la condivisione non c'è, copia il
 * link e lo mostra.
 */
export function LinkGenitore({ nome }: { nome: string }) {
  const [inCorso, avvia] = useTransition();
  const [link, setLink] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  const invia = () =>
    avvia(async () => {
      setErrore(null);
      const r = await creaLinkGenitore();
      if ("errore" in r) {
        setErrore(r.errore);
        return;
      }
      const testo = `Ciao, sono ${nome || "io"}: per usare la tessera del Privilege Shopping Club mi serve il tuo ok. Apri questo link:`;
      try {
        if (navigator.share) {
          await navigator.share({ title: "Privilege Shopping Club", text: testo, url: r.url });
          return;
        }
      } catch (e) {
        // Condivisione annullata: si mostra comunque il link qui sotto.
        if ((e as Error).name === "AbortError") return;
      }
      setLink(r.url);
      navigator.clipboard?.writeText(r.url).catch(() => {});
    });

  return (
    <div className="link-genitore">
      <button type="button" className="psc-btn psc-btn--primary psc-btn--block" onClick={invia} disabled={inCorso}>
        {inCorso ? "Un attimo…" : "Invia il link a un genitore"}
      </button>
      {errore && <p className="notice notice--errore" role="alert">{errore}</p>}
      {link && (
        <p className="notice" role="status">
          Link copiato. Mandalo a un genitore: <span className="link-genitore__url">{link}</span>
        </p>
      )}
    </div>
  );
}
