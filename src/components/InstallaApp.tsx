"use client";

import { useEffect, useRef, useState } from "react";
import { installaAndroid, linkChrome, useInstallazione, type Installazione } from "@/lib/installa";
import { IconChiudi, IconInstalla } from "./Icons";

// Banner "Installa l'app" in Home, tasto "Installa" nell'intestazione e barra
// fissa nella pagina di benvenuto.
// - Android/Chrome (e Edge desktop): il pulsante apre l'installazione del browser.
// - iPhone/iPad: si spiega come aggiungerla dal tasto Condividi di Safari.
// - Samsung Internet: si propone di aprire la pagina in Chrome.
// - Altri telefoni: si spiega come farlo dal menu del browser.
// Nessuno dei due compare se l'app è già aperta dalla schermata Home.
// Il banner si può chiudere per sempre; il tasto in alto resta, così chi
// l'ha chiuso può installarla quando vuole.

const CHIAVE = "psc_installa_chiuso";

function chiusoDalSocio() {
  try {
    return localStorage.getItem(CHIAVE) === "1";
  } catch {
    return false;
  }
}

export function InstallaApp() {
  const tipo = useInstallazione();
  const [chiuso, setChiuso] = useState(true);

  useEffect(() => setChiuso(chiusoDalSocio()), []);

  if (tipo === "nessuna" || chiuso) return null;

  const chiudi = () => {
    try {
      localStorage.setItem(CHIAVE, "1");
    } catch {}
    setChiuso(true);
  };

  return (
    <aside className="installa" aria-labelledby="installa-titolo">
      <button type="button" className="installa__chiudi" onClick={chiudi} aria-label="Non mostrare più">
        <IconChiudi />
      </button>
      <h2 id="installa-titolo" className="installa__titolo">Metti l&apos;app sulla schermata Home</h2>
      {tipo === "android" ? (
        <>
          <p className="installa__testo">La apri con un tocco, come le altre app, e la tessera è sempre a portata di mano.</p>
          <button type="button" className="psc-btn psc-btn--primary psc-btn--block" onClick={installaAndroid}>Installa l&apos;app</button>
        </>
      ) : (
        <Passi tipo={tipo} />
      )}
    </aside>
  );
}

/** Tasto "Installa" piccolo nell'intestazione delle pagine del club. */
export function TastoInstalla() {
  const tipo = useInstallazione();
  const dialog = useRef<HTMLDialogElement>(null);

  if (tipo === "nessuna") return null;

  return (
    <>
      <button type="button" className="installa-tasto" onClick={() => premiInstalla(tipo, dialog.current)}>
        <IconInstalla />
        Installa
      </button>
      <FinestraPassi tipo={tipo} ref={dialog} />
    </>
  );
}

const CHIAVE_BARRA = "psc_barra_installa_chiusa";

/**
 * Barra fissa in cima alla pagina di benvenuto: icona dell'app, invito,
 * tasto "Installa" e X per chiuderla. Chiusa una volta, non torna più
 * su quel telefono.
 */
export function BarraInstalla() {
  const tipo = useInstallazione();
  const dialog = useRef<HTMLDialogElement>(null);
  const [chiusa, setChiusa] = useState(true);

  useEffect(() => {
    try {
      setChiusa(localStorage.getItem(CHIAVE_BARRA) === "1");
    } catch {
      setChiusa(false);
    }
  }, []);

  if (tipo === "nessuna" || chiusa) return null;

  const chiudi = () => {
    try {
      localStorage.setItem(CHIAVE_BARRA, "1");
    } catch {}
    setChiusa(true);
  };

  return (
    <>
      {/* Occupa lo spazio della barra, così non copre il logo. */}
      <div className="barra-installa__spazio" aria-hidden="true" />
      <aside className="barra-installa" aria-label="Installa l'app">
        <button type="button" className="barra-installa__chiudi" onClick={chiudi} aria-label="Chiudi e non mostrare più">
          <IconChiudi />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" width={40} height={40} className="barra-installa__icona" />
        <p className="barra-installa__testo">Installa l&apos;app per averla sempre con te</p>
        <button type="button" className="barra-installa__tasto" onClick={() => premiInstalla(tipo, dialog.current)}>Installa</button>
      </aside>
      <FinestraPassi tipo={tipo} ref={dialog} />
    </>
  );
}

function premiInstalla(tipo: Installazione, dialog: HTMLDialogElement | null) {
  if (tipo === "android") installaAndroid();
  else dialog?.showModal();
}

/** Finestra con i passi per installare, dove il browser non lo fa da solo. */
function FinestraPassi({ tipo, ref }: { tipo: Installazione; ref: React.Ref<HTMLDialogElement> }) {
  if (tipo === "android" || tipo === "nessuna") return null;
  const chiudi = (e: React.MouseEvent<HTMLElement>) => e.currentTarget.closest("dialog")?.close();
  return (
    <dialog
      ref={ref}
      className="installa-dialog"
      aria-labelledby="installa-dialog-titolo"
      onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}
    >
      <div className="installa installa--dialog">
        <button type="button" className="installa__chiudi" onClick={chiudi} aria-label="Chiudi">
          <IconChiudi />
        </button>
        <h2 id="installa-dialog-titolo" className="installa__titolo">Metti l&apos;app sulla schermata Home</h2>
        <Passi tipo={tipo} />
      </div>
    </dialog>
  );
}

const Passi = ({ tipo }: { tipo: Installazione }) =>
  tipo === "ios" ? <PassiIOS /> : tipo === "samsung" ? <PassiSamsung /> : <PassiMenu />;

// Samsung Internet: l'installazione da qui viene bloccata da Play Protect.
const PassiSamsung = () => (
  <>
    <p className="installa__testo">Da Samsung Internet l&apos;installazione può essere bloccata dal telefono. Apri la pagina in Chrome e installala da lì.</p>
    <a href={linkChrome()} className="psc-btn psc-btn--primary psc-btn--block">Apri in Chrome</a>
  </>
);

const PassiIOS = () => (
  <ol className="installa__passi">
    <li>Apri questa pagina in Safari.</li>
    <li>Tocca <strong>Condividi</strong> <IconCondividi /> in basso (o in alto su iPad).</li>
    <li>Scegli <strong>Aggiungi alla schermata Home</strong>, poi <strong>Aggiungi</strong>.</li>
  </ol>
);

const PassiMenu = () => (
  <ol className="installa__passi">
    <li>Tocca il menu del browser <IconMenu /> in alto a destra.</li>
    <li>Scegli <strong>Installa app</strong> oppure <strong>Aggiungi a schermata Home</strong>.</li>
    <li>Conferma con <strong>Installa</strong> o <strong>Aggiungi</strong>.</li>
  </ol>
);

// I tre puntini del menu di Chrome.
const IconMenu = () => (
  <svg className="installa__icona" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" />
  </svg>
);

// Il simbolo del tasto Condividi di Safari, per riconoscerlo.
const IconCondividi = () => (
  <svg className="installa__icona" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3v12M8 7l4-4 4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
  </svg>
);
