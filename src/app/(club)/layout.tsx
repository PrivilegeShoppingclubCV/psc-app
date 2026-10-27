import Link from "next/link";
import { TabBar } from "@/components/TabBar";
import { socio } from "@/lib/mock-data";

export default function ClubLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="app">
        <header className="app-header">
          <Link href="/home" aria-label="Privilege Shopping Club, vai alla Home">
            <span className="logo logo--crown" />
          </Link>
          <span className="psc-badge psc-badge--gold">{socio.livello}</span>
        </header>
        <main className="app-main">{children}</main>
      </div>
      <TabBar />
    </>
  );
}
