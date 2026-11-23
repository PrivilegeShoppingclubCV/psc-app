import Link from "next/link";
import { PageHead } from "@/components/PageHead";
import { SaldoPunti } from "@/components/SaldoPunti";
import { getEuroPerPunto, getMovimenti, getPremi, getSaldo } from "@/lib/dati";
import { forma, getFormati, getTestiClub } from "@/lib/i18n";
import { getSocio } from "@/lib/socio";

export async function generateMetadata() {
  return { title: (await getTestiClub()).punti.titoloPagina };
}

export default async function Punti() {
  const socio = await getSocio();
  const [saldo, premi, movimenti, euroPerPunto] = await Promise.all([getSaldo(socio.id), getPremi(), getMovimenti(socio.id), getEuroPerPunto()]);
  const f = await getFormati();
  const t = (await getTestiClub()).punti;
  const regola = euroPerPunto === 1 ? t.regolaEuro : forma(t.regola, { euro: f.punti(euroPerPunto) });

  return (
    <>
      <PageHead eyebrow={regola} titolo={t.titolo} />
      <section className="section">
        <SaldoPunti saldo={saldo} premi={premi} />
      </section>

      {premi.length > 0 && (
        <section className="section" aria-labelledby="premi">
          <h2 id="premi" className="t-title">{t.premi}</h2>
          <ul className="list">
            {premi.map((p) => (
              <li key={p.id}>
                <span>{p.nome}</span>
                {saldo >= p.soglia ? (
                  <span className="psc-badge psc-badge--success">{t.disponibile}</span>
                ) : (
                  <span className="list__value">{forma(t.soglia, { punti: f.punti(p.soglia) })}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="section">
        <Link href="/punti/scontrini" className="psc-btn psc-btn--secondary psc-btn--block">{t.scontrini}</Link>
      </section>

      <section className="section" aria-labelledby="movimenti">
        <h2 id="movimenti" className="t-title">{t.movimenti}</h2>
        {movimenti.length === 0 ? (
          <p className="t-caption">{t.nessunMovimento}</p>
        ) : (
          <ul className="list">
            {movimenti.map((m) => (
              <li key={m.id}>
                <div className="list__main">
                  <span>{m.descrizione}</span>
                  <span className="t-caption">{f.data(m.data)}{m.negozio ? ` · ${m.negozio}` : ""}</span>
                </div>
                <span className={`list__value${m.punti > 0 ? " is-plus" : ""}`} dir="ltr">
                  {m.punti > 0 ? "+" : "−"}{f.punti(Math.abs(m.punti))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
