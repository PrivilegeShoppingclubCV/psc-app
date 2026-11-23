"use client";

import { useState, useTransition } from "react";
import { creaLinkGenitore } from "@/app/genitore/azioni";
import { forma, useTesti } from "@/lib/i18n/client";

/**
 * Tasto "Invia il link a un genitore": crea il link e apre la condivisione del
 * telefono (WhatsApp, SMS, email...). Dove la condivisione non c'è, copia il
 * link e lo mostra.
 */
export function LinkGenitore({ nome }: { nome: string }) {
  const [inCorso, avvia] = useTransition();
  const [link, setLink] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const t = useTesti().genitoreLink;

  const invia = () =>
    avvia(async () => {
      setErrore(null);
      const r = await creaLinkGenitore();
      if ("errore" in r) {
        setErrore(r.errore);
        return;
      }
      const testo = forma(t.messaggio, { nome: nome || t.io });
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
        {inCorso ? t.attimo : t.invia}
      </button>
      {errore && <p className="notice notice--errore" role="alert">{errore}</p>}
      {link && (
        <p className="notice" role="status">
          {t.copiato} <span className="link-genitore__url" dir="ltr">{link}</span>
        </p>
      )}
    </div>
  );
}
