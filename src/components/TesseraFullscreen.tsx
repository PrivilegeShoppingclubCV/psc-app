"use client";

import { useCallback, useEffect, useRef } from "react";
import type { Socio } from "@/lib/tipi";
import { formatTessera } from "@/lib/format";
import { Barcode } from "./Barcode";
import { IconChiudi, IconTessera } from "./Icons";
import { Tessera } from "./Tessera";

type WakeLock = { release: () => Promise<void> };

/**
 * Bottone "Apri tessera" + pannello a schermo intero con il codice a barre.
 * Non fa richieste di rete: con il service worker funziona anche offline.
 */
export function ApriTessera({ socio }: { socio: Socio }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const wakeLock = useRef<WakeLock | null>(null);

  const rilascia = useCallback(() => {
    wakeLock.current?.release().catch(() => {});
    wakeLock.current = null;
  }, []);

  const apri = async () => {
    dialog.current?.showModal();
    // Tiene lo schermo acceso mentre la cassa legge il codice, dove il browser lo permette.
    try {
      const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<WakeLock> } };
      wakeLock.current = (await nav.wakeLock?.request("screen")) ?? null;
    } catch {
      wakeLock.current = null;
    }
  };

  useEffect(() => rilascia, [rilascia]);

  const numero = formatTessera(socio.numeroTessera);

  return (
    <>
      <button type="button" className="psc-btn psc-btn--primary psc-btn--block" onClick={apri}>
        <IconTessera />
        Apri tessera
      </button>

      <dialog ref={dialog} className="tessera-overlay" aria-label="La tua tessera" onClose={rilascia}>
        <div className="tessera-overlay__bar">
          <p className="t-eyebrow">La tua tessera</p>
          <button type="button" className="icon-btn" aria-label="Chiudi" onClick={() => dialog.current?.close()}>
            <IconChiudi />
          </button>
        </div>
        <Tessera socio={socio} />
        <div className="psc-tessera-back">
          {socio.inAttivazione ? (
            <>
              <span className="psc-badge psc-badge--warning">In attivazione</span>
              <span className="psc-code">{numero}</span>
              <p className="psc-hint">
                Stiamo registrando la tessera nelle casse dei negozi: di solito basta meno di un&apos;ora.
                Il codice a barre comparirà qui appena è attiva.
              </p>
            </>
          ) : (
            <>
              <div className="psc-barcode-box">
                <Barcode value={socio.numeroTessera} label={`Codice a barre della tessera ${numero}`} />
              </div>
              <span className="psc-code">{numero}</span>
              <p className="psc-hint">Mostra questo codice in cassa per accumulare punti e avere i prezzi soci.</p>
            </>
          )}
        </div>
      </dialog>
    </>
  );
}
