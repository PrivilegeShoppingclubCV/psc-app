import type { Metadata } from "next";
import { AuthPage, Campo, Spunta, param } from "@/components/AuthPage";
import { getSupabase } from "@/lib/dati";
import { approvaGenitore } from "../azioni";

export const metadata: Metadata = { title: "Consenso del genitore", robots: { index: false } };

type Link = { stato: "valido"; nome: string; serve_iscrizione: boolean } | { stato: "non_valido" | "usato" | "scaduto" };

const NON_VALIDO = {
  non_valido: "Questo link non è valido. Chiedi a tuo figlio di mandartene uno nuovo dall'app.",
  usato: "Questo link è già stato usato: il consenso è registrato. Se vuoi cambiare le scelte, chiedi in negozio.",
  scaduto: "Questo link è scaduto. Chiedi a tuo figlio di mandartene uno nuovo dall'app.",
} as const;

export default async function Genitore({ params, searchParams }: {
  params: Promise<{ codice: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { codice } = await params;
  const q = await searchParams;
  const supabase = await getSupabase();
  const link: Link = supabase
    ? ((await supabase.rpc("leggi_link_genitore", { p_token: codice })).data as Link | null) ?? { stato: "non_valido" }
    : { stato: "valido", nome: "Giulia", serve_iscrizione: true };

  if (param(q.fatto)) {
    return (
      <AuthPage eyebrow="Consenso del genitore" titolo="Grazie!" intro="Abbiamo registrato le tue scelte. Tuo figlio trova tutto attivo riaprendo l'app." indietro="/">
        {null}
      </AuthPage>
    );
  }

  if (link.stato !== "valido") {
    return (
      <AuthPage eyebrow="Consenso del genitore" titolo="Link non utilizzabile" intro={NON_VALIDO[link.stato]} indietro="/">
        {null}
      </AuthPage>
    );
  }

  return (
    <AuthPage
      eyebrow="Consenso del genitore"
      titolo={`${link.nome} ti chiede l'ok`}
      intro={
        link.serve_iscrizione
          ? `${link.nome} vuole iscriversi al Privilege Shopping Club. Avendo meno di 14 anni, serve il consenso di un genitore o di chi ne ha la responsabilità.`
          : `${link.nome} è iscritto al Privilege Shopping Club. Essendo minorenne, la raccolta punti e le offerte si attivano solo con il consenso di un genitore.`
      }
      errore={param(q.errore)}
      indietro="/"
    >
      <form action={approvaGenitore}>
        <input type="hidden" name="codice" value={codice} />
        <Campo id="nome" label="Il tuo nome" autoComplete="given-name" required defaultValue={param(q.nome)} />
        <Campo id="cognome" label="Il tuo cognome" autoComplete="family-name" required defaultValue={param(q.cognome)} />
        <Campo id="email" label="La tua email" type="email" autoComplete="email" required defaultValue={param(q.email)} />
        {link.serve_iscrizione && (
          <Spunta id="iscrizione" required>
            Ho letto l&apos;informativa privacy e acconsento all&apos;iscrizione di {link.nome} al club (obbligatorio)
          </Spunta>
        )}
        <Spunta id="punti">Acconsento alla raccolta punti sugli acquisti di {link.nome} (facoltativo)</Spunta>
        <Spunta id="marketing">Acconsento all&apos;invio a {link.nome} di offerte e novità via email e notifica (facoltativo)</Spunta>
        <Spunta id="dichiaro" required>Dichiaro di essere genitore o tutore di {link.nome} (obbligatorio)</Spunta>
        <button type="submit" className="psc-btn psc-btn--primary psc-btn--block">Conferma</button>
      </form>
    </AuthPage>
  );
}
