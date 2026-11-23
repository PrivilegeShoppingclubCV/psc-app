import { AuthPage, Campo, Spunta, param } from "@/components/AuthPage";
import { getSupabase } from "@/lib/dati";
import { approvaGenitore } from "../azioni";
import { forma, getTestiClub } from "@/lib/i18n";

export async function generateMetadata() {
  return { title: (await getTestiClub()).genitore.titoloPagina, robots: { index: false } };
}

type Link = { stato: "valido"; nome: string; serve_iscrizione: boolean } | { stato: "non_valido" | "usato" | "scaduto" };

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
  const t = (await getTestiClub()).genitore;

  if (param(q.fatto)) {
    return (
      <AuthPage eyebrow={t.eyebrow} titolo={t.grazie} intro={t.grazieIntro} indietro="/">
        {null}
      </AuthPage>
    );
  }

  if (link.stato !== "valido") {
    const motivo = { non_valido: t.nonValido, usato: t.usato, scaduto: t.scaduto }[link.stato];
    return (
      <AuthPage eyebrow={t.eyebrow} titolo={t.nonUtilizzabile} intro={motivo} indietro="/">
        {null}
      </AuthPage>
    );
  }

  const nome = { nome: link.nome };
  return (
    <AuthPage
      eyebrow={t.eyebrow}
      titolo={forma(t.chiede, nome)}
      intro={forma(link.serve_iscrizione ? t.introIscrizione : t.introPunti, nome)}
      errore={param(q.errore)}
      indietro="/"
    >
      <form action={approvaGenitore}>
        <input type="hidden" name="codice" value={codice} />
        <Campo id="nome" label={t.tuoNome} autoComplete="given-name" required defaultValue={param(q.nome)} />
        <Campo id="cognome" label={t.tuoCognome} autoComplete="family-name" required defaultValue={param(q.cognome)} />
        <Campo id="email" label={t.tuaEmail} type="email" dir="ltr" autoComplete="email" required defaultValue={param(q.email)} />
        {link.serve_iscrizione && (
          <Spunta id="iscrizione" required>{forma(t.consIscrizione, nome)}</Spunta>
        )}
        <Spunta id="punti">{forma(t.consPunti, nome)}</Spunta>
        <Spunta id="marketing">{forma(t.consMarketing, nome)}</Spunta>
        <Spunta id="dichiaro" required>{forma(t.dichiaro, nome)}</Spunta>
        <button type="submit" className="psc-btn psc-btn--primary psc-btn--block">{t.conferma}</button>
      </form>
    </AuthPage>
  );
}
