import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthPage, Campo, param } from "@/components/AuthPage";
import { getSessione } from "@/lib/dati";
import { accedi } from "../accesso/azioni";

export const metadata: Metadata = { title: "Accedi" };

export default async function Accedi({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const admin = param(q.dopo) === "admin";
  const { configurato, email, socio } = await getSessione();
  if (configurato && admin && email) redirect("/admin");
  if (configurato && socio && !admin) redirect("/home");

  return (
    <AuthPage
      eyebrow={admin ? "Pannello admin" : "Accedi"}
      titolo={admin ? "Accedi al pannello" : "Accedi al club"}
      intro="Ti mandiamo un codice di 6 cifre via email: niente password da ricordare."
      errore={param(q.errore)}
    >
      <form action={accedi}>
        <input type="hidden" name="dopo" value={admin ? "admin" : "home"} />
        <Campo id="email" label="Email" type="email" autoComplete="email" required={configurato} defaultValue={param(q.email)} />
        <button type="submit" className="psc-btn psc-btn--primary psc-btn--block">Continua</button>
      </form>
      {!admin && <Link href="/?registrati=1" className="psc-btn psc-btn--ghost">Prima volta sull&apos;app? Registrati!</Link>}
    </AuthPage>
  );
}
