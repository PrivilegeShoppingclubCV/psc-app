import type { Offerta } from "@/lib/tipi";
import { formatData, formatEuro } from "@/lib/format";

/** Card di un'offerta: dello staff o un prodotto del magazzino. */
export function OffertaCard({ o }: { o: Offerta }) {
  const sconto = o.prezzoSoci !== null && o.prezzoListino ? Math.round((1 - o.prezzoSoci / o.prezzoListino) * 100) : 0;
  return (
    <article className="psc-product">
      <div className="psc-product__media">
        {o.immagineUrl ? (
          // Immagini dai bucket pubblici "offerte" e "prodotti" di Supabase Storage.
          <img src={o.immagineUrl} alt="" loading="lazy" />
        ) : (
          <div className="media-placeholder"><span className="logo logo--crown" /></div>
        )}
        {(o.soloTesserati || sconto > 0) && (
          <div className="psc-product__badges">
            {o.soloTesserati && <span className="psc-badge psc-badge--member">Solo tesserati</span>}
            {sconto > 0 && <span className="psc-badge psc-badge--discount">-{sconto}%</span>}
          </div>
        )}
      </div>
      {o.marca && <span className="psc-product__brand">{o.marca}</span>}
      <h2 className="psc-product__name">{o.nome}</h2>
      {o.dettaglio && <span className="t-caption">{o.dettaglio}</span>}
      <div className="psc-price">
        {o.prezzoSoci !== null && <span className="psc-price__member">{formatEuro(o.prezzoSoci)}</span>}
        {o.prezzoListino !== null && <span className="psc-price__list">{formatEuro(o.prezzoListino)}</span>}
        {o.etichetta && <span className="psc-price__member">{o.etichetta}</span>}
        {o.scadenza && <span className="psc-price__label">Fino al {formatData(o.scadenza)}</span>}
      </div>
    </article>
  );
}
