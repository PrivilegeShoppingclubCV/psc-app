import type { Metadata } from "next";
import Link from "next/link";
import { InstallaApp } from "@/components/InstallaApp";
import { LinkGenitore } from "@/components/LinkGenitore";
import { PageHead } from "@/components/PageHead";
import { SaldoPunti } from "@/components/SaldoPunti";
import { ApriTessera } from "@/components/TesseraFullscreen";
import { getPremi, getRecapiti, getSaldo } from "@/lib/dati";
import { getSocio } from "@/lib/socio";

export const metadata: Metadata = { title: "Home" };

export default async function Home() {
  const socio = await getSocio();
  const [saldo, premi, recapiti] = await Promise.all([getSaldo(socio.id), getPremi(), getRecapiti(socio.id)]);
  // I soci fatti in negozio possono non avere questi dati: si chiede di completarli,
  // senza bloccare nulla.
  const datiMancanti = !recapiti.nascita || !recapiti.indirizzo || !recapiti.cap || !recapiti.citta;

  return (
    <>
      <PageHead eyebrow={`Socio dal ${new Date(socio.iscrittoDal).getFullYear()}`} titolo={socio.nome ? `Ciao ${socio.nome}` : "Ciao"} />

      <section className="section" aria-label="Saldo punti e tessera">
        <SaldoPunti saldo={saldo} premi={premi} />
        {socio.daUnire ? (
          <p className="notice">
            Risulta già una tessera fatta in negozio con il tuo cellulare. Alla prossima visita mostrala alla cassa insieme a questa
            app: uniamo le due tessere e qui trovi anche i punti che hai già. Fino ad allora in cassa usa la tessera che hai.
          </p>
        ) : socio.inAttivazione && (
          <p className="psc-hint">Tessera appena creata: la stiamo registrando nelle casse dei negozi, di solito in pochi minuti.</p>
        )}
        <ApriTessera socio={socio} />
      </section>

      {socio.attesaGenitore === "punti_offerte" && (
        <section className="section" aria-labelledby="genitore">
          <div className="installa">
            <h2 id="genitore" className="installa__titolo">Attiva punti e offerte</h2>
            <p className="installa__testo">
              La tua tessera funziona già. Per accumulare punti sugli acquisti e ricevere le offerte serve l&apos;ok di un genitore:
              mandagli il link e fagli approvare.
            </p>
            <LinkGenitore nome={socio.nome} />
          </div>
        </section>
      )}

      {datiMancanti && (
        <section className="section" aria-label="Completa i tuoi dati">
          <p className="notice">
            Mancano alcuni tuoi dati (data di nascita, indirizzo, CAP o città).{" "}
            <Link href="/profilo/dati">Completali ora</Link>
          </p>
        </section>
      )}

      <InstallaApp />

      <section className="section" aria-labelledby="invita">
        <div className="psc-referral">
          <span className="psc-referral__eyebrow">Invita un amico</span>
          <h2 id="invita" className="psc-referral__title">Porta un amico nel club</h2>
          <p className="psc-referral__text">Il programma inviti arriva con la prossima versione dell&apos;app.</p>
          <Link href="/profilo" className="psc-btn psc-btn--copy">Scopri di più</Link>
        </div>
      </section>
    </>
  );
}
