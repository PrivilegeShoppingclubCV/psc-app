"use client";

import { useEffect, useState } from "react";
import { IconChiudi } from "./Icons";

// Banner "Installa l'app" in Home.
// - Android/Chrome (e Edge desktop): il browser offre l'installazione
//   (beforeinstallprompt) e il pulsante la apre.
// - iPhone/iPad: Safari non ha un'installazione da pulsante, si spiega come
//   aggiungerla dal tasto Condividi.
// Non compare se l'app è già aperta dalla schermata Home o se il socio l'ha chiuso.

const CHIAVE = "psc_installa_chiuso";

interface EventoInstalla extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Stato = { tipo: "nascosto" } | { tipo: "android"; evento: EventoInstalla } | { tipo: "ios" };

function giaInstallata() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

function chiusoDalSocio() {
  try {
    return localStorage.getItem(CHIAVE) === "1";
  } catch {
    return false;
  }
}

export function InstallaApp() {
  const [stato, setStato] = useState<Stato>({ tipo: "nascosto" });

  useEffect(() => {
    if (giaInstallata() || chiusoDalSocio()) return;
    const ua = navigator.userAgent;
    // iPadOS si presenta come Mac: lo tradisce il touch.
    const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    if (ios) {
      setStato({ tipo: "ios" });
      return;
    }
    const offerta = (e: Event) => {
      e.preventDefault();
      setStato({ tipo: "android", evento: e as EventoInstalla });
    };
    const installata = () => setStato({ tipo: "nascosto" });
    window.addEventListener("beforeinstallprompt", offerta);
    window.addEventListener("appinstalled", installata);
    return () => {
      window.removeEventListener("beforeinstallprompt", offerta);
      window.removeEventListener("appinstalled", installata);
    };
  }, []);

  if (stato.tipo === "nascosto") return null;

  const chiudi = () => {
    try {
      localStorage.setItem(CHIAVE, "1");
    } catch {}
    setStato({ tipo: "nascosto" });
  };

  const installa = async () => {
    if (stato.tipo !== "android") return;
    await stato.evento.prompt();
    const { outcome } = await stato.evento.userChoice;
    if (outcome === "accepted") setStato({ tipo: "nascosto" });
  };

  return (
    <aside className="installa" aria-labelledby="installa-titolo">
      <button type="button" className="installa__chiudi" onClick={chiudi} aria-label="Non mostrare più">
        <IconChiudi />
      </button>
      <h2 id="installa-titolo" className="installa__titolo">Metti l&apos;app sulla schermata Home</h2>
      {stato.tipo === "android" ? (
        <>
          <p className="installa__testo">La apri con un tocco, come le altre app, e la tessera è sempre a portata di mano.</p>
          <button type="button" className="psc-btn psc-btn--primary psc-btn--block" onClick={installa}>Installa l&apos;app</button>
        </>
      ) : (
        <ol className="installa__passi">
          <li>Apri questa pagina in Safari.</li>
          <li>Tocca <strong>Condividi</strong> <IconCondividi /> in basso (o in alto su iPad).</li>
          <li>Scegli <strong>Aggiungi alla schermata Home</strong>, poi <strong>Aggiungi</strong>.</li>
        </ol>
      )}
    </aside>
  );
}

// Il simbolo del tasto Condividi di Safari, per riconoscerlo.
const IconCondividi = () => (
  <svg className="installa__icona" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3v12M8 7l4-4 4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
  </svg>
);
