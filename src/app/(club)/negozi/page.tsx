import type { Metadata } from "next";
import { PageHead } from "@/components/PageHead";
import { negozi } from "@/lib/mock-data";

export const metadata: Metadata = { title: "Negozi" };

export default function Negozi() {
  return (
    <>
      <PageHead eyebrow="I nostri negozi" titolo="Negozi">
        <p className="t-caption">Indirizzi e orari di prova. Mappa e indicazioni arriveranno più avanti.</p>
      </PageHead>
      <ul className="list">
        {negozi.map((n) => (
          <li key={n.id}>
            <div className="list__main">
              <strong>{n.nome}</strong>
              <span className="t-caption">{n.indirizzo}</span>
            </div>
            <span className="t-caption">{n.orari}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
