import type { Metadata } from "next";
import Link from "next/link";
import { param } from "@/components/AuthPage";
import { EsciButton } from "@/components/EsciButton";
import { PageHead } from "@/components/PageHead";
import { formatData, formatTessera } from "@/lib/format";
import { getRecapiti } from "@/lib/dati";
import { getSocio } from "@/lib/socio";

export const metadata: Metadata = { title: "Profilo" };

export default async function Profilo({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const socio = await getSocio();
  const r = await getRecapiti(socio.id);
  const nonIndicato = <span className="t-caption">Non indicato</span>;

  return (
    <>
      <PageHead eyebrow={`Livello ${socio.livello}`} titolo={`${socio.nome} ${socio.cognome}`.trim() || "Il tuo profilo"} />

      <section className="section" aria-labelledby="dati">
        <h2 id="dati" className="t-title">I tuoi dati</h2>
        {param(q.salvato) && <p className="notice notice--ok" role="status">Dati salvati. Arrivano alle casse dei negozi in pochi minuti.</p>}
        <ul className="list">
          <li><span className="t-caption">Email</span><span>{socio.email}</span></li>
          <li><span className="t-caption">Cellulare</span><span>{r.telefono || nonIndicato}</span></li>
          <li><span className="t-caption">Data di nascita</span><span>{r.nascita ? formatData(r.nascita) : nonIndicato}</span></li>
          <li><span className="t-caption">CAP e città</span><span>{[r.cap, r.citta].filter(Boolean).join(" ") || nonIndicato}</span></li>
          {socio.tessere.map((t) => (
            <li key={t.codice}>
              <span className="t-caption">Tessera {t.tipo}</span>
              <span className="psc-code">{formatTessera(t.codice)}{t.inAttivazione ? " · in attivazione" : ""}</span>
            </li>
          ))}
          <li><span className="t-caption">Socio dal</span><span>{formatData(socio.iscrittoDal)}</span></li>
        </ul>
        <Link href="/profilo/dati" className="psc-btn psc-btn--secondary psc-btn--block">Modifica i tuoi dati</Link>
      </section>

      <section className="section" aria-labelledby="invita">
        <div className="psc-referral">
          <span className="psc-referral__eyebrow">Invita un amico</span>
          <h2 id="invita" className="psc-referral__title">Il tuo codice invito</h2>
          <p className="psc-referral__text">Chi si iscrive con il tuo codice risulta invitato da te. I punti per gli inviti arrivano con la prossima versione.</p>
          <div className="psc-referral__code">
            <span className="psc-code">{socio.codiceInvito}</span>
          </div>
        </div>
      </section>

      <EsciButton />
    </>
  );
}
