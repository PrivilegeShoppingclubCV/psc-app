import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthPage, Campo, param } from "@/components/AuthPage";
import { getSessione } from "@/lib/dati";
import { accedi } from "../accesso/azioni";
import { getTesti } from "@/lib/i18n";

export async function generateMetadata() {
  return { title: (await getTesti()).accedi.titoloPagina };
}

export default async function Accedi({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const admin = param(q.dopo) === "admin";
  const { configurato, email, socio } = await getSessione();
  if (configurato && admin && email) redirect("/admin");
  if (configurato && socio && !admin) redirect("/home");

  const t = await getTesti();
  const a = t.accedi;
  return (
    <AuthPage
      eyebrow={admin ? a.eyebrowAdmin : a.eyebrow}
      titolo={admin ? a.titoloAdmin : a.titolo}
      intro={a.intro}
      errore={param(q.errore)}
      avvisoCodice={!admin}
    >
      <form action={accedi}>
        <input type="hidden" name="dopo" value={admin ? "admin" : "home"} />
        <Campo id="email" label={t.comune.email} type="email" dir="ltr" autoComplete="email" required={configurato} defaultValue={param(q.email)} />
        <button type="submit" className="psc-btn psc-btn--primary psc-btn--block">{t.comune.continua}</button>
      </form>
      {!admin && <Link href="/?registrati=1" className="psc-btn psc-btn--ghost">{t.benvenuto.registrati}</Link>}
    </AuthPage>
  );
}
