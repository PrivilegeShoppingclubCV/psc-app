import type { Metadata } from "next";
import Link from "next/link";
import { AuthPage, Campo } from "@/components/AuthPage";

export const metadata: Metadata = { title: "Accedi" };

export default function Accedi() {
  return (
    <AuthPage eyebrow="Accedi" titolo="Accedi al club" intro="Ti mandiamo un link via email: niente password da ricordare.">
      <form action="/home">
        <Campo id="email" label="Email" type="email" autoComplete="email" />
        <Link href="/home" className="psc-btn psc-btn--primary psc-btn--block">Continua</Link>
      </form>
    </AuthPage>
  );
}
