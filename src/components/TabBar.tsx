"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconHome, IconNegozi, IconOfferte, IconProfilo, IconPunti } from "./Icons";

// Ordine da sinistra: Negozi · Punti · Home · Offerte · Profilo. Home al centro, in evidenza.
const tabs = [
  { href: "/negozi", label: "Negozi", Icon: IconNegozi },
  { href: "/punti", label: "Punti", Icon: IconPunti },
  { href: "/home", label: "Home", Icon: IconHome, centrale: true },
  { href: "/offerte", label: "Offerte", Icon: IconOfferte },
  { href: "/profilo", label: "Profilo", Icon: IconProfilo },
];

export function TabBar() {
  const pathname = usePathname();
  return (
    <div className="tabbar-wrap">
      <nav className="psc-tabbar" aria-label="Navigazione principale">
        {tabs.map(({ href, label, Icon, centrale }) => {
          const attiva = pathname === href || pathname.startsWith(href + "/");
          const cls = ["psc-tab", centrale && "psc-tab--card", attiva && "is-active"].filter(Boolean).join(" ");
          return (
            <Link key={href} href={href} className={cls} aria-current={attiva ? "page" : undefined}>
              {centrale ? (
                <span className="psc-tab__fab"><Icon /></span>
              ) : (
                <Icon />
              )}
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
