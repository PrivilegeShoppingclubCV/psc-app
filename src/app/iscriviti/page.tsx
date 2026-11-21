import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthPage, Campo, Spunta, oggi, param } from "@/components/AuthPage";
import { getSessione } from "@/lib/dati";
import { iscriviti } from "../accesso/azioni";
import { CampoData } from "@/components/CampoData";

export const metadata: Metadata = { title: "Iscriviti" };

export default async function Iscriviti({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const { configurato, email, socio } = await getSessione();
  if (configurato && socio) redirect("/home");
  const conAccesso = configurato && email !== null;

  return (
    <AuthPage eyebrow="Voglio iscrivermi" titolo="Entra nel club" intro="L'iscrizione è gratuita. Ricevi subito la tessera digitale e inizi ad accumulare punti." errore={param(q.errore)}>
      <form action={iscriviti}>
        <Campo id="nome" label="Nome" autoComplete="given-name" required={configurato} defaultValue={param(q.nome)} />
        <Campo id="cognome" label="Cognome" autoComplete="family-name" required={configurato} defaultValue={param(q.cognome)} />
        {!conAccesso && <Campo id="email" label="Email" type="email" autoComplete="email" required={configurato} defaultValue={param(q.email)} />}
        <Campo id="telefono" label="Cellulare" type="tel" autoComplete="tel" inputMode="tel" required={configurato} defaultValue={param(q.telefono)} />
        <CampoData id="nascita" label="Data di nascita" autoComplete="bday" max={oggi()} required={configurato} defaultValue={param(q.nascita)} help="Se hai meno di 18 anni, punti e offerte si attivano con l'ok di un genitore (sotto i 14 anni anche la tessera)." />
        <Campo id="indirizzo" label="Indirizzo" autoComplete="street-address" maxLength={120} required={configurato} defaultValue={param(q.indirizzo)} help="Via e numero civico." />
        <Campo id="cap" label="CAP" autoComplete="postal-code" inputMode="numeric" pattern="[0-9]{5}" maxLength={5} required={configurato} defaultValue={param(q.cap)} />
        <Campo id="citta" label="Città" autoComplete="address-level2" maxLength={80} required={configurato} defaultValue={param(q.citta)} />
        <Campo id="invito" label="Codice invito (facoltativo)" autoComplete="off" autoCapitalize="characters" defaultValue={param(q.invito)} help="Se un amico ti ha invitato, inserisci il suo codice." />
        <Spunta id="privacy" required={configurato}>Ho letto l&apos;informativa privacy (obbligatorio)</Spunta>
        <Spunta id="marketing">Voglio ricevere offerte e novità via email e notifica (facoltativo, puoi cambiare idea quando vuoi; per i minorenni decide un genitore)</Spunta>
        <button type="submit" className="psc-btn psc-btn--primary psc-btn--block">Continua</button>
      </form>
    </AuthPage>
  );
}
