import type { Metadata } from "next";
import Link from "next/link";
import { InstallaApp } from "@/components/InstallaApp";
import { PageHead } from "@/components/PageHead";
import { SaldoPunti } from "@/components/SaldoPunti";
import { ApriTessera } from "@/components/TesseraFullscreen";
import { getPremi, getSaldo } from "@/lib/dati";
import { getSocio } from "@/lib/socio";

export const metadata: Metadata = { title: "Home" };

export default async function Home() {
  const socio = await getSocio();
  const [saldo, premi] = await Promise.all([getSaldo(socio.id), getPremi()]);

  return (
    <>
      <PageHead eyebrow={`Socio dal ${new Date(socio.iscrittoDal).getFullYear()}`} titolo={socio.nome ? `Ciao ${socio.nome}` : "Ciao"} />

      <section className="section" aria-label="Saldo punti e tessera">
        <SaldoPunti saldo={saldo} premi={premi} />
        {socio.inAttivazione && (
          <p className="psc-hint">Tessera appena creata: la stiamo registrando nelle casse dei negozi, di solito in pochi minuti.</p>
        )}
        <ApriTessera socio={socio} />
      </section>

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
