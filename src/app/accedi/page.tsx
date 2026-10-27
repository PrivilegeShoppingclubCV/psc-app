import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthPage, Campo, param } from "@/components/AuthPage";
import { getSessione } from "@/lib/dati";
import { accedi } from "../accesso/azioni";

export const metadata: Metadata = { title: "Accedi" };

export default async function Accedi({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const { configurato, socio } = await getSessione();
  if (configurato && socio) redirect("/home");

  return (
    <AuthPage eyebrow="Accedi" titolo="Accedi al club" intro="Ti mandiamo un link via email: niente password da ricordare." errore={param(q.errore)}>
      <form action={accedi}>
        <Campo id="email" label="Email" type="email" autoComplete="email" required={configurato} defaultValue={param(q.email)} />
        <button type="submit" className="psc-btn psc-btn--primary psc-btn--block">Continua</button>
      </form>
    </AuthPage>
  );
}
