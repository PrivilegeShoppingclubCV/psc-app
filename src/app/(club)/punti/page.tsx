import type { Metadata } from "next";
import { PageHead } from "@/components/PageHead";
import { SaldoPunti } from "@/components/SaldoPunti";
import { formatData, formatPunti } from "@/lib/format";
import { movimenti, premi, saldoPunti } from "@/lib/mock-data";

export const metadata: Metadata = { title: "Punti" };

export default function Punti() {
  return (
    <>
      <PageHead eyebrow="1 punto ogni euro speso" titolo="I tuoi punti" />
      <section className="section">
        <SaldoPunti saldo={saldoPunti} />
      </section>

      <section className="section" aria-labelledby="premi">
        <h2 id="premi" className="t-title">Premi</h2>
        <ul className="list">
          {premi.map((p) => (
            <li key={p.id}>
              <span>{p.nome}</span>
              {saldoPunti >= p.soglia ? (
                <span className="psc-badge psc-badge--success">Disponibile</span>
              ) : (
                <span className="list__value">{formatPunti(p.soglia)} punti</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="section" aria-labelledby="movimenti">
        <h2 id="movimenti" className="t-title">Movimenti</h2>
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
      </section>
    </>
  );
}
