import Link from "next/link";
import { IconIndietro } from "@/components/Icons";
import { PageHead } from "@/components/PageHead";
import { getScontrini } from "@/lib/dati";
import { forma, getFormati, getTestiClub, ricco } from "@/lib/i18n";
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
                  <div className="scontrino__carta">
                    <p className="scontrino__testa">
                      <strong>Privilege Shopping Club</strong>
                      {s.negozio && <span>{s.negozio}</span>}
                      <span>{f.dataOra(s.data, t.dataOra)}</span>
                      <span>{forma(t.documento, { numero: s.numero })}</span>
                    </p>
                    {s.righe.length > 0 && (
                      <ul className="scontrino__righe">
                        {s.righe.map((r, i) => (
                          <li key={i}>
                            <span>{r.quantita && r.quantita !== 1 ? `${r.quantita} × ` : ""}{r.descrizione}</span>
                            <span>{f.euro(r.importo)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="scontrino__totale">
                      <span>{s.totale < 0 ? t.reso : t.totale}</span>
                      <span>{f.euro(s.totale)}</span>
                    </p>
                    <p className="scontrino__punti">
                      {s.punti === 0
                        ? t.nessunPunto
                        : ricco(t.punti, { punti: <bdi dir="ltr">{`${s.punti > 0 ? "+" : "−"}${f.punti(Math.abs(s.punti))}`}</bdi> })}
                    </p>
                    <p className="t-caption">{t.cortesia}</p>
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
