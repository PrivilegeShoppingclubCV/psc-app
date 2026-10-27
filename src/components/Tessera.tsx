import type { Socio } from "@/lib/tipi";

/** Fronte della tessera digitale, in proporzione ISO come la carta fisica. */
export function Tessera({ socio }: { socio: Socio }) {
  return (
    <div className="psc-tessera" role="img" aria-label={`Tessera Privilege Shopping Club di ${socio.nome} ${socio.cognome}, livello ${socio.livello}`}>
      <span className="logo logo--lockup psc-tessera__logo" />
      <div className="psc-tessera__meta">
        <span className="psc-tessera__name">{socio.nome} {socio.cognome}</span>
        <span className="psc-tessera__level">{socio.livello}</span>
      </div>
    </div>
  );
}
