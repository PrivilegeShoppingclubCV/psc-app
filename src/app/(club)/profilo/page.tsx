import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/PageHead";
import { formatData, formatTessera } from "@/lib/format";
import { socio } from "@/lib/mock-data";

export const metadata: Metadata = { title: "Profilo" };

export default function Profilo() {
  return (
    <>
      <PageHead eyebrow={`Livello ${socio.livello}`} titolo={`${socio.nome} ${socio.cognome}`} />

      <section className="section" aria-labelledby="dati">
        <h2 id="dati" className="t-title">I tuoi dati</h2>
        <ul className="list">
          <li><span className="t-caption">Email</span><span>{socio.email}</span></li>
          <li><span className="t-caption">Tessera</span><span className="psc-code">{formatTessera(socio.numeroTessera)}</span></li>
          <li><span className="t-caption">Socio dal</span><span>{formatData(socio.iscrittoDal)}</span></li>
        </ul>
      </section>

      <section className="section" aria-labelledby="invita">
        <div className="psc-referral">
          <span className="psc-referral__eyebrow">Invita un amico</span>
          <h2 id="invita" className="psc-referral__title">Il tuo codice invito</h2>
          <p className="psc-referral__text">Presto potrai condividerlo e guadagnare punti per ogni amico che si iscrive.</p>
          <div className="psc-referral__code">
            <span className="psc-code">{socio.codiceInvito}</span>
          </div>
        </div>
      </section>

      <Link href="/" className="psc-btn psc-btn--secondary psc-btn--block">Esci</Link>
    </>
  );
}
