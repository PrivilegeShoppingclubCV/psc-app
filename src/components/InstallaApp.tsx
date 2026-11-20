"use client";

import { useEffect, useRef, useState } from "react";
import { installaAndroid, useInstallazione } from "@/lib/installa";
import { IconChiudi, IconInstalla } from "./Icons";

// Banner "Installa l'app" in Home e tasto "Installa" nell'intestazione.
// - Android/Chrome (e Edge desktop): il pulsante apre l'installazione del browser.
// - iPhone/iPad: si spiega come aggiungerla dal tasto Condividi di Safari.
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
      ) : tipo === "ios" ? (
        <PassiIOS />
      ) : (
        <PassiMenu />
      )}
    </aside>
  );
}

/**
 * Tasto "Installa l'app": piccolo nell'intestazione delle pagine del club,
 * grande nella pagina di benvenuto (la prima che si vede aprendo l'app).
 */
export function TastoInstalla({ grande = false }: { grande?: boolean }) {
  const tipo = useInstallazione();
  const dialog = useRef<HTMLDialogElement>(null);

  if (tipo === "nessuna") return null;

  const premi = () => (tipo === "android" ? installaAndroid() : dialog.current?.showModal());

  return (
    <>
      <button type="button" className={grande ? "psc-btn psc-btn--secondary psc-btn--block installa-grande" : "installa-tasto"} onClick={premi}>
        <IconInstalla />
        Installa l&apos;app
      </button>
      {tipo !== "android" && (
        <dialog
          ref={dialog}
          className="installa-dialog"
          aria-labelledby="installa-dialog-titolo"
          onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
        >
          <div className="installa installa--dialog">
            <button type="button" className="installa__chiudi" onClick={() => dialog.current?.close()} aria-label="Chiudi">
              <IconChiudi />
            </button>
            <h2 id="installa-dialog-titolo" className="installa__titolo">Metti l&apos;app sulla schermata Home</h2>
            {tipo === "ios" ? <PassiIOS /> : <PassiMenu />}
          </div>
        </dialog>
      )}
    </>
  );
}

const PassiIOS = () => (
  <ol className="installa__passi">
    <li>Apri questa pagina in Safari.</li>
    <li>Tocca <strong>Condividi</strong> <IconCondividi /> in basso (o in alto su iPad).</li>
    <li>Scegli <strong>Aggiungi alla schermata Home</strong>, poi <strong>Aggiungi</strong>.</li>
  </ol>
);

const PassiMenu = () => (
  <ol className="installa__passi">
    <li>Tocca il menu del browser <IconMenu /> (in alto a destra, o in basso su Samsung Internet).</li>
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
