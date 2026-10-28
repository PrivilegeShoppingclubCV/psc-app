import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthPage, Campo, param } from "@/components/AuthPage";
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
      titolo="Apri il link nell'email"
      intro={<>Abbiamo mandato un link a <strong>{email}</strong>. Aprilo da questo telefono e sarai dentro. Se non lo trovi, guarda anche nello spam.</>}
      errore={errore}
      indietro={INDIETRO[dopo as keyof typeof INDIETRO] ?? "/accedi"}
    >
      <form action={accedi}>
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="dopo" value={dopo} />
        <button type="submit" className="psc-btn psc-btn--secondary psc-btn--block">Manda di nuovo l&apos;email</button>
      </form>

      {/* Il link si apre nel browser: chi usa l'app installata può digitare il codice, se l'email lo contiene. */}
      <details className="codice-alternativo" open={Boolean(errore)}>
        <summary>Nell&apos;email c&apos;è anche un codice?</summary>
        <form action={verifica}>
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="dopo" value={dopo} />
          <Campo id="codice" label="Codice" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={12} required />
          <button type="submit" className="psc-btn psc-btn--primary psc-btn--block">Conferma</button>
        </form>
      </details>
    </AuthPage>
  );
}
