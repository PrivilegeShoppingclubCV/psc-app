import Link from "next/link";
import { Campo, oggi, param } from "@/components/AuthPage";
import { IconIndietro } from "@/components/Icons";
import { PageHead } from "@/components/PageHead";
import { getRecapiti } from "@/lib/dati";
import { getSocio } from "@/lib/socio";
import { salvaRecapiti } from "../azioni";
import { CampoData } from "@/components/CampoData";
import { getTesti, getTestiClub, ricco } from "@/lib/i18n";

export async function generateMetadata() {
  return { title: (await getTestiClub()).dati.titoloPagina };
}

export default async function ModificaDati({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const socio = await getSocio();
  const r = await getRecapiti(socio.id);
  const errore = param(q.errore);
  const t = (await getTestiClub()).dati;
  const i = (await getTesti()).iscriviti;
  // Dopo un errore il modulo mostra quello che il socio aveva scritto.
  const valore = (k: "telefono" | "nascita" | "indirizzo" | "cap" | "citta") => (errore ? param(q[k]) : r[k]);

  return (
    <>
      <Link href="/profilo" className="back-link"><IconIndietro /> {t.eyebrow}</Link>
      <PageHead eyebrow={t.eyebrow} titolo={t.titolo}>
        <p className="t-body-l">{t.intro}</p>
      </PageHead>
      {errore && <p className="notice notice--errore" role="alert">{errore}</p>}

      <form action={salvaRecapiti} className="modulo">
        <Campo id="telefono" label={i.cellulare} type="tel" dir="ltr" autoComplete="tel" inputMode="tel" required defaultValue={valore("telefono")} />
        <CampoData id="nascita" label={i.nascita} autoComplete="bday" max={oggi()} required defaultValue={valore("nascita")} />
        <Campo id="indirizzo" label={i.indirizzo} autoComplete="street-address" maxLength={120} required defaultValue={valore("indirizzo")} help={i.indirizzoAiuto} />
        <Campo id="cap" label={i.cap} autoComplete="postal-code" inputMode="numeric" pattern="[0-9]{5}" maxLength={5} required defaultValue={valore("cap")} />
        <Campo id="citta" label={i.citta} autoComplete="address-level2" maxLength={80} required defaultValue={valore("citta")} />
        <p className="t-caption">{ricco(t.nonSiCambiano, { link: <Link href="/profilo/segnala">{t.segnalacelo}</Link> })}</p>
        <button type="submit" className="psc-btn psc-btn--primary psc-btn--block">{t.salva}</button>
      </form>
    </>
  );
}
