import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/PageHead";
import { SaldoPunti } from "@/components/SaldoPunti";
import { ApriTessera } from "@/components/TesseraFullscreen";
import { saldoPunti, socio } from "@/lib/mock-data";

export const metadata: Metadata = { title: "Home" };

export default function Home() {
  return (
    <>
      <PageHead eyebrow="Socio dal 2024" titolo={`Ciao ${socio.nome}`} />

      <section className="section" aria-label="Saldo punti e tessera">
        <SaldoPunti saldo={saldoPunti} />
        <ApriTessera socio={socio} />
      </section>

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
