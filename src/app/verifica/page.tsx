import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthPage, param } from "@/components/AuthPage";
import { CampoCodice } from "@/components/CampoCodice";
import { accedi, verifica } from "../accesso/azioni";

export const metadata: Metadata = { title: "Controlla la posta" };

const INDIETRO = { collega: "/collega-tessera", iscriviti: "/iscriviti", home: "/accedi", admin: "/accedi?dopo=admin" } as const;

export default async function Verifica({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const email = param(q.email);
  const dopo = param(q.dopo);
  const errore = param(q.errore);
  if (!email) redirect("/accedi");

  return (
    <AuthPage
      eyebrow="Controlla la posta"
      titolo="Scrivi il codice"
      intro={<>Abbiamo mandato un codice di 6 cifre a <strong>{email}</strong>. Scrivilo qui sotto. Se non trovi l&apos;email, guarda anche nello spam.</>}
      errore={errore}
      indietro={INDIETRO[dopo as keyof typeof INDIETRO] ?? "/accedi"}
    >
      <form action={verifica}>
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="dopo" value={dopo} />
        <CampoCodice />
        <button type="submit" className="psc-btn psc-btn--primary psc-btn--block">Entra</button>
      </form>

      <form action={accedi}>
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="dopo" value={dopo} />
        <button type="submit" className="psc-btn psc-btn--ghost psc-btn--block">Non è arrivato? Mandalo di nuovo</button>
      </form>
    </AuthPage>
  );
}
