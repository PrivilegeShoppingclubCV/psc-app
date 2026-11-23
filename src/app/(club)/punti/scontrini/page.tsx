import Link from "next/link";
import { IconIndietro } from "@/components/Icons";
import { PageHead } from "@/components/PageHead";
import { getScontrini } from "@/lib/dati";
import { CartaScontrino } from "@/components/CartaScontrino";
import { getFormati, getTestiClub } from "@/lib/i18n";
import { getSocio } from "@/lib/socio";

export async function generateMetadata() {
  return { title: (await getTestiClub()).scontrini.titoloPagina };
}

export default async function Scontrini() {
  const socio = await getSocio();
  const scontrini = await getScontrini(socio.id);
  const f = await getFormati();
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
          <ul className="scontrini">
            {scontrini.map((s) => (
              <li key={s.id}>
                <details className="scontrino">
                  <summary>
                    <span className="list__main">
                      <span>{s.negozio ?? t.acquisto}</span>
                      <span className="t-caption">{f.data(s.data)}</span>
                    </span>
                    <span className="list__value">{f.euro(s.totale)}</span>
                  </summary>
                  <CartaScontrino s={s} f={f} t={t} />
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
