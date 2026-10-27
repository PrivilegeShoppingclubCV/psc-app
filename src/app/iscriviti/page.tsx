import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthPage, Campo, Spunta, param } from "@/components/AuthPage";
import { getSessione } from "@/lib/dati";
import { iscriviti } from "../accesso/azioni";

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
        <Campo id="invito" label="Codice invito (facoltativo)" autoComplete="off" autoCapitalize="characters" defaultValue={param(q.invito)} help="Se un amico ti ha invitato, inserisci il suo codice." />
        <Spunta id="privacy" required={configurato}>Ho letto l&apos;informativa privacy (obbligatorio)</Spunta>
        <Spunta id="marketing">Voglio ricevere offerte e novità via email e notifica (facoltativo, puoi cambiare idea quando vuoi)</Spunta>
        <button type="submit" className="psc-btn psc-btn--primary psc-btn--block">Continua</button>
      </form>
    </AuthPage>
  );
}
