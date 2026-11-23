import Link from "next/link";
import { param } from "@/components/AuthPage";
import { IconIndietro } from "@/components/Icons";
import { PageHead } from "@/components/PageHead";
import { getSocio } from "@/lib/socio";
import { segnalaDato } from "../azioni";
import { getTestiClub, ricco } from "@/lib/i18n";

export async function generateMetadata() {
  return { title: (await getTestiClub()).segnala.titoloPagina };
}

const CAMPI = ["email", "nome", "cognome", "telefono", "data_nascita", "indirizzo", "tessera", "punti", "altro"] as const;

export default async function Segnala({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  await getSocio();
  const errore = param(q.errore);
  const campo = param(q.campo) || "email";
  const t = (await getTestiClub()).segnala;

  return (
    <>
      <Link href="/profilo" className="back-link"><IconIndietro /> {t.eyebrow}</Link>
      <PageHead eyebrow={t.eyebrow} titolo={t.titolo}>
        <p className="t-body-l">{t.intro}</p>
      </PageHead>
      {errore && <p className="notice notice--errore" role="alert">{errore}</p>}

      <form action={segnalaDato} className="modulo">
        <div className="psc-field">
          <label className="psc-field__label" htmlFor="campo">{t.qualeDato}</label>
          <select id="campo" name="campo" className="psc-field__input" defaultValue={campo} required>
            {CAMPI.map((c) => <option key={c} value={c}>{t.campi[c]}</option>)}
          </select>
        </div>
        <div className="psc-field">
          <label className="psc-field__label" htmlFor="messaggio">{t.cosaNonVa}</label>
          <textarea id="messaggio" name="messaggio" className="psc-field__input" rows={5} minLength={3} maxLength={1000} required
            defaultValue={param(q.messaggio)} placeholder={t.esempio} />
        </div>
        <p className="t-caption">{ricco(t.correggi, { link: <Link href="/profilo/dati">{t.correggiLink}</Link> })}</p>
        <button type="submit" className="psc-btn psc-btn--primary psc-btn--block">{t.invia}</button>
      </form>
    </>
  );
}
