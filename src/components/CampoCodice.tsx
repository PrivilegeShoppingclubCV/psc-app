"use client";

import { useRef, useState } from "react";

const CIFRE = 6;

/**
 * Sei caselle per il codice ricevuto via email. Si va avanti da soli a ogni
 * cifra, si torna indietro con Cancella, si può incollare il codice intero (o
 * prenderlo dal suggerimento della tastiera) e a sei cifre il modulo parte da solo.
 * Al server arriva un solo campo `name` con le sei cifre.
 */
export function CampoCodice({ name = "codice" }: { name?: string }) {
  const [cifre, setCifre] = useState<string[]>(() => Array(CIFRE).fill(""));
  const caselle = useRef<(HTMLInputElement | null)[]>([]);
  const nascosto = useRef<HTMLInputElement>(null);

  const imposta = (nuove: string[], fuoco: number) => {
    setCifre(nuove);
    caselle.current[Math.min(fuoco, CIFRE - 1)]?.focus();
    if (nuove.every(Boolean) && nascosto.current) {
      nascosto.current.value = nuove.join("");
      nascosto.current.form?.requestSubmit();
    }
  };

  // Scrive le cifre di `testo` a partire dalla casella `da` (una cifra o un codice incollato).
  const scrivi = (da: number, testo: string) => {
    const solo = testo.replace(/\D/g, "").slice(0, CIFRE - da);
    if (!solo) return;
    const nuove = [...cifre];
    [...solo].forEach((c, i) => (nuove[da + i] = c));
    imposta(nuove, da + solo.length);
  };

  return (
    <div className="psc-field">
      <span className="psc-field__label" id={`${name}-label`}>Codice di 6 cifre</span>
      <div className="codice-caselle" role="group" aria-labelledby={`${name}-label`}>
        {cifre.map((c, i) => (
          <input
            key={i}
            ref={(el) => {
              caselle.current[i] = el;
            }}
            className="codice-casella"
            value={c}
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            autoFocus={i === 0}
            maxLength={i === 0 ? CIFRE : 1}
            aria-label={`Cifra ${i + 1}`}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => {
              const v = e.currentTarget.value;
              if (v === "") {
                const nuove = [...cifre];
                nuove[i] = "";
                setCifre(nuove);
              } else {
                // Tiene l'ultima cifra scritta, o tutto il codice se arriva insieme.
                scrivi(i, v.length > 1 && v.startsWith(c) ? v.slice(c.length) : v);
              }
            }}
            onPaste={(e) => {
              e.preventDefault();
              scrivi(0, e.clipboardData.getData("text"));
            }}
            onKeyDown={(e) => {
              if (e.key === "Backspace" && !c && i > 0) {
                const nuove = [...cifre];
                nuove[i - 1] = "";
                setCifre(nuove);
                caselle.current[i - 1]?.focus();
                e.preventDefault();
              }
            }}
          />
        ))}
      </div>
      <input ref={nascosto} type="hidden" name={name} value={cifre.join("")} />
    </div>
  );
}
