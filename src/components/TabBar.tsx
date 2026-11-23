"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconHome, IconNegozi, IconOfferte, IconProfilo, IconPunti } from "./Icons";
import { useTesti } from "@/lib/i18n/client";

// Ordine da sinistra: Negozi · Punti · Home · Offerte · Profilo. Home al centro, in evidenza.
const tabs = [
  { href: "/negozi", chiave: "negozi", Icon: IconNegozi },
  { href: "/punti", chiave: "punti", Icon: IconPunti },
  { href: "/home", chiave: "home", Icon: IconHome, centrale: true },
  { href: "/offerte", chiave: "offerte", Icon: IconOfferte },
  { href: "/profilo", chiave: "profilo", Icon: IconProfilo },
] as const;

export function TabBar() {
  const pathname = usePathname();
  const t = useTesti().tab;
  return (
    <div className="tabbar-wrap">
      <nav className="psc-tabbar" aria-label={t.navigazione}>
        {tabs.map(({ href, chiave, Icon, ...resto }) => {
          const centrale = "centrale" in resto;
          const attiva = pathname === href || pathname.startsWith(href + "/");
          const cls = ["psc-tab", centrale && "psc-tab--card", attiva && "is-active"].filter(Boolean).join(" ");
          return (
            <Link key={href} href={href} className={cls} aria-current={attiva ? "page" : undefined}>
              {centrale ? (
                <span className="psc-tab__fab"><Icon /></span>
              ) : (
                <Icon />
              )}
              {t[chiave]}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
