import type { Metadata } from "next";
import Link from "next/link";
import { OffertaCard } from "@/components/OffertaCard";
import { PageHead } from "@/components/PageHead";
import { getVetrina } from "@/lib/dati";

export const metadata: Metadata = { title: "Offerte" };

export default async function Offerte() {
  const offerte = await getVetrina();

  return (
    <>
      <PageHead eyebrow="Solo per i soci" titolo="Le offerte di oggi" />
      {offerte.length === 0 && <p className="t-caption">In questo momento non ci sono offerte attive. Torna a trovarci presto.</p>}
      <div className="grid-offerte">
        {offerte.map((o) => <OffertaCard key={`${o.tipo}-${o.id}`} o={o} />)}
      </div>
      <Link href="/offerte/tutte" className="psc-btn psc-btn--secondary psc-btn--block">Vedi tutte le offerte</Link>
    </>
  );
}
