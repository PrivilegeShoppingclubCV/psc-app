"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const VOCI = [
  { href: "/admin", label: "Panoramica" },
  { href: "/admin/offerte", label: "Offerte" },
  { href: "/admin/prodotti", label: "Prodotti" },
  { href: "/admin/soci", label: "Soci" },
  { href: "/admin/negozi", label: "Negozi" },
  { href: "/admin/premi", label: "Premi" },
  { href: "/admin/staff", label: "Staff" },
  { href: "/admin/gestionale", label: "Gestionale" },
];

export function AdminNav() {
  const percorso = usePathname();
  return (
    <nav className="admin-nav" aria-label="Sezioni del pannello">
      {VOCI.map((v) => {
        const attiva = v.href === "/admin" ? percorso === "/admin" : percorso.startsWith(v.href);
        return (
          <Link key={v.href} href={v.href} className={attiva ? "is-active" : undefined} aria-current={attiva ? "page" : undefined}>
            {v.label}
          </Link>
        );
      })}
    </nav>
  );
}
