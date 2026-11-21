import type { Viewport } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BarraInstalla } from "@/components/InstallaApp";
import { param } from "@/components/AuthPage";
import { getSessione } from "@/lib/dati";

// La pagina di benvenuto è tutta verde: anche la barra in alto del telefono
// (ora, batteria) prende il verde invece del bianco del resto dell'app.
export const viewport: Viewport = { themeColor: "#113f2d" };

export default async function Benvenuto({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // Se l'indirizzo dell'app non è tra i Redirect URLs di Supabase, il link
  // dell'email riporta qui invece che su /auth/callback: lo si inoltra.
  const q = await searchParams;
  if (q.code || q.token_hash) {
    const inoltro = new URLSearchParams(Object.entries(q).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));
    redirect(`/auth/callback?${inoltro}`);
  }

  const { configurato, socio } = await getSessione();
  if (configurato && socio) redirect("/home");

  // "Registrati" apre la scelta tra le due strade. Ci si arriva anche da
  // "Accedi" con un'email che non ha ancora un account: la si porta con sé.
  const registrati = param(q.registrati) === "1";
  const email = param(q.email);
  const conEmail = email ? `?${new URLSearchParams({ email })}` : "";

  return (
    <main className="welcome">
      <BarraInstalla />
      <div className="welcome__brand">
        <span className="logo logo--lockup" role="img" aria-label="Privilege Shopping Club" />
        <p className="t-body-l">La tua tessera, i punti e le offerte riservate ai soci, sempre in tasca.</p>
      </div>
      {registrati ? (
        <div className="welcome__actions">
          {email ? (
            <p className="welcome__avviso" role="status">
              Non troviamo un account con <strong>{email}</strong>. Se è la prima volta che usi l&apos;app, registrati:
            </p>
          ) : (
            <p className="welcome__avviso">Hai già una tessera del club fatta in negozio?</p>
          )}
          <Link href={`/collega-tessera${conEmail}`} className="psc-btn psc-btn--primary psc-btn--block">Ho già la tessera</Link>
          <Link href={`/iscriviti${conEmail}`} className="psc-btn psc-btn--secondary psc-btn--block">Non ho una tessera</Link>
          <Link href="/" className="psc-btn psc-btn--ghost" scroll={false}>Indietro</Link>
        </div>
      ) : (
        <div className="welcome__actions">
          <Link href="/?registrati=1" className="psc-btn psc-btn--primary psc-btn--block" scroll={false}>Prima volta sull&apos;app? Registrati!</Link>
          <Link href="/accedi" className="psc-btn psc-btn--secondary psc-btn--block">Accedi</Link>
        </div>
      )}
    </main>
  );
}
