import type { Offerta } from "@/lib/tipi";
import { forma, getFormati, getTestiClub } from "@/lib/i18n";
import { FotoOfferta } from "./FotoOfferta";

/** Card di un'offerta: dello staff o un prodotto del magazzino. */
export async function OffertaCard({ o }: { o: Offerta }) {
  const f = await getFormati();
  const t = (await getTestiClub()).offerte;
  const sconto = o.prezzoSoci !== null && o.prezzoListino ? Math.round((1 - o.prezzoSoci / o.prezzoListino) * 100) : 0;
  return (
    <article className="psc-product">
      <div className="psc-product__media">
        {o.immagineUrl ? (
          // Immagini da Supabase Storage o da link esterni: toccandole si aprono in grande.
          <FotoOfferta src={o.immagineUrl} nome={o.nome} />
        ) : (
          <div className="media-placeholder"><span className="logo logo--crown" /></div>
        )}
        {(o.soloTesserati || sconto > 0) && (
          <div className="psc-product__badges">
            {o.soloTesserati && <span className="psc-badge psc-badge--member">{t.soloTesserati}</span>}
            {sconto > 0 && <span className="psc-badge psc-badge--discount">-{sconto}%</span>}
          </div>
        )}
      </div>
      {o.marca && <span className="psc-product__brand">{o.marca}</span>}
      <h2 className="psc-product__name">{o.nome}</h2>
      {o.dettaglio && <span className="t-caption">{o.dettaglio}</span>}
      <div className="psc-price">
        {o.prezzoSoci !== null && <span className="psc-price__member">{f.euro(o.prezzoSoci)}</span>}
        {o.prezzoListino !== null && <span className="psc-price__list">{f.euro(o.prezzoListino)}</span>}
        {o.etichetta && <span className="psc-price__member">{o.etichetta}</span>}
        {o.scadenza && <span className="psc-price__label">{forma(t.finoAl, { data: f.data(o.scadenza) })}</span>}
      </div>
    </article>
  );
}
