import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthPage, Campo, param } from "@/components/AuthPage";
import { CampoTessera } from "@/components/CampoTessera";
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
        ? <>Inserisci il numero stampato sulla tessera. Deve essere quella registrata in negozio con <strong>{email}</strong>. Se in negozio non hai lasciato un&apos;email, o ne hai lasciata un&apos;altra, tocca il pulsante qui sotto: alla cassa colleghiamo la tessera e aggiorniamo la tua email.</>
        : "Inserisci il numero stampato sulla tessera e l'email che hai lasciato in negozio."}
      errore={param(q.errore)}
    >
      <form action={collegaTessera}>
        <CampoTessera id="tessera" label="Numero tessera" required={configurato} defaultValue={param(q.tessera)} help="Lo trovi sul retro della tessera, sotto il codice a barre. Puoi scriverlo con o senza gli zeri iniziali (es. 4169): il numero completo compare qui sopra. Oppure scansionalo con la fotocamera." />
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
