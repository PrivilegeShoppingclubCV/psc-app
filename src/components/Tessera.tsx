"use client";

import type { Socio } from "@/lib/tipi";
import { forma, useTesti } from "@/lib/i18n/client";

/** Fronte della tessera digitale, in proporzione ISO come la carta fisica. */
export function Tessera({ socio }: { socio: Socio }) {
  const t = useTesti().carta;
  return (
    <div className="psc-tessera" dir="ltr" role="img" aria-label={forma(t.aria, { nome: `${socio.nome} ${socio.cognome}`.trim(), livello: socio.livello })}>
      <span className="logo logo--lockup psc-tessera__logo" />
      <div className="psc-tessera__meta">
        <span className="psc-tessera__name">{socio.nome} {socio.cognome}</span>
        <span className="psc-tessera__level">{socio.livello}</span>
      </div>
    </div>
  );
}
