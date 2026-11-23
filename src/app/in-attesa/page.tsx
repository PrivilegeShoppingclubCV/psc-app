import { redirect } from "next/navigation";
import { EsciButton } from "@/components/EsciButton";
import { LinkGenitore } from "@/components/LinkGenitore";
import { getSessione } from "@/lib/dati";
import { direzione, getLingua, getTestiClub, testiClient } from "@/lib/i18n";
import { TestiProvider } from "@/lib/i18n/client";

export async function generateMetadata() {
  return { title: (await getTestiClub()).inAttesa.titoloPagina };
}

// Iscritti in app con meno di 14 anni: la tessera si attiva quando un genitore approva.
export default async function InAttesa() {
  const { configurato, email, socio } = await getSessione();
  if (configurato && !email) redirect("/accedi");
  if (!socio) redirect("/collega-tessera");
  if (socio.attesaGenitore !== "iscrizione") redirect("/home");
  const lingua = await getLingua();
  const t = (await getTestiClub()).inAttesa;

  return (
    <main className="auth" lang={lingua} dir={direzione(lingua)}>
      <TestiProvider testi={testiClient(lingua)}>
      <div className="page-head">
        <p className="t-eyebrow">{t.eyebrow}</p>
        <h1 className="t-display-l">{t.titolo}</h1>
        <p className="t-body-l">{t.testo}</p>
      </div>
      <LinkGenitore nome={socio.nome} />
      <EsciButton />
      </TestiProvider>
    </main>
  );
}
