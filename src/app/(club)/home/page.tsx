import Link from "next/link";
import { InstallaApp } from "@/components/InstallaApp";
import { LinkGenitore } from "@/components/LinkGenitore";
import { PageHead } from "@/components/PageHead";
import { SaldoPunti } from "@/components/SaldoPunti";
import { ApriTessera } from "@/components/TesseraFullscreen";
import { getPremi, getRecapiti, getSaldo } from "@/lib/dati";
import { getSocio } from "@/lib/socio";
import { forma, getTestiClub } from "@/lib/i18n";

export async function generateMetadata() {
  return { title: (await getTestiClub()).home.titoloPagina };
}

export default async function Home() {
  const socio = await getSocio();
  const [saldo, premi, recapiti] = await Promise.all([getSaldo(socio.id), getPremi(), getRecapiti(socio.id)]);
  // I soci fatti in negozio possono non avere questi dati: si chiede di completarli,
  // senza bloccare nulla.
  const t = (await getTestiClub()).home;
  const datiMancanti = !recapiti.nascita || !recapiti.indirizzo || !recapiti.cap || !recapiti.citta;

  return (
    <>
      <PageHead eyebrow={forma(t.socioDal, { anno: new Date(socio.iscrittoDal).getFullYear() })} titolo={socio.nome ? forma(t.ciao, { nome: socio.nome }) : t.ciaoSolo} />

      <section className="section" aria-label={t.saldoAria}>
        <SaldoPunti saldo={saldo} premi={premi} />
        {socio.daUnire ? (
          <p className="notice">{t.daUnire}</p>
        ) : socio.inAttivazione && (
          <p className="psc-hint">{t.inAttivazione}</p>
        )}
        <ApriTessera socio={socio} />
      </section>

      {socio.attesaGenitore === "punti_offerte" && (
        <section className="section" aria-labelledby="genitore">
          <div className="installa">
            <h2 id="genitore" className="installa__titolo">{t.genitoreTitolo}</h2>
            <p className="installa__testo">{t.genitoreTesto}</p>
            <LinkGenitore nome={socio.nome} />
          </div>
        </section>
      )}

      {datiMancanti && (
        <section className="section" aria-label={t.datiAria}>
          <p className="notice">
            {t.datiMancanti}{" "}
            <Link href="/profilo/dati">{t.completali}</Link>
          </p>
        </section>
      )}

      <InstallaApp />

      <section className="section" aria-labelledby="invita">
        <div className="psc-referral">
          <span className="psc-referral__eyebrow">{t.invitaEyebrow}</span>
          <h2 id="invita" className="psc-referral__title">{t.invitaTitolo}</h2>
          <p className="psc-referral__text">{t.invitaTesto}</p>
          <Link href="/profilo" className="psc-btn psc-btn--copy">{t.scopri}</Link>
        </div>
      </section>
    </>
  );
}
