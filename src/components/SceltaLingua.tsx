"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { COOKIE_LINGUA, LINGUE, type Lingua } from "@/lib/i18n/lingue";

/**
 * Menu per cambiare lingua. La scelta resta in un cookie per un anno e vince
 * sulla lingua del browser; la pagina si ricarica dal server con i nuovi testi.
 */
export function SceltaLingua({ lingua, etichetta }: { lingua: Lingua; etichetta: string }) {
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
          document.cookie = `${COOKIE_LINGUA}=${e.target.value}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
          avvia(() => router.refresh());
        }}
      >
        {LINGUE.map((l) => (
          <option key={l.codice} value={l.codice} lang={l.codice}>{l.nome}</option>
        ))}
      </select>
    </label>
  );
}
