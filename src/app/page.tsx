import Link from "next/link";

export default function Benvenuto() {
  return (
    <main className="welcome">
      <div className="welcome__brand">
        <span className="logo logo--lockup" role="img" aria-label="Privilege Shopping Club" />
        <p className="t-body-l">La tua tessera, i punti e le offerte riservate ai soci, sempre in tasca.</p>
      </div>
      <div className="welcome__actions">
        <Link href="/collega-tessera" className="psc-btn psc-btn--primary psc-btn--block">Ho già la tessera</Link>
        <Link href="/iscriviti" className="psc-btn psc-btn--secondary psc-btn--block">Voglio iscrivermi</Link>
        <Link href="/accedi" className="psc-btn psc-btn--ghost">Accedi</Link>
      </div>
    </main>
  );
}
