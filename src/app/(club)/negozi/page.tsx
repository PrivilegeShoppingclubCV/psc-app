import { PageHead } from "@/components/PageHead";
import { getNegozi } from "@/lib/dati";
import { getTestiClub } from "@/lib/i18n";

export async function generateMetadata() {
  return { title: (await getTestiClub()).negozi.titoloPagina };
}

export default async function Negozi() {
  const negozi = await getNegozi();
  const t = (await getTestiClub()).negozi;

  return (
    <>
      <PageHead eyebrow={t.eyebrow} titolo={t.titolo}>
        <p className="t-caption">{t.mappa}</p>
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
