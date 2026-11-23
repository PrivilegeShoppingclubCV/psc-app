import { redirect } from "next/navigation";
import { AuthPage, param } from "@/components/AuthPage";
import { CampoCodice, TastoEntra } from "@/components/CampoCodice";
import { accedi, verifica } from "../accesso/azioni";
import { getTesti, ricco } from "@/lib/i18n";

export async function generateMetadata() {
  return { title: (await getTesti()).verifica.titoloPagina };
}

const INDIETRO = { collega: "/collega-tessera", iscriviti: "/iscriviti", home: "/accedi", admin: "/accedi?dopo=admin" } as const;

export default async function Verifica({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const email = param(q.email);
  const dopo = param(q.dopo);
  const errore = param(q.errore);
  if (!email) redirect("/accedi");
  const t = await getTesti();
  const v = t.verifica;

  return (
    <AuthPage
      eyebrow={v.eyebrow}
      titolo={v.titolo}
      intro={ricco(v.intro, { email: <strong dir="ltr">{email}</strong> })}
      errore={errore}
      indietro={INDIETRO[dopo as keyof typeof INDIETRO] ?? "/accedi"}
    >
      <form action={verifica}>
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="dopo" value={dopo} />
        <CampoCodice />
        <TastoEntra />
      </form>

      <form action={accedi}>
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="dopo" value={dopo} />
        <button type="submit" className="psc-btn psc-btn--ghost psc-btn--block">{v.rimanda}</button>
      </form>
    </AuthPage>
  );
}
