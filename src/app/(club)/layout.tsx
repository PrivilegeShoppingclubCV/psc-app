import Link from "next/link";
import { TastoInstalla } from "@/components/InstallaApp";
import { TabBar } from "@/components/TabBar";
import { PulisciBozza } from "@/components/RiprendiIscrizione";
import { getSocio } from "@/lib/socio";
import { direzione, getLingua, getTestiClub, testiClient } from "@/lib/i18n";
import { TestiProvider } from "@/lib/i18n/client";

export default async function ClubLayout({ children }: { children: React.ReactNode }) {
  const socio = await getSocio();
  const lingua = await getLingua();
  const t = await getTestiClub();

  return (
    <TestiProvider testi={testiClient(lingua)}>
      <PulisciBozza />
      <div className="app" lang={lingua} dir={direzione(lingua)}>
        <header className="app-header">
          <Link href="/home" aria-label={t.vaiHome}>
            <span className="logo logo--lockup" />
          </Link>
          <div className="app-header__azioni">
            <TastoInstalla />
            <span className="psc-badge psc-badge--gold">{socio.livello}</span>
          </div>
        </header>
        <main className="app-main">{children}</main>
      </div>
      <div lang={lingua} dir={direzione(lingua)}>
        <TabBar />
      </div>
    </TestiProvider>
  );
}
