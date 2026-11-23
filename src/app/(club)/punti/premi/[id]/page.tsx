import Link from "next/link";
import { notFound } from "next/navigation";
import { param } from "@/components/AuthPage";
import { IconIndietro } from "@/components/Icons";
import { PageHead } from "@/components/PageHead";
import { getPremi, getSaldo } from "@/lib/dati";
import { forma, getFormati, getTestiClub, ricco } from "@/lib/i18n";
import { getSocio } from "@/lib/socio";
import { riscattaPremio } from "../../azioni";

export async function generateMetadata() {
  return { title: (await getTestiClub()).buono.confermaTitolo };
}

/** Conferma prima di scalare i punti: un tocco per sbaglio non deve costare un premio. */
export default async function ConfermaPremio({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, q] = await Promise.all([params, searchParams]);
  const socio = await getSocio();
  const [premi, saldo] = await Promise.all([getPremi(), getSaldo(socio.id)]);
  const premio = premi.find((p) => p.id === id);
  if (!premio) notFound();
  const f = await getFormati();
  const t = (await getTestiClub()).buono;
  const basta = saldo >= premio.soglia;
  const errore = param(q.errore);

  return (
    <>
      <Link href="/punti" className="back-link"><IconIndietro /> {t.indietro}</Link>
      <PageHead eyebrow={t.confermaEyebrow} titolo={premio.nome}>
        <p className="t-body-l">
          {ricco(forma(t.confermaTesto, { punti: f.punti(premio.soglia) }), { premio: <bdi>{premio.nome}</bdi> })}
        </p>
      </PageHead>
      {errore && <p className="notice notice--errore" role="alert">{errore}</p>}
      {basta ? (
        <form action={riscattaPremio} className="modulo">
          <input type="hidden" name="premio" value={premio.id} />
          <p className="t-caption">{forma(t.saldoDopo, { punti: f.punti(saldo - premio.soglia) })}</p>
          <button type="submit" className="psc-btn psc-btn--primary psc-btn--block">{t.conferma}</button>
          <Link href="/punti" className="psc-btn psc-btn--ghost psc-btn--block">{t.nonOra}</Link>
        </form>
      ) : (
        <p className="notice">{t.puntiInsufficienti}</p>
      )}
    </>
  );
}
