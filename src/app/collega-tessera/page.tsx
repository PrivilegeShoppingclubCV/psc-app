import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthPage, Campo, param } from "@/components/AuthPage";
import { getSessione } from "@/lib/dati";
import { collegaTessera } from "../accesso/azioni";

export const metadata: Metadata = { title: "Ho già la tessera" };

export default async function CollegaTessera({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const { configurato, email, socio } = await getSessione();
  if (configurato && socio) redirect("/home");
  // Accesso già fatto ma nessuna tessera collegata: basta il numero.
  const conAccesso = configurato && email !== null;

  return (
    <AuthPage
      eyebrow="Ho già la tessera"
      titolo="Collega la tua tessera"
      intro={conAccesso
        ? <>Inserisci il numero stampato sulla tessera. Deve essere quella registrata in negozio con <strong>{email}</strong>.</>
        : "Inserisci il numero stampato sulla tessera e l'email che hai lasciato in negozio."}
      errore={param(q.errore)}
    >
      <form action={collegaTessera}>
        <Campo id="tessera" label="Numero tessera" inputMode="numeric" autoComplete="off" placeholder="004718" required={configurato} defaultValue={param(q.tessera)} help="Lo trovi sul retro della tessera, sotto il codice a barre. Scrivi anche gli zeri iniziali." />
        {!conAccesso && <Campo id="email" label="Email" type="email" autoComplete="email" required={configurato} defaultValue={param(q.email)} />}
        <button type="submit" className="psc-btn psc-btn--primary psc-btn--block">Continua</button>
      </form>
      {conAccesso && (
        <>
          <Link href="/collega-tessera/negozio" className="psc-btn psc-btn--secondary">In negozio non ho lasciato questa email</Link>
          <Link href="/iscriviti" className="psc-btn psc-btn--ghost">Non hai la tessera? Iscriviti</Link>
        </>
      )}
    </AuthPage>
  );
}
