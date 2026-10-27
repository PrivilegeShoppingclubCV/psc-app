import type { Metadata } from "next";
import Link from "next/link";
import { AuthPage, Campo } from "@/components/AuthPage";

export const metadata: Metadata = { title: "Iscriviti" };

export default function Iscriviti() {
  return (
    <AuthPage eyebrow="Voglio iscrivermi" titolo="Entra nel club" intro="L'iscrizione è gratuita. Ricevi subito la tessera digitale e inizi ad accumulare punti.">
      <form action="/home">
        <Campo id="nome" label="Nome" autoComplete="given-name" />
        <Campo id="cognome" label="Cognome" autoComplete="family-name" />
        <Campo id="email" label="Email" type="email" autoComplete="email" />
        <Campo id="invito" label="Codice invito (facoltativo)" autoComplete="off" help="Se un amico ti ha invitato, inserisci il suo codice." />
        <Link href="/home" className="psc-btn psc-btn--primary psc-btn--block">Continua</Link>
      </form>
    </AuthPage>
  );
}
