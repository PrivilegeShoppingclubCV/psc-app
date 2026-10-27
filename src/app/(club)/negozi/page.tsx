import type { Metadata } from "next";
import { PageHead } from "@/components/PageHead";
import { getNegozi } from "@/lib/dati";

export const metadata: Metadata = { title: "Negozi" };

export default async function Negozi() {
  const negozi = await getNegozi();

  return (
    <>
      <PageHead eyebrow="I nostri negozi" titolo="Negozi">
        <p className="t-caption">Mappa e indicazioni arriveranno più avanti.</p>
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
