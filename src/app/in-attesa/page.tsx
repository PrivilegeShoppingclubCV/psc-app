import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EsciButton } from "@/components/EsciButton";
import { LinkGenitore } from "@/components/LinkGenitore";
import { getSessione } from "@/lib/dati";

export const metadata: Metadata = { title: "Manca l'ok di un genitore" };

// Iscritti in app con meno di 14 anni: la tessera si attiva quando un genitore approva.
export default async function InAttesa() {
  const { configurato, email, socio } = await getSessione();
  if (configurato && !email) redirect("/accedi");
  if (!socio) redirect("/collega-tessera");
  if (socio.attesaGenitore !== "iscrizione") redirect("/home");

  return (
    <main className="auth">
      <div className="page-head">
        <p className="t-eyebrow">Quasi fatto</p>
        <h1 className="t-display-l">Manca l&apos;ok di un genitore</h1>
        <p className="t-body-l">
          Hai meno di 14 anni: per attivare la tessera serve il consenso di un genitore. Mandagli il link qui sotto: quando lo
          approva, riapri l&apos;app e trovi la tua tessera.
        </p>
      </div>
      <LinkGenitore nome={socio.nome} />
      <EsciButton />
    </main>
  );
}
