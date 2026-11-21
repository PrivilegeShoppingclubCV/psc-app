"use client";

import { useSyncExternalStore } from "react";

// Stato condiviso dell'installazione dell'app, usato dal banner in Home e dal
// tasto "Installa" nell'intestazione.
// - Android/Chrome (e Edge desktop): il browser manda beforeinstallprompt una
//   sola volta per pagina; lo teniamo qui così qualsiasi tasto può riaprirlo.
// - iPhone/iPad: nessuna installazione da pulsante, si mostrano le istruzioni.
// - Samsung Internet: si invita ad aprire la pagina in Chrome (vedi samsung()).
// - Altri telefoni (Android prima che Chrome offra l'installazione, Firefox...): si spiega come farlo dal menu del browser.
// - Già installata (aperta dalla schermata Home, o rilevata da Chrome) o
//   computer senza installazione: niente da mostrare.

export interface EventoInstalla extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type Installazione = "nessuna" | "android" | "ios" | "samsung" | "menu";

let evento: EventoInstalla | null = null;
let installata = false;
let iniziato = false;
const ascoltatori = new Set<() => void>();
const avvisa = () => ascoltatori.forEach((f) => f());

function giaInstallata() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

function iOS() {
  const ua = navigator.userAgent;
  // iPadOS si presenta come Mac: lo tradisce il touch.
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

// Samsung Internet installa l'app come pacchetto che Google Play Protect può
// bloccare: lì si propone di aprire la pagina in Chrome.
function samsung() {
  return /SamsungBrowser/i.test(navigator.userAgent);
}

function telefono() {
  return /Android|Mobi/i.test(navigator.userAgent);
}

// Chrome su Android sa dire se la nostra app è già installata, anche quando la
// pagina è aperta nel browser (vedi related_applications nel manifest).
function controllaInstallata() {
  if (iniziato) return;
  iniziato = true;
  const nav = navigator as Navigator & { getInstalledRelatedApps?: () => Promise<unknown[]> };
  nav.getInstalledRelatedApps?.()
    .then((app) => {
      if (app.length > 0) {
        installata = true;
        avvisa();
      }
    })
    .catch(() => {});
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    evento = e as EventoInstalla;
    avvisa();
  });
  window.addEventListener("appinstalled", () => {
    installata = true;
    evento = null;
    avvisa();
  });
}

function leggi(): Installazione {
  if (installata || giaInstallata()) return "nessuna";
  if (samsung()) return "samsung";
  if (evento) return "android";
  if (iOS()) return "ios";
  if (telefono()) return "menu";
  return "nessuna";
}

function iscrivi(f: () => void) {
  controllaInstallata();
  ascoltatori.add(f);
  return () => {
    ascoltatori.delete(f);
  };
}

/** Che tipo di installazione si può offrire in questo browser. */
export function useInstallazione(): Installazione {
  return useSyncExternalStore(iscrivi, leggi, () => "nessuna");
}

/**
 * Indirizzo che da Samsung Internet riapre la stessa pagina in Chrome. Se Chrome
 * non c'è, Android apre il Play Store su Chrome.
 */
export function linkChrome() {
  const { host, pathname, search } = window.location;
  const ritorno = encodeURIComponent("https://play.google.com/store/apps/details?id=com.android.chrome");
  return `intent://${host}${pathname}${search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${ritorno};end`;
}

/** Apre la finestra di installazione di Android/Chrome. */
export async function installaAndroid() {
  if (!evento) return;
  const e = evento;
  await e.prompt();
  const { outcome } = await e.userChoice;
  // Il browser non riusa lo stesso evento: se rifiuta, ne arriverà un altro più avanti.
  evento = null;
  if (outcome === "accepted") installata = true;
  avvisa();
}
