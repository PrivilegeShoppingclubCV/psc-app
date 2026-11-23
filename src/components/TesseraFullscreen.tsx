"use client";

import { useCallback, useEffect, useRef } from "react";
import type { Socio } from "@/lib/tipi";
import { formatTessera } from "@/lib/format";
import { Barcode } from "./Barcode";
import { IconChiudi, IconTessera } from "./Icons";
import { Tessera } from "./Tessera";
import { forma, useTesti } from "@/lib/i18n/client";

type WakeLock = { release: () => Promise<void> };

/**
 * Bottone "Apri tessera" + pannello a schermo intero con il codice a barre.
 * Non fa richieste di rete: con il service worker funziona anche offline.
 */
export function ApriTessera({ socio }: { socio: Socio }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const wakeLock = useRef<WakeLock | null>(null);
  const t = useTesti().carta;

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

  const numero = socio.numeroTessera ? formatTessera(socio.numeroTessera) : "";

  return (
    <>
      <button type="button" className="psc-btn psc-btn--primary psc-btn--block" onClick={apri}>
        <IconTessera />
        {t.apri}
      </button>

      <dialog ref={dialog} className="tessera-overlay" aria-label={t.latua} onClose={rilascia}>
        <div className="tessera-overlay__bar">
          <p className="t-eyebrow">{t.latua}</p>
          <button type="button" className="icon-btn" aria-label={t.chiudi} onClick={() => dialog.current?.close()}>
            <IconChiudi />
          </button>
        </div>
        <Tessera socio={socio} />
        <div className="psc-tessera-back">
          {!socio.numeroTessera ? (
            <p className="psc-hint">{t.nessuna}</p>
          ) : socio.inAttivazione ? (
            <>
              <div className="psc-barcode-box">
                <Barcode value={socio.numeroTessera} label={forma(t.barcode, { numero })} />
              </div>
              <span className="psc-code" dir="ltr">{numero}</span>
              <span className="psc-badge psc-badge--warning">{t.appenaCreata}</span>
              <p className="psc-hint">
                {socio.daUnire
                  ? t.usaQuellaNegozio
                  : t.registrando}
              </p>
            </>
          ) : (
            <>
              <div className="psc-barcode-box">
                <Barcode value={socio.numeroTessera} label={forma(t.barcode, { numero })} />
              </div>
              <span className="psc-code" dir="ltr">{numero}</span>
              <p className="psc-hint">{t.mostra}</p>
            </>
          )}
        </div>
      </dialog>
    </>
  );
}
