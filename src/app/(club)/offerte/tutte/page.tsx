import Link from "next/link";
import { param } from "@/components/AuthPage";
import { IconIndietro } from "@/components/Icons";
import { OffertaCard } from "@/components/OffertaCard";
import { PageHead } from "@/components/PageHead";
import { getCatalogo, getOfferte, PRODOTTI_PER_PAGINA } from "@/lib/dati";
import { forma, getTestiClub } from "@/lib/i18n";

export async function generateMetadata() {
  return { title: (await getTestiClub()).offerte.tutteTitolo };
}

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
  const t = (await getTestiClub()).offerte;

  return (
    <>
      <Link href="/offerte" className="back-link"><IconIndietro /> {t.indietro}</Link>
      <PageHead eyebrow={t.eyebrow} titolo={t.tutteTitolo} />

      <form action="/offerte/tutte" className="cerca-offerte" role="search">
        <label className="psc-field__label" htmlFor="q">{t.cerca}</label>
        <div className="cerca-offerte__riga">
          <input id="q" name="q" type="search" className="psc-field__input" defaultValue={cerca} />
          <button type="submit" className="psc-btn psc-btn--primary">{t.cercaTasto}</button>
        </div>
      </form>

      {offerte.length === 0 && <p className="t-caption">{cerca ? forma(t.nessunaPer, { cerca }) : t.nessunaOra}</p>}
      <div className="grid-offerte">
        {offerte.map((o) => <OffertaCard key={`${o.tipo}-${o.id}`} o={o} />)}
      </div>

      {pagine > 1 && (
        <nav className="pagine" aria-label={t.pagine}>
          {pagina > 1 ? <Link href={link(pagina - 1)} className="psc-btn psc-btn--secondary">{t.precedente}</Link> : <span />}
          <span className="t-caption">{forma(t.paginaDi, { pagina, pagine })}</span>
          {pagina < pagine ? <Link href={link(pagina + 1)} className="psc-btn psc-btn--secondary">{t.successiva}</Link> : <span />}
        </nav>
      )}
    </>
  );
}
