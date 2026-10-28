import type { Metadata } from "next";
import Link from "next/link";
import { param } from "@/components/AuthPage";
import { IconIndietro } from "@/components/Icons";
import { OffertaCard } from "@/components/OffertaCard";
import { PageHead } from "@/components/PageHead";
import { getCatalogo, getOfferte, PRODOTTI_PER_PAGINA } from "@/lib/dati";

export const metadata: Metadata = { title: "Tutte le offerte" };

export default async function TutteLeOfferte({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const cerca = param(q.q);
  const pagina = Math.max(1, Number(param(q.pagina)) || 1);
  // Le offerte dello staff si mostrano solo in cima alla prima pagina, e non quando si cerca.
  const [staff, { prodotti, totale }] = await Promise.all([
    pagina === 1 && !cerca ? getOfferte() : Promise.resolve([]),
    getCatalogo(pagina, cerca),
  ]);
  const pagine = Math.max(1, Math.ceil(totale / PRODOTTI_PER_PAGINA));
  const link = (p: number) => `/offerte/tutte?${new URLSearchParams({ ...(cerca ? { q: cerca } : {}), pagina: String(p) })}`;
  const offerte = [...staff, ...prodotti];

  return (
    <>
      <Link href="/offerte" className="back-link"><IconIndietro /> Offerte di oggi</Link>
      <PageHead eyebrow="Solo per i soci" titolo="Tutte le offerte" />

      <form action="/offerte/tutte" className="cerca-offerte" role="search">
        <label className="psc-field__label" htmlFor="q">Cerca un prodotto o una marca</label>
        <div className="cerca-offerte__riga">
          <input id="q" name="q" type="search" className="psc-field__input" defaultValue={cerca} />
          <button type="submit" className="psc-btn psc-btn--primary">Cerca</button>
        </div>
      </form>

      {offerte.length === 0 && <p className="t-caption">{cerca ? `Nessuna offerta per «${cerca}».` : "In questo momento non ci sono offerte."}</p>}
      <div className="grid-offerte">
        {offerte.map((o) => <OffertaCard key={`${o.tipo}-${o.id}`} o={o} />)}
      </div>

      {pagine > 1 && (
        <nav className="pagine" aria-label="Pagine">
          {pagina > 1 ? <Link href={link(pagina - 1)} className="psc-btn psc-btn--secondary">Indietro</Link> : <span />}
          <span className="t-caption">{pagina} di {pagine}</span>
          {pagina < pagine ? <Link href={link(pagina + 1)} className="psc-btn psc-btn--secondary">Avanti</Link> : <span />}
        </nav>
      )}
    </>
  );
}
