import Link from "next/link";
import { esci } from "@/app/accesso/azioni";

const VOCI = [
  { href: "/cassa", label: "Verifica buono", chiave: "buoni" },
  { href: "/cassa/soci", label: "Soci", chiave: "soci" },
  { href: "/cassa/soci/nuovo", label: "Nuovo socio", chiave: "nuovo" },
] as const;

/** Testata dell'area operatori: tre voci, niente altro del pannello. */
export function TestaCassa({ nome, admin, attiva }: { nome: string; admin: boolean; attiva: (typeof VOCI)[number]["chiave"] }) {
  return (
    <>
      <header className="cassa__testa">
        <span className="logo logo--wordmark" />
        <div className="cassa__utente">
          <span className="t-caption">{nome}</span>
          {admin && <Link href="/admin" className="psc-btn psc-btn--ghost">Pannello admin</Link>}
          <form action={esci}><button type="submit" className="psc-btn psc-btn--ghost">Esci</button></form>
        </div>
      </header>
      <nav className="admin-nav cassa__menu" aria-label="Area negozio">
        {VOCI.map((v) => (
          <Link key={v.chiave} href={v.href} className={v.chiave === attiva ? "is-active" : undefined} aria-current={v.chiave === attiva ? "page" : undefined}>{v.label}</Link>
        ))}
      </nav>
    </>
  );
}
