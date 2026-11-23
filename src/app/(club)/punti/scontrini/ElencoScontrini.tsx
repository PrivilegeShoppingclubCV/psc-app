"use client";

import { useState, useTransition } from "react";
import { CartaScontrino } from "@/components/CartaScontrino";
import { formati } from "@/lib/i18n/formati";
import type { Lingua } from "@/lib/i18n/lingue";
import type { TestiClub } from "@/lib/i18n/testi";
import type { Scontrino } from "@/lib/tipi";
import { altriScontrini } from "./azioni";

/**
 * Elenco degli scontrini: i primi arrivano con la pagina, gli altri solo se il
 * socio preme "Carica altri", sempre a gruppi da 10 e senza rileggere quelli già mostrati.
 */
export function ElencoScontrini({ iniziali, altriIniziali, lingua, t }: {
  iniziali: Scontrino[];
  altriIniziali: boolean;
  lingua: Lingua;
  t: TestiClub["scontrini"];
}) {
  const [scontrini, setScontrini] = useState(iniziali);
  const [altri, setAltri] = useState(altriIniziali);
  const [errore, setErrore] = useState(false);
  const [inCorso, avvia] = useTransition();
  const f = formati(lingua);

  const carica = () => avvia(async () => {
    const ultimo = scontrini[scontrini.length - 1];
    try {
      const r = await altriScontrini(ultimo.data, ultimo.id);
      setScontrini((prima) => [...prima, ...r.scontrini.filter((s) => !prima.some((p) => p.id === s.id))]);
      setAltri(r.altri);
      setErrore(false);
    } catch {
      setErrore(true);
    }
  });

  return (
    <>
      <ul className="scontrini">
        {scontrini.map((s) => (
          <li key={s.id}>
            <details className="scontrino">
              <summary>
                <span className="list__main">
                  <span>{s.negozio ?? t.acquisto}</span>
                  <span className="t-caption">{f.data(s.data)}</span>
                </span>
                <span className="list__value">{f.euro(s.totale)}</span>
              </summary>
              <CartaScontrino s={s} f={f} t={t} />
            </details>
          </li>
        ))}
      </ul>
      {errore && <p className="t-caption" role="alert">{t.erroreCarica}</p>}
      {altri && (
        <button type="button" className="psc-btn psc-btn--secondary psc-btn--block" onClick={carica} disabled={inCorso} aria-busy={inCorso}>
          {inCorso ? t.caricamento : t.caricaAltri}
        </button>
      )}
    </>
  );
}
