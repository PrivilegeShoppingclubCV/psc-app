import { redirect } from "next/navigation";
import { AuthPage, Campo, Spunta, oggi, param } from "@/components/AuthPage";
import { getSessione } from "@/lib/dati";
import { iscriviti } from "../accesso/azioni";
import { CampoData } from "@/components/CampoData";
import { getTesti } from "@/lib/i18n";

export async function generateMetadata() {
  return { title: (await getTesti()).iscriviti.titoloPagina };
}

export default async function Iscriviti({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const { configurato, email, socio } = await getSessione();
  if (configurato && socio) redirect("/home");
  const conAccesso = configurato && email !== null;
  const t = await getTesti();
  const i = t.iscriviti;

  return (
    <AuthPage eyebrow={i.eyebrow} titolo={i.titolo} intro={i.intro} errore={param(q.errore)}>
      <form action={iscriviti}>
        <Campo id="nome" label={i.nome} autoComplete="given-name" required={configurato} defaultValue={param(q.nome)} />
        <Campo id="cognome" label={i.cognome} autoComplete="family-name" required={configurato} defaultValue={param(q.cognome)} />
        {!conAccesso && <Campo id="email" label={t.comune.email} type="email" dir="ltr" autoComplete="email" required={configurato} defaultValue={param(q.email)} />}
        <Campo id="telefono" label={i.cellulare} type="tel" dir="ltr" autoComplete="tel" inputMode="tel" required={configurato} defaultValue={param(q.telefono)} />
        <CampoData id="nascita" label={i.nascita} autoComplete="bday" max={oggi()} required={configurato} defaultValue={param(q.nascita)} help={i.nascitaAiuto} />
        <Campo id="indirizzo" label={i.indirizzo} autoComplete="street-address" maxLength={120} required={configurato} defaultValue={param(q.indirizzo)} help={i.indirizzoAiuto} />
        <Campo id="cap" label={i.cap} autoComplete="postal-code" inputMode="numeric" pattern="[0-9]{5}" maxLength={5} required={configurato} defaultValue={param(q.cap)} />
        <Campo id="citta" label={i.citta} autoComplete="address-level2" maxLength={80} required={configurato} defaultValue={param(q.citta)} />
        <Campo id="invito" label={i.invito} autoComplete="off" autoCapitalize="characters" defaultValue={param(q.invito)} help={i.invitoAiuto} />
        <Spunta id="privacy" required={configurato}>{i.privacy}</Spunta>
        <Spunta id="marketing">{i.marketing}</Spunta>
        <button type="submit" className="psc-btn psc-btn--primary psc-btn--block">{t.comune.continua}</button>
      </form>
    </AuthPage>
  );
}
