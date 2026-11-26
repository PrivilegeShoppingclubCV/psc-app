"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconChiudi } from "./Icons";
import { forma, useTesti } from "@/lib/i18n/client";

type Punto = { x: number; y: number };
const MAX_ZOOM = 4;

/**
 * Foto di un'offerta: toccandola si apre a schermo intero.
 * Si chiude con la X, toccando fuori dalla foto, con Esc o con il tasto indietro del telefono.
 * Nella vista grande si può ingrandire con due dita o con un doppio tocco.
 * Le foto possono arrivare anche da link esterni (sito del negozio): si usano così come sono.
 */
export function FotoOfferta({ src, nome, contenuta = false }: { src: string; nome: string; contenuta?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const foto = useRef<HTMLImageElement>(null);
  const inCronologia = useRef(false);
  const [aperta, setAperta] = useState(false);
  const [errore, setErrore] = useState(false);
  const t = useTesti().foto;

  // Stato dello zoom: tenuto in ref per non ridisegnare a ogni movimento del dito.
  const zoom = useRef({ scala: 1, x: 0, y: 0 });
  const dita = useRef(new Map<number, Punto>());
  const gesto = useRef<{ dist: number; scala: number; centro: Punto; x: number; y: number } | null>(null);
  const ultimoTocco = useRef(0);
  const trascinato = useRef(false);
  const ultimoGesto = useRef(0);

  const applica = useCallback((animato = false) => {
    const img = foto.current;
    if (!img) return;
    const { scala, x, y } = zoom.current;
    img.style.transition = animato ? "transform .2s ease-out" : "none";
    img.style.transform = `translate(${x}px, ${y}px) scale(${scala})`;
  }, []);

  /** Evita che la foto ingrandita esca troppo dallo schermo. */
  const limita = useCallback(() => {
    const img = foto.current;
    const z = zoom.current;
    if (!img || z.scala <= 1) { z.scala = 1; z.x = 0; z.y = 0; return; }
    const maxX = (img.offsetWidth * (z.scala - 1)) / 2;
    const maxY = (img.offsetHeight * (z.scala - 1)) / 2;
    z.x = Math.max(-maxX, Math.min(maxX, z.x));
    z.y = Math.max(-maxY, Math.min(maxY, z.y));
  }, []);

  const azzera = useCallback(() => {
    zoom.current = { scala: 1, x: 0, y: 0 };
    dita.current.clear();
    gesto.current = null;
    applica();
  }, [applica]);

  const apri = () => {
    setAperta(true);
    dialog.current?.showModal();
    // Una voce nella cronologia: così il tasto indietro chiude la foto invece di cambiare pagina.
    // Si conserva lo stato di Next.js per non disturbare la navigazione dell'app.
    window.history.pushState({ ...(window.history.state ?? {}), pscFoto: true }, "");
    inCronologia.current = true;
  };

  const chiudi = () => dialog.current?.close();

  const allaChiusura = () => {
    setAperta(false);
    azzera();
    if (inCronologia.current) {
      inCronologia.current = false;
      window.history.back();
    }
  };

  useEffect(() => {
    const indietro = () => {
      if (!inCronologia.current || window.history.state?.pscFoto) return;
      inCronologia.current = false;
      dialog.current?.close();
    };
    window.addEventListener("popstate", indietro);
    return () => window.removeEventListener("popstate", indietro);
  }, []);

  const distanza = (a: Punto, b: Punto) => Math.hypot(a.x - b.x, a.y - b.y);

  const giu = (e: React.PointerEvent<HTMLImageElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dita.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    trascinato.current = false;
    const punti = [...dita.current.values()];
    const z = zoom.current;
    if (punti.length === 2) {
      gesto.current = {
        dist: distanza(punti[0], punti[1]),
        scala: z.scala,
        centro: { x: (punti[0].x + punti[1].x) / 2, y: (punti[0].y + punti[1].y) / 2 },
        x: z.x,
        y: z.y,
      };
    } else if (punti.length === 1) {
      gesto.current = { dist: 0, scala: z.scala, centro: punti[0], x: z.x, y: z.y };
    }
  };

  const muovi = (e: React.PointerEvent<HTMLImageElement>) => {
    if (!dita.current.has(e.pointerId) || !gesto.current) return;
    dita.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const punti = [...dita.current.values()];
    const g = gesto.current;
    const z = zoom.current;
    if (punti.length >= 2 && g.dist > 0) {
      const centro = { x: (punti[0].x + punti[1].x) / 2, y: (punti[0].y + punti[1].y) / 2 };
      z.scala = Math.max(1, Math.min(MAX_ZOOM, (g.scala * distanza(punti[0], punti[1])) / g.dist));
      z.x = g.x + centro.x - g.centro.x;
      z.y = g.y + centro.y - g.centro.y;
      trascinato.current = true;
    } else if (punti.length === 1 && z.scala > 1) {
      z.x = g.x + punti[0].x - g.centro.x;
      z.y = g.y + punti[0].y - g.centro.y;
      if (Math.abs(punti[0].x - g.centro.x) + Math.abs(punti[0].y - g.centro.y) > 6) trascinato.current = true;
    } else {
      return;
    }
    ultimoGesto.current = Date.now();
    limita();
    applica();
  };

  const su = (e: React.PointerEvent<HTMLImageElement>) => {
    dita.current.delete(e.pointerId);
    const rimaste = [...dita.current.values()];
    const z = zoom.current;
    // Se resta un dito, si continua a spostare la foto da lì.
    gesto.current = rimaste.length === 1 ? { dist: 0, scala: z.scala, centro: rimaste[0], x: z.x, y: z.y } : null;
    if (rimaste.length > 0 || trascinato.current) return;
    // Doppio tocco: ingrandisce o torna alla dimensione normale.
    const ora = Date.now();
    if (ora - ultimoTocco.current < 300) {
      ultimoTocco.current = 0;
      if (z.scala > 1) {
        zoom.current = { scala: 1, x: 0, y: 0 };
      } else {
        const r = e.currentTarget.getBoundingClientRect();
        z.scala = 2.5;
        z.x = (r.left + r.width / 2 - e.clientX) * 1.5;
        z.y = (r.top + r.height / 2 - e.clientY) * 1.5;
        limita();
      }
      applica(true);
    } else {
      ultimoTocco.current = ora;
    }
  };

  if (errore) {
    return <div className="media-placeholder"><span className="logo logo--crown" /></div>;
  }

  return (
    <>
      <button type="button" className={contenuta ? "foto-offerta foto-offerta--contenuta" : "foto-offerta"} onClick={apri} aria-label={forma(t.ingrandisci, { nome })}>
        <img src={src} alt="" loading="lazy" onError={() => setErrore(true)} />
      </button>

      <dialog
        ref={dialog}
        className="foto-overlay"
        aria-label={nome}
        onClose={allaChiusura}
        // Un tocco ovunque fuori dalla foto chiude.
        // (Non dopo un gesto con le dita: alcuni telefoni lo trasformano in un tocco.)
        onClick={(e) => { if (e.target !== foto.current && Date.now() - ultimoGesto.current > 400) chiudi(); }}
      >
        <div className="foto-overlay__bar">
          <p className="foto-overlay__nome">{nome}</p>
          <button type="button" className="icon-btn foto-overlay__chiudi" aria-label={t.chiudi} onClick={chiudi}>
            <IconChiudi />
          </button>
        </div>
        <div className="foto-overlay__area">
          {aperta && (
            <img
              ref={foto}
              src={src}
              alt={nome}
              className="foto-overlay__img"
              draggable={false}
              onPointerDown={giu}
              onPointerMove={muovi}
              onPointerUp={su}
              onPointerCancel={su}
            />
          )}
        </div>
        <p className="foto-overlay__hint">{t.suggerimento}</p>
      </dialog>
    </>
  );
}
