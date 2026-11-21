"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

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

const CHIAVE = "psc-admin-menu-chiusi";

function eAttiva(href: string, percorso: string) {
  return href === "/admin" ? percorso === "/admin" : percorso.startsWith(href);
}

export function AdminNav() {
  const percorso = usePathname();
  const [chiusi, setChiusi] = useState<string[]>([]);

  // Ricorda i gruppi chiusi su questo browser.
  useEffect(() => {
    try {
      const salvati = JSON.parse(localStorage.getItem(CHIAVE) ?? "[]");
      if (Array.isArray(salvati)) setChiusi(salvati.filter((t) => typeof t === "string"));
    } catch {}
  }, []);

  // Il gruppo della pagina aperta resta sempre visibile.
  useEffect(() => {
    const attivo = GRUPPI.find((g) => g.voci.some((v) => eAttiva(v.href, percorso)))?.titolo;
    if (attivo) setChiusi((c) => (c.includes(attivo) ? c.filter((t) => t !== attivo) : c));
  }, [percorso]);

  function cambia(titolo: string) {
    setChiusi((c) => {
      const nuovi = c.includes(titolo) ? c.filter((t) => t !== titolo) : [...c, titolo];
      try {
        localStorage.setItem(CHIAVE, JSON.stringify(nuovi));
      } catch {}
      return nuovi;
    });
  }

  return (
    <nav className="admin-nav" aria-label="Sezioni del pannello">
      {GRUPPI.map((g, i) => {
        const aperto = !g.titolo || !chiusi.includes(g.titolo);
        const id = `admin-nav-${i}`;
        return (
          <div key={g.titolo ?? i} className="admin-nav__gruppo" role="group" aria-label={g.titolo}>
            {g.titolo && (
              <button
                type="button"
                className="admin-nav__titolo"
                aria-expanded={aperto}
                aria-controls={id}
                onClick={() => cambia(g.titolo!)}
              >
                {g.titolo}
                <span className="admin-nav__freccia" aria-hidden="true" />
              </button>
            )}
            <div id={id} className="admin-nav__voci" hidden={!aperto}>
              {g.voci.map((v) => {
                const attiva = eAttiva(v.href, percorso);
                return (
                  <Link key={v.href} href={v.href} className={attiva ? "is-active" : undefined} aria-current={attiva ? "page" : undefined}>
                    {v.label}
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );
}
