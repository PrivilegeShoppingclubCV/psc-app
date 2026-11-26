"use client";

import { useEffect, useRef, useState } from "react";
import type { Offerta } from "@/lib/tipi";
import { FotoOfferta } from "./FotoOfferta";
import { IconChiudi, IconPunti } from "./Icons";

/** Testi già tradotti e valori già formattati dalla pagina (server). */
export interface TestiScheda {
  soloTesserati: string;
  apri: string;
  chiudi: string;
  prezzoTesserati: string;
  prezzoCartellino: string;
  sconto: string;
  risparmi: string | null;
  extraTitolo: string;
  puntiExtra: string | null;
  inCassa: string;
}

export interface ValoriScheda {
  soci: string | null;
  listino: string | null;
  /** Percentuale di sconto, 0 se non c'è. */
  sconto: number;
  fino: string | null;
}

/**
 * Card di un'offerta: toccandola si apre la scheda del prodotto, con i prezzi,
 * lo sconto e gli eventuali extra. Nella scheda, toccando la foto si ingrandisce.
 * La scheda si chiude con la X, toccando fuori, con Esc o con il tasto indietro.
 */
export function SchedaOfferta({ o, v, t }: { o: Offerta; v: ValoriScheda; t: TestiScheda }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const inCronologia = useRef(false);
  const [aperta, setAperta] = useState(false);
  const [fotoRotta, setFotoRotta] = useState(false);
  const extra = Boolean(t.puntiExtra || o.notaExtra);

  const apri = () => {
    setAperta(true);
    dialog.current?.showModal();
    // Una voce nella cronologia: il tasto indietro chiude la scheda invece di cambiare pagina.
    window.history.pushState({ ...(window.history.state ?? {}), pscScheda: true }, "");
    inCronologia.current = true;
  };

  const chiudi = () => dialog.current?.close();

  const allaChiusura = (e: React.SyntheticEvent<HTMLDialogElement>) => {
    // Anche la chiusura della foto ingrandita (dentro la scheda) arriva qui: si ignora.
    if (e.target !== dialog.current) return;
    setAperta(false);
    if (inCronologia.current) {
      inCronologia.current = false;
      window.history.back();
    }
  };

  useEffect(() => {
    const indietro = () => {
      // Tornando indietro dalla foto ingrandita si resta sulla scheda.
      if (!inCronologia.current || window.history.state?.pscScheda) return;
      inCronologia.current = false;
      dialog.current?.close();
    };
    window.addEventListener("popstate", indietro);
    return () => window.removeEventListener("popstate", indietro);
  }, []);

  const segnaposto = <div className="media-placeholder"><span className="logo logo--crown" /></div>;
  const bollini = (o.soloTesserati || v.sconto > 0) && (
    <div className="psc-product__badges">
      {o.soloTesserati && <span className="psc-badge psc-badge--member">{t.soloTesserati}</span>}
      {v.sconto > 0 && <span className="psc-badge psc-badge--discount">-{v.sconto}%</span>}
    </div>
  );

  return (
    <article className="psc-product psc-product--apribile">
      <div className="psc-product__media">
        {o.immagineUrl && !fotoRotta
          ? <img src={o.immagineUrl} alt="" loading="lazy" onError={() => setFotoRotta(true)} />
          : segnaposto}
        {bollini}
      </div>
      {o.marca && <span className="psc-product__brand">{o.marca}</span>}
      <h2 className="psc-product__name">{o.nome}</h2>
      {o.dettaglio && <span className="t-caption">{o.dettaglio}</span>}
      <div className="psc-price">
        {v.soci && <span className="psc-price__member">{v.soci}</span>}
        {v.listino && <span className="psc-price__list">{v.listino}</span>}
        {o.etichetta && <span className="psc-price__member">{o.etichetta}</span>}
        {v.fino && <span className="psc-price__label">{v.fino}</span>}
      </div>
      {extra && <span className="scheda-card-extra"><IconPunti /> {t.extraTitolo}</span>}
      {/* Tutta la card si tocca: il tasto la copre senza cambiare l'impaginazione. */}
      <button type="button" className="psc-product__apri" onClick={apri} aria-label={t.apri} />

      <dialog
        ref={dialog}
        className="scheda-offerta"
        aria-label={o.nome}
        onClose={allaChiusura}
        // Un tocco sullo sfondo, fuori dalla scheda, la chiude.
        onClick={(e) => { if (e.target === dialog.current) chiudi(); }}
      >
        <div className="scheda-offerta__corpo">
          <button type="button" className="icon-btn scheda-offerta__chiudi" aria-label={t.chiudi} onClick={chiudi}>
            <IconChiudi />
          </button>

          <div className="scheda-offerta__media">
            {aperta && o.immagineUrl && !fotoRotta ? <FotoOfferta src={o.immagineUrl} nome={o.nome} contenuta /> : segnaposto}
            {bollini}
          </div>

          <div className="scheda-offerta__testi">
            {o.marca && <span className="psc-product__brand">{o.marca}</span>}
            <h2 className="t-title scheda-offerta__nome">{o.nome}</h2>
            {o.dettaglio && <span className="t-caption">{o.dettaglio}</span>}
          </div>

          <dl className="scheda-prezzi">
            {v.soci && (
              <div className="scheda-prezzi__riga scheda-prezzi__riga--soci">
                <dt>{t.prezzoTesserati}</dt>
                <dd className="psc-price__member">{v.soci}</dd>
              </div>
            )}
            {v.listino && (
              <div className="scheda-prezzi__riga">
                <dt>{t.prezzoCartellino}</dt>
                <dd className="psc-price__list">{v.listino}</dd>
              </div>
            )}
            {v.sconto > 0 && (
              <div className="scheda-prezzi__riga">
                <dt>{t.sconto}</dt>
                <dd><strong>-{v.sconto}%</strong>{t.risparmi && <span className="t-caption"> · {t.risparmi}</span>}</dd>
              </div>
            )}
            {o.etichetta && (
              <div className="scheda-prezzi__riga scheda-prezzi__riga--soci">
                <dt className="sr-only">{t.sconto}</dt>
                <dd className="psc-price__member">{o.etichetta}</dd>
              </div>
            )}
          </dl>
          {v.fino && <p className="t-caption">{v.fino}</p>}

          {extra && (
            <section className="scheda-extra">
              <h3 className="scheda-extra__titolo"><IconPunti /> {t.extraTitolo}</h3>
              {t.puntiExtra && <p className="scheda-extra__punti">{t.puntiExtra}</p>}
              {o.notaExtra && <p>{o.notaExtra}</p>}
            </section>
          )}

          {o.descrizione && <p className="scheda-offerta__descrizione">{o.descrizione}</p>}

          <p className="t-caption scheda-offerta__cassa">{t.inCassa}</p>
        </div>
      </dialog>
    </article>
  );
}
