import Link from "next/link";
import { OffertaCard } from "@/components/OffertaCard";
import { PageHead } from "@/components/PageHead";
import { getVetrina } from "@/lib/dati";
import { getTestiClub } from "@/lib/i18n";

export async function generateMetadata() {
  return { title: (await getTestiClub()).offerte.titoloPagina };
}

export default async function Offerte() {
  const offerte = await getVetrina();
  const t = (await getTestiClub()).offerte;

  return (
    <>
      <PageHead eyebrow={t.eyebrow} titolo={t.titolo} />
      {offerte.length === 0 && <p className="t-caption">{t.nessuna}</p>}
      <div className="grid-offerte">
        {offerte.map((o) => <OffertaCard key={`${o.tipo}-${o.id}`} o={o} />)}
      </div>
      <Link href="/offerte/tutte" className="psc-btn psc-btn--secondary psc-btn--block">{t.vediTutte}</Link>
    </>
  );
}
