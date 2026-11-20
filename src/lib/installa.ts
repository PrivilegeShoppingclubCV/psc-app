"use client";

import { useSyncExternalStore } from "react";

// Stato condiviso dell'installazione dell'app, usato dal banner in Home e dal
// tasto "Installa" nell'intestazione.
// - Android/Chrome (e Edge desktop): il browser manda beforeinstallprompt una
//   sola volta per pagina; lo teniamo qui così qualsiasi tasto può riaprirlo.
// - iPhone/iPad: nessuna installazione da pulsante, si mostrano le istruzioni.
// - Già installata (aperta dalla schermata Home) o browser senza installazione:
//   niente da mostrare.

export interface EventoInstalla extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type Installazione = "nessuna" | "android" | "ios";

let evento: EventoInstalla | null = null;
let installata = false;
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
  if (evento) return "android";
  if (iOS()) return "ios";
  return "nessuna";
}

function iscrivi(f: () => void) {
  ascoltatori.add(f);
  return () => {
    ascoltatori.delete(f);
  };
}

/** Che tipo di installazione si può offrire in questo browser. */
export function useInstallazione(): Installazione {
  return useSyncExternalStore(iscrivi, leggi, () => "nessuna");
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
