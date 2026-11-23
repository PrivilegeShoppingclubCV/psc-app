import type { Viewport } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BarraInstalla } from "@/components/InstallaApp";
import { param } from "@/components/AuthPage";
import { getSessione } from "@/lib/dati";
import { SceltaLingua } from "@/components/SceltaLingua";
import { direzione, getLingua, getTesti, ricco } from "@/lib/i18n";
import { TestiProvider } from "@/lib/i18n/client";

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
  const lingua = await getLingua();
  const t = await getTesti();
  const b = t.benvenuto;

  return (
    <main className="welcome" lang={lingua} dir={direzione(lingua)}>
      <TestiProvider testi={t.client}>
      <BarraInstalla />
      <div className="welcome__brand">
        <span className="logo logo--lockup" role="img" aria-label="Privilege Shopping Club" />
        <p className="t-body-l">{b.slogan}</p>
      </div>
      {registrati ? (
        <div className="welcome__actions">
          {email ? (
            <p className="welcome__avviso" role="status">
              {ricco(b.nessunAccount, { email: <strong dir="ltr">{email}</strong> })}
            </p>
          ) : (
            <p className="welcome__avviso">{b.haiTessera}</p>
          )}
          <Link href={`/collega-tessera${conEmail}`} className="psc-btn psc-btn--primary psc-btn--block">{b.hoTessera}</Link>
          <Link href={`/iscriviti${conEmail}`} className="psc-btn psc-btn--secondary psc-btn--block">{b.nonHoTessera}</Link>
          <Link href="/" className="psc-btn psc-btn--ghost" scroll={false}>{t.comune.indietro}</Link>
        </div>
      ) : (
        <div className="welcome__actions">
          <Link href="/?registrati=1" className="psc-btn psc-btn--primary psc-btn--block" scroll={false}>{b.registrati}</Link>
          <Link href="/accedi" className="psc-btn psc-btn--secondary psc-btn--block">{b.accedi}</Link>
        </div>
      )}
      <div className="welcome__lingua">
        <SceltaLingua lingua={lingua} etichetta={t.comune.lingua} />
      </div>
      </TestiProvider>
    </main>
  );
}
