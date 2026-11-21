"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Voce = { href: string; label: string };
type Gruppo = { titolo?: string; voci: Voce[] };

const GRUPPI: Gruppo[] = [
  { voci: [{ href: "/admin", label: "Panoramica" }] },
  {
    titolo: "Catalogo",
    voci: [
      { href: "/admin/prodotti", label: "Prodotti" },
      { href: "/admin/foto", label: "Foto prodotti" },
      { href: "/admin/offerte", label: "Offerte" },
      { href: "/admin/premi", label: "Premi" },
    ],
  },
  {
    titolo: "Club",
    voci: [
      { href: "/admin/soci", label: "Soci" },
      { href: "/admin/tessere", label: "Tessere" },
      { href: "/admin/segnalazioni", label: "Segnalazioni" },
      { href: "/admin/tentativi", label: "Tentativi non riusciti" },
    ],
  },
  {
    titolo: "Impostazioni",
    voci: [
      { href: "/admin/staff", label: "Staff" },
      { href: "/admin/negozi", label: "Negozi" },
      { href: "/admin/gestionale", label: "Gestionale" },
    ],
  },
];

export function AdminNav() {
  const percorso = usePathname();
  return (
    <nav className="admin-nav" aria-label="Sezioni del pannello">
      {GRUPPI.map((g, i) => (
        <div key={g.titolo ?? i} className="admin-nav__gruppo" role="group" aria-label={g.titolo}>
          {g.titolo && <span className="admin-nav__titolo">{g.titolo}</span>}
          {g.voci.map((v) => {
            const attiva = v.href === "/admin" ? percorso === "/admin" : percorso.startsWith(v.href);
            return (
              <Link key={v.href} href={v.href} className={attiva ? "is-active" : undefined} aria-current={attiva ? "page" : undefined}>
                {v.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
