import type { Metadata } from "next";
import { EsciButton } from "@/components/EsciButton";
import { PageHead } from "@/components/PageHead";
import { formatData, formatTessera } from "@/lib/format";
import { getSocio } from "@/lib/socio";

export const metadata: Metadata = { title: "Profilo" };

export default async function Profilo() {
  const socio = await getSocio();

  return (
    <>
      <PageHead eyebrow={`Livello ${socio.livello}`} titolo={`${socio.nome} ${socio.cognome}`.trim() || "Il tuo profilo"} />

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
          <p className="psc-referral__text">Chi si iscrive con il tuo codice risulta invitato da te. I punti per gli inviti arrivano con la prossima versione.</p>
          <div className="psc-referral__code">
            <span className="psc-code">{socio.codiceInvito}</span>
          </div>
        </div>
      </section>

      <EsciButton />
    </>
  );
}
