"use client";

// Chi esce dall'app per leggere il codice nell'email spesso la ritrova ripartita da
// capo (app installata su iPhone e Android): qui si riporta alla pagina del codice e
// si rimettono nel modulo i dati già scritti.

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Nella pagina di benvenuto: se c'è un codice da scrivere e l'app si è appena aperta
 * proprio qui, si va dritti alla pagina del codice. Solo all'apertura: chi ci torna
 * con "Indietro" resta sul benvenuto.
 */
export function TornaAlCodice({ href }: { href: string }) {
  const router = useRouter();
  useEffect(() => {
    const w = window as typeof window & { __pscRipresa?: boolean };
    if (w.__pscRipresa) return;
    w.__pscRipresa = true;
    const apertura = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const apertaQui = !apertura || new URL(apertura.name).pathname === "/";
    if (apertaQui) router.replace(href);
  }, [href, router]);
  return null;
}

const BOZZA_ISCRIZIONE = "psc_bozza_iscrizione";
const DURATA = 2 * 60 * 60 * 1000; // la bozza vale 2 ore

type Bozza = { scade: number; campi: Record<string, string> };

function leggi(chiave: string): Bozza | null {
  try {
    const b = JSON.parse(localStorage.getItem(chiave) ?? "null") as Bozza | null;
    if (b && b.scade > Date.now()) return b;
    localStorage.removeItem(chiave);
  } catch {
    /* memoria del browser non disponibile */
  }
  return null;
}

/** Scrive un testo come se l'avesse scritto il socio (vale anche per i campi gestiti da React, come la data). */
function scrivi(el: HTMLInputElement, valore: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(el, valore);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * Dentro il modulo di iscrizione: salva nel telefono quello che si scrive (solo su questo
 * dispositivo, per 2 ore) e lo rimette se la pagina si riapre vuota.
 * Si cancella a iscrizione finita (vedi PulisciBozza).
 */
export function MemoriaIscrizione() {
  const chiave = BOZZA_ISCRIZIONE;
  const segno = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const form = segno.current?.closest("form");
    if (!form) return;
    // Solo i campi di testo: le spunte dei consensi le rimette il socio, ogni volta.
    const campi = () =>
      [...form.querySelectorAll<HTMLInputElement>("input[id]")].filter((el) => ["text", "email", "tel"].includes(el.type));

    // Si rimette la bozza solo se il modulo è vuoto (non sopra i dati tornati con un errore).
    const bozza = leggi(chiave);
    if (bozza && campi().every((el) => !el.value)) {
      for (const el of campi()) {
        const v = bozza.campi[el.id];
        if (typeof v === "string" && v) scrivi(el, v);
      }
    }

    const salva = () => {
      const valori: Bozza["campi"] = {};
      for (const el of campi()) valori[el.id] = el.value;
      try {
        localStorage.setItem(chiave, JSON.stringify({ scade: Date.now() + DURATA, campi: valori }));
      } catch {
        /* memoria piena o non disponibile: pazienza */
      }
    };
    form.addEventListener("input", salva);
    return () => form.removeEventListener("input", salva);
  }, [chiave]);
  return <span ref={segno} hidden />;
}

/** Nelle pagine dei soci: iscrizione finita, la bozza non serve più. */
export function PulisciBozza() {
  useEffect(() => {
    try {
      localStorage.removeItem(BOZZA_ISCRIZIONE);
    } catch {
      /* niente da fare */
    }
  }, []);
  return null;
}
