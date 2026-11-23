import Link from "next/link";
import { notFound } from "next/navigation";
import { param } from "@/components/AuthPage";
import { Barcode } from "@/components/Barcode";
import { IconIndietro } from "@/components/Icons";
import { PageHead } from "@/components/PageHead";
import { getBuono } from "@/lib/dati";
import { forma, getFormati, getTestiClub } from "@/lib/i18n";
import { getSocio } from "@/lib/socio";
import { codiceBuono } from "@/lib/tipi";
import { annullaBuono } from "../../azioni";

export async function generateMetadata() {
  return { title: (await getTestiClub()).buono.titoloPagina };
}

export default async function BuonoPremio({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, q] = await Promise.all([params, searchParams]);
  const socio = await getSocio();
  const buono = await getBuono(socio.id, id);
  if (!buono) notFound();
  const f = await getFormati();
  const t = (await getTestiClub()).buono;
  const scaduto = buono.stato === "scaduto" || (buono.stato === "attivo" && new Date(buono.scadeIl) < new Date());
  const attivo = buono.stato === "attivo" && !scaduto;
  const errore = param(q.errore);

  return (
    <>
      <Link href="/punti" className="back-link"><IconIndietro /> {t.indietro}</Link>
      <PageHead eyebrow={t.eyebrow} titolo={buono.premio} />
      {errore && <p className="notice notice--errore" role="alert">{errore}</p>}

      <section className="section">
        <div className={`buono${attivo ? "" : " buono--chiuso"}`}>
          {attivo && (
            <div className="psc-barcode-box">
              <Barcode value={buono.codice} label={forma(t.barcode, { codice: codiceBuono(buono.codice) })} />
            </div>
          )}
          <p className="buono__codice" dir="ltr">{codiceBuono(buono.codice)}</p>
          {attivo && <p className="t-body-l">{t.mostra}</p>}
          <p className="t-caption">
            {buono.stato === "usato" && buono.usatoIl ? forma(t.usatoIl, { data: f.data(buono.usatoIl) })
              : buono.stato === "annullato" ? t.annullato
              : scaduto ? t.scaduto
              : forma(t.validoFino, { data: f.data(buono.scadeIl) })}
          </p>
          <p className="t-caption" dir="auto">{forma(t.puntiUsati, { punti: f.punti(buono.punti) })}</p>
        </div>
      </section>

      {attivo && (
        <form action={annullaBuono} className="section">
          <input type="hidden" name="id" value={buono.id} />
          <button type="submit" className="psc-btn psc-btn--ghost psc-btn--block">{t.annulla}</button>
        </form>
      )}
    </>
  );
}
