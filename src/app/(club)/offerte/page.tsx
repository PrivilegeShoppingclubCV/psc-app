import type { Metadata } from "next";
import { PageHead } from "@/components/PageHead";
import { formatData, formatEuro } from "@/lib/format";
import { offerte } from "@/lib/mock-data";

export const metadata: Metadata = { title: "Offerte" };

export default function Offerte() {
  return (
    <>
      <PageHead eyebrow="Solo per i soci" titolo="Le offerte della settimana">
        <p className="t-caption">Prodotti di prova: foto e catalogo arriveranno dal gestionale.</p>
      </PageHead>
      <div className="grid-offerte">
        {offerte.map((o) => (
          <article key={o.id} className="psc-product">
            <div className="psc-product__media">
              <div className="media-placeholder"><span className="logo logo--crown" /></div>
              {o.soloTesserati && (
                <div className="psc-product__badges">
                  <span className="psc-badge psc-badge--member">Solo tesserati</span>
                </div>
              )}
            </div>
            <span className="psc-product__brand">{o.marca}</span>
            <h2 className="psc-product__name">{o.nome}</h2>
            <div className="psc-price">
              <span className="psc-price__member">{formatEuro(o.prezzoSoci)}</span>
              <span className="psc-price__list">{formatEuro(o.prezzoListino)}</span>
              <span className="psc-price__label">Fino al {formatData(o.scadenza)}</span>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
