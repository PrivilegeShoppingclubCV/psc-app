import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthPage, Campo, param } from "@/components/AuthPage";
import { accedi, verifica } from "../accesso/azioni";

export const metadata: Metadata = { title: "Inserisci il codice" };

const INDIETRO = { collega: "/collega-tessera", iscriviti: "/iscriviti", home: "/accedi" } as const;

export default async function Verifica({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const email = param(q.email);
  const dopo = param(q.dopo);
  if (!email) redirect("/accedi");

  return (
    <AuthPage
      eyebrow="Controlla la posta"
      titolo="Inserisci il codice"
      intro={<>Abbiamo mandato un codice a <strong>{email}</strong>. Se non lo trovi, guarda anche nello spam.</>}
      errore={param(q.errore)}
      indietro={INDIETRO[dopo as keyof typeof INDIETRO] ?? "/accedi"}
    >
      <form action={verifica}>
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="dopo" value={dopo} />
        <Campo id="codice" label="Codice" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={12} required autoFocus />
        <button type="submit" className="psc-btn psc-btn--primary psc-btn--block">Conferma</button>
      </form>
      <form action={accedi}>
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="dopo" value={dopo} />
        <button type="submit" className="link-btn">Non è arrivato? Mandane un altro</button>
      </form>
    </AuthPage>
  );
}
