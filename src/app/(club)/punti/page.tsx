import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/PageHead";
import { SaldoPunti } from "@/components/SaldoPunti";
import { getEuroPerPunto, getMovimenti, getPremi, getSaldo } from "@/lib/dati";
import { formatData, formatPunti, formatRegolaPunti } from "@/lib/format";
import { getSocio } from "@/lib/socio";

export const metadata: Metadata = { title: "Punti" };

export default async function Punti() {
  const socio = await getSocio();
  const [saldo, premi, movimenti, euroPerPunto] = await Promise.all([getSaldo(socio.id), getPremi(), getMovimenti(socio.id), getEuroPerPunto()]);

  return (
    <>
      <PageHead eyebrow={formatRegolaPunti(euroPerPunto)} titolo="I tuoi punti" />
      <section className="section">
        <SaldoPunti saldo={saldo} premi={premi} />
      </section>

      {premi.length > 0 && (
        <section className="section" aria-labelledby="premi">
          <h2 id="premi" className="t-title">Premi</h2>
          <ul className="list">
            {premi.map((p) => (
              <li key={p.id}>
                <span>{p.nome}</span>
                {saldo >= p.soglia ? (
                  <span className="psc-badge psc-badge--success">Disponibile</span>
                ) : (
                  <span className="list__value">{formatPunti(p.soglia)} punti</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="section">
        <Link href="/punti/scontrini" className="psc-btn psc-btn--secondary psc-btn--block">I tuoi scontrini degli ultimi 30 giorni</Link>
      </section>

      <section className="section" aria-labelledby="movimenti">
        <h2 id="movimenti" className="t-title">Movimenti</h2>
        {movimenti.length === 0 ? (
          <p className="t-caption">Ancora nessun movimento: mostra la tessera in cassa al prossimo acquisto.</p>
        ) : (
          <ul className="list">
            {movimenti.map((m) => (
              <li key={m.id}>
                <div className="list__main">
                  <span>{m.descrizione}</span>
                  <span className="t-caption">{formatData(m.data)}{m.negozio ? ` · ${m.negozio}` : ""}</span>
                </div>
                <span className={`list__value${m.punti > 0 ? " is-plus" : ""}`}>
                  {m.punti > 0 ? "+" : "−"}{formatPunti(Math.abs(m.punti))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
