import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthPage, Campo, param } from "@/components/AuthPage";
import { CampoTessera } from "@/components/CampoTessera";
import { getSessione } from "@/lib/dati";
import { collegaTessera } from "../accesso/azioni";
import { getTesti, ricco } from "@/lib/i18n";

export async function generateMetadata() {
  return { title: (await getTesti()).collega.titoloPagina };
}

export default async function CollegaTessera({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const { configurato, email, socio } = await getSessione();
  if (configurato && socio) redirect("/home");
  // Accesso già fatto ma nessuna tessera collegata: basta il numero.
  const conAccesso = configurato && email !== null;
  const t = await getTesti();
  const c = t.collega;

  return (
    <AuthPage
      eyebrow={c.eyebrow}
      titolo={c.titolo}
      intro={conAccesso
        ? ricco(c.introConAccesso, { email: <strong dir="ltr">{email}</strong> })
        : c.intro}
      errore={param(q.errore)}
    >
      <form action={collegaTessera}>
        <CampoTessera id="tessera" label={c.numero} required={configurato} defaultValue={param(q.tessera)} help={c.numeroAiuto} />
        {!conAccesso && <Campo id="email" label={t.comune.email} type="email" dir="ltr" autoComplete="email" required={configurato} defaultValue={param(q.email)} />}
        <button type="submit" className="psc-btn psc-btn--primary psc-btn--block">{t.comune.continua}</button>
      </form>
      {conAccesso && (
        <>
          <Link href="/collega-tessera/negozio" className="psc-btn psc-btn--secondary">{c.altraEmail}</Link>
          <Link href="/iscriviti" className="psc-btn psc-btn--ghost">{c.nonHaiTessera}</Link>
        </>
      )}
    </AuthPage>
  );
}
