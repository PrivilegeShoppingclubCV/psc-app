import Link from "next/link";
import { param } from "@/components/AuthPage";
import { EsciButton } from "@/components/EsciButton";
import { PageHead } from "@/components/PageHead";
import { formatTessera } from "@/lib/format";
import { SceltaLingua } from "@/components/SceltaLingua";
import { forma, getFormati, getLingua, getTestiClub } from "@/lib/i18n";
import { getRecapiti } from "@/lib/dati";
import { getSocio } from "@/lib/socio";

export async function generateMetadata() {
  return { title: (await getTestiClub()).profilo.titoloPagina };
}

export default async function Profilo({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const socio = await getSocio();
  const r = await getRecapiti(socio.id);
  const f = await getFormati();
  const lingua = await getLingua();
  const t = (await getTestiClub()).profilo;
  const nonIndicato = <span className="t-caption">{t.nonIndicato}</span>;

  return (
    <>
      <PageHead eyebrow={forma(t.livello, { livello: socio.livello })} titolo={`${socio.nome} ${socio.cognome}`.trim() || t.tuoProfilo} />

      <section className="section" aria-labelledby="dati">
        <h2 id="dati" className="t-title">{t.tuoiDati}</h2>
        {param(q.salvato) && <p className="notice notice--ok" role="status">{t.salvato}</p>}
        {param(q.segnalato) && <p className="notice notice--ok" role="status">{t.segnalato}</p>}
        <ul className="list">
          <li><span className="t-caption">{t.nome}</span><span>{socio.nome || nonIndicato}</span></li>
          <li><span className="t-caption">{t.cognome}</span><span>{socio.cognome || nonIndicato}</span></li>
          <li><span className="t-caption">{t.email}</span><span dir="ltr">{socio.email}</span></li>
          <li><span className="t-caption">{t.cellulare}</span><span dir="ltr">{r.telefono || nonIndicato}</span></li>
          <li><span className="t-caption">{t.nascita}</span><span>{r.nascita ? f.data(r.nascita) : nonIndicato}</span></li>
          <li><span className="t-caption">{t.indirizzo}</span><span>{r.indirizzo || nonIndicato}</span></li>
          <li><span className="t-caption">{t.capCitta}</span><span>{[r.cap, r.citta].filter(Boolean).join(" ") || nonIndicato}</span></li>
          {socio.tessere.map((c) => (
            <li key={c.codice}>
              <span className="t-caption">{c.tipo === "fisica" ? t.tesseraFisica : t.tesseraDigitale}</span>
              <span className="psc-code"><span dir="ltr">{formatTessera(c.codice)}</span>{c.inAttivazione ? ` · ${t.inAttivazione}` : ""}</span>
            </li>
          ))}
          <li><span className="t-caption">{t.socioDal}</span><span>{f.data(socio.iscrittoDal)}</span></li>
        </ul>
        <Link href="/profilo/dati" className="psc-btn psc-btn--secondary psc-btn--block">{t.modifica}</Link>
        <Link href="/profilo/segnala" className="psc-btn psc-btn--ghost psc-btn--block">{t.segnala}</Link>
      </section>

      <section className="section" aria-labelledby="invita">
        <div className="psc-referral">
          <span className="psc-referral__eyebrow">{t.invitaEyebrow}</span>
          <h2 id="invita" className="psc-referral__title">{t.codiceTitolo}</h2>
          <p className="psc-referral__text">{t.codiceTesto}</p>
          <div className="psc-referral__code">
            <span className="psc-code">{socio.codiceInvito}</span>
          </div>
        </div>
      </section>

      <section className="section profilo-lingua" aria-label={t.lingua}>
        <span className="t-caption">{t.lingua}</span>
        <SceltaLingua lingua={lingua} etichetta={t.lingua} />
      </section>

      <EsciButton />
    </>
  );
}
