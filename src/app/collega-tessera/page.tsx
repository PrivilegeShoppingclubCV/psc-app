import type { Metadata } from "next";
import Link from "next/link";
import { AuthPage, Campo } from "@/components/AuthPage";

export const metadata: Metadata = { title: "Ho già la tessera" };

export default function CollegaTessera() {
  return (
    <AuthPage eyebrow="Ho già la tessera" titolo="Collega la tua tessera" intro="Inserisci il numero stampato sulla tessera e l'email che hai lasciato in negozio.">
      <form action="/home">
        <Campo id="tessera" label="Numero tessera" inputMode="numeric" autoComplete="off" placeholder="004718" help="Lo trovi sul retro della tessera, sotto il codice a barre." />
        <Campo id="email" label="Email" type="email" autoComplete="email" />
        <Link href="/home" className="psc-btn psc-btn--primary psc-btn--block">Continua</Link>
      </form>
    </AuthPage>
  );
}
