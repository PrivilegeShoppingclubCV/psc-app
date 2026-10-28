import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessione } from "@/lib/dati";

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

  return (
    <main className="welcome">
      <div className="welcome__brand">
        <span className="logo logo--lockup" role="img" aria-label="Privilege Shopping Club" />
        <p className="t-body-l">La tua tessera, i punti e le offerte riservate ai soci, sempre in tasca.</p>
      </div>
      <div className="welcome__actions">
        <Link href="/collega-tessera" className="psc-btn psc-btn--primary psc-btn--block">Ho già la tessera</Link>
        <Link href="/iscriviti" className="psc-btn psc-btn--secondary psc-btn--block">Voglio iscrivermi</Link>
        <Link href="/accedi" className="psc-btn psc-btn--ghost">Accedi</Link>
      </div>
    </main>
  );
}
