import { Fragment, type ReactNode } from "react";

/** Sostituisce {chiave} con il valore: forma("Cifra {n}", { n: 3 }) → "Cifra 3". */
export const forma = (testo: string, valori: Record<string, string | number>) =>
  testo.replace(/\{(\w+)\}/g, (tutto, k: string) => (k in valori ? String(valori[k]) : tutto));

/**
 * Come forma, ma i valori possono essere elementi (un'icona, un <strong>) e
 * **parola** diventa grassetto. Serve per i testi con pezzi evidenziati.
 */
export function ricco(testo: string, valori: Record<string, ReactNode> = {}): ReactNode {
  return testo.split(/(\*\*[^*]+\*\*|\{\w+\})/).map((pezzo, i) => {
    if (pezzo.startsWith("**") && pezzo.endsWith("**")) return <strong key={i}>{pezzo.slice(2, -2)}</strong>;
    const k = /^\{(\w+)\}$/.exec(pezzo)?.[1];
    return <Fragment key={i}>{k && k in valori ? valori[k] : pezzo}</Fragment>;
  });
}
