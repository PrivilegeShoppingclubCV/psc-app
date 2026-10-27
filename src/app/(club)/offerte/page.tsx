import type { Metadata } from "next";
import { PageHead } from "@/components/PageHead";
import { getOfferte } from "@/lib/dati";
import { formatData, formatEuro } from "@/lib/format";

export const metadata: Metadata = { title: "Offerte" };

export default async function Offerte() {
  const offerte = await getOfferte();

  return (
    <>
      <PageHead eyebrow="Solo per i soci" titolo="Le offerte della settimana" />
      {offerte.length === 0 && <p className="t-caption">In questo momento non ci sono offerte attive. Torna a trovarci presto.</p>}
      <div className="grid-offerte">
        {offerte.map((o) => (
          <article key={o.id} className="psc-product">
            <div className="psc-product__media">
              {o.immagineUrl ? (
                // Immagini dal bucket pubblico "offerte" di Supabase Storage.
                <img src={o.immagineUrl} alt="" loading="lazy" />
              ) : (
                <div className="media-placeholder"><span className="logo logo--crown" /></div>
              )}
              {o.soloTesserati && (
                <div className="psc-product__badges">
                  <span className="psc-badge psc-badge--member">Solo tesserati</span>
                </div>
              )}
            </div>
            {o.marca && <span className="psc-product__brand">{o.marca}</span>}
            <h2 className="psc-product__name">{o.nome}</h2>
            <div className="psc-price">
              {o.prezzoSoci !== null && <span className="psc-price__member">{formatEuro(o.prezzoSoci)}</span>}
              {o.prezzoListino !== null && <span className="psc-price__list">{formatEuro(o.prezzoListino)}</span>}
              {o.etichetta && <span className="psc-price__member">{o.etichetta}</span>}
              {o.scadenza && <span className="psc-price__label">Fino al {formatData(o.scadenza)}</span>}
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
