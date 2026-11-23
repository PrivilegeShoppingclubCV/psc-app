import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { esci } from "@/app/accesso/azioni";
import { AdminNav } from "@/components/admin/AdminNav";
import { getAccesso } from "@/lib/admin/sessione";
import "./admin.css";

export const metadata: Metadata = {
  title: { default: "Pannello admin", template: "%s · Admin Privilege" },
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const accesso = await getAccesso();
  if (accesso.stato === "non_entrato") redirect("/accedi?dopo=admin");
  // Gli operatori dei negozi non vedono il pannello: per loro c'è la cassa (verifica buoni).
  if (accesso.stato === "non_admin" && accesso.operatore) redirect("/cassa");

  if (accesso.stato !== "admin") {
    return (
      <main className="auth">
        <div className="page-head">
          <p className="t-eyebrow">Pannello admin</p>
          <h1 className="t-display-l">{accesso.stato === "non_configurato" ? "Database non collegato" : "Accesso riservato"}</h1>
          {accesso.stato === "non_configurato" ? (
            <p className="t-body-l">Il pannello lavora sui dati veri: si apre quando l&apos;app è collegata a Supabase.</p>
          ) : (
            <p className="t-body-l">
              L&apos;account <strong>{accesso.email}</strong> non è un admin del club. Chiedi a un admin di aggiungerti
              dalla sezione Staff, oppure esci ed entra con un altro indirizzo.
            </p>
          )}
        </div>
        {accesso.stato === "non_admin" && (
          <form action={esci}>
            <button type="submit" className="psc-btn psc-btn--secondary psc-btn--block">Esci</button>
          </form>
        )}
        <Link href="/" className="psc-btn psc-btn--ghost">Torna all&apos;app</Link>
      </main>
    );
  }

  return (
    <div className="admin">
      <aside className="admin-side">
        <Link href="/admin" className="admin-side__brand" aria-label="Pannello admin, panoramica">
          <span className="logo logo--wordmark" />
          <span className="t-eyebrow">Admin</span>
        </Link>
        <AdminNav />
        <div className="admin-side__utente">
          <span className="t-caption">{accesso.nome ?? accesso.email}</span>
          <form action={esci}>
            <button type="submit" className="psc-btn psc-btn--ghost">Esci</button>
          </form>
        </div>
      </aside>
      <main className="admin-main">{children}</main>
    </div>
  );
}
