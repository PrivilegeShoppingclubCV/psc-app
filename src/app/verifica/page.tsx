import { redirect } from "next/navigation";
import { AuthPage, param } from "@/components/AuthPage";
import { CampoCodice, TastoEntra } from "@/components/CampoCodice";
import { accedi, inviaAllEmailTessera, verifica } from "../accesso/azioni";
import { leggiRecupero, mascheraEmail, soloNumeroTessera } from "../accesso/recupero";
import { getTesti, ricco } from "@/lib/i18n";

export async function generateMetadata() {
  return { title: (await getTesti()).verifica.titoloPagina };
}

const INDIETRO = { collega: "/collega-tessera", negozio: "/collega-tessera", iscriviti: "/iscriviti", home: "/accedi", admin: "/accedi?dopo=admin" } as const;

export default async function Verifica({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  // Codice mandato all'email della tessera: l'indirizzo vero resta nel cookie cifrato,
  // qui si vede solo mascherato.
  const recupero = param(q.recupero) === "1" ? await leggiRecupero() : null;
  if (param(q.recupero) === "1" && !recupero) redirect("/collega-tessera");
  // Con il modulo "solo numero" l'email della tessera si vede per intero (refusi del gestionale).
  const email = recupero ? (soloNumeroTessera() ? recupero.email : mascheraEmail(recupero.email)) : param(q.email);
  const dopo = param(q.dopo);
  const errore = param(q.errore);
  if (!email) redirect("/accedi");
  const t = await getTesti();
  const v = t.verifica;

  return (
    <AuthPage
      eyebrow={v.eyebrow}
      titolo={v.titolo}
      intro={ricco(recupero && soloNumeroTessera() ? v.introTessera : v.intro, { email: <strong dir="ltr">{email}</strong> })}
      errore={errore}
      indietro={INDIETRO[dopo as keyof typeof INDIETRO] ?? "/accedi"}
    >
      <form action={verifica}>
        {recupero ? <input type="hidden" name="recupero" value="1" /> : <input type="hidden" name="email" value={email} />}
        <input type="hidden" name="dopo" value={dopo} />
        <CampoCodice />
        <TastoEntra />
      </form>

      <form action={recupero ? inviaAllEmailTessera : accedi}>
        {recupero ? <input type="hidden" name="tessera" value={recupero.numero} /> : <input type="hidden" name="email" value={email} />}
        <input type="hidden" name="dopo" value={dopo} />
        <button type="submit" className="psc-btn psc-btn--ghost psc-btn--block">{v.rimanda}</button>
      </form>
    </AuthPage>
  );
}
