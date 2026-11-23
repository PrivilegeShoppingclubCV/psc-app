"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { LINGUE, type Lingua } from "@/lib/i18n/lingue";
import { cambiaLingua } from "@/app/accesso/azioni";

/**
 * Menu per cambiare lingua. La scelta resta in un cookie per un anno e vince
 * sulla lingua del browser (per chi è dentro va anche nei dati dell'utente, per
 * le email); la pagina si ricarica dal server con i nuovi testi.
 */
export function SceltaLingua({
  lingua,
  etichetta,
  azione = cambiaLingua,
}: {
  lingua: Lingua;
  etichetta: string;
  /** Di serie salva la scelta anche nell'account; l'admin ne passa una che cambia solo il cookie. */
  azione?: (lingua: string) => Promise<void>;
}) {
  const router = useRouter();
  const [inCorso, avvia] = useTransition();

  return (
    <label className="scelta-lingua">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z" />
      </svg>
      <span className="sr-only">{etichetta}</span>
      <select
        value={lingua}
        disabled={inCorso}
        onChange={(e) => {
          const scelta = e.target.value;
          avvia(async () => {
            await azione(scelta);
            router.refresh();
          });
        }}
      >
        {LINGUE.map((l) => (
          <option key={l.codice} value={l.codice} lang={l.codice}>{l.nome}</option>
        ))}
      </select>
    </label>
  );
}
