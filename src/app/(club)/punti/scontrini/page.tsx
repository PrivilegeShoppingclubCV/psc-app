import type { Metadata } from "next";
import Link from "next/link";
import { IconIndietro } from "@/components/Icons";
import { PageHead } from "@/components/PageHead";
import { getScontrini } from "@/lib/dati";
import { formatData, formatDataOra, formatEuro, formatPunti } from "@/lib/format";
import { getSocio } from "@/lib/socio";

export const metadata: Metadata = { title: "I tuoi scontrini" };

export default async function Scontrini() {
  const socio = await getSocio();
  const scontrini = await getScontrini(socio.id);

  return (
    <>
      <Link href="/punti" className="back-link"><IconIndietro /> Punti</Link>
      <PageHead eyebrow="Ultimi 30 giorni" titolo="I tuoi scontrini">
        <p className="t-body-l">Gli acquisti fatti mostrando la tessera in cassa. Dopo 30 giorni lo scontrino sparisce da qui, i punti restano.</p>
      </PageHead>

      <section className="section">
        {scontrini.length === 0 ? (
          <p className="t-caption">Nessuno scontrino negli ultimi 30 giorni: mostra la tessera in cassa al prossimo acquisto.</p>
        ) : (
          <ul className="scontrini">
            {scontrini.map((s) => (
              <li key={s.id}>
                <details className="scontrino">
                  <summary>
                    <span className="list__main">
                      <span>{s.negozio ?? "Acquisto in negozio"}</span>
                      <span className="t-caption">{formatData(s.data)}</span>
                    </span>
                    <span className="list__value">{formatEuro(s.totale)}</span>
                  </summary>
                  <div className="scontrino__carta">
                    <p className="scontrino__testa">
                      <strong>Privilege Shopping Club</strong>
                      {s.negozio && <span>{s.negozio}</span>}
                      <span>{formatDataOra(s.data)}</span>
                      <span>Documento n. {s.numero}</span>
                    </p>
                    {s.righe.length > 0 && (
                      <ul className="scontrino__righe">
                        {s.righe.map((r, i) => (
                          <li key={i}>
                            <span>{r.quantita && r.quantita !== 1 ? `${r.quantita} × ` : ""}{r.descrizione}</span>
                            <span>{formatEuro(r.importo)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="scontrino__totale">
                      <span>{s.totale < 0 ? "Reso" : "Totale"}</span>
                      <span>{formatEuro(s.totale)}</span>
                    </p>
                    <p className="scontrino__punti">
                      {s.punti === 0
                        ? "Nessun punto su questo scontrino"
                        : `${s.punti > 0 ? "+" : "−"}${formatPunti(Math.abs(s.punti))} punti`}
                    </p>
                    <p className="t-caption">Copia di cortesia, non vale come documento fiscale.</p>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
