import Link from "next/link";
import { IconIndietro } from "@/components/Icons";
import { PageHead } from "@/components/PageHead";
import { getScontrini } from "@/lib/dati";
import { getLingua, getTestiClub } from "@/lib/i18n";
import { getSocio } from "@/lib/socio";
import { ElencoScontrini } from "./ElencoScontrini";

export async function generateMetadata() {
  return { title: (await getTestiClub()).scontrini.titoloPagina };
}

export default async function Scontrini() {
  const socio = await getSocio();
  const { scontrini, altri } = await getScontrini(socio.id);
  const lingua = await getLingua();
  const t = (await getTestiClub()).scontrini;

  return (
    <>
      <Link href="/punti" className="back-link"><IconIndietro /> {t.indietro}</Link>
      <PageHead eyebrow={t.eyebrow} titolo={t.titolo}>
        <p className="t-body-l">{t.intro}</p>
      </PageHead>

      <section className="section">
        {scontrini.length === 0 ? (
          <p className="t-caption">{t.nessuno}</p>
        ) : (
          <ElencoScontrini iniziali={scontrini} altriIniziali={altri} lingua={lingua} t={t} />
        )}
      </section>
    </>
  );
}
