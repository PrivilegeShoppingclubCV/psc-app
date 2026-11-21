import type { Metadata } from "next";
import Link from "next/link";
import { param } from "@/components/AuthPage";
import { IconIndietro } from "@/components/Icons";
import { PageHead } from "@/components/PageHead";
import { getSocio } from "@/lib/socio";
import { segnalaDato } from "../azioni";

export const metadata: Metadata = { title: "Segnala un dato sbagliato" };

const CAMPI = [
  { value: "email", label: "Email" },
  { value: "nome", label: "Nome" },
  { value: "cognome", label: "Cognome" },
  { value: "telefono", label: "Cellulare" },
  { value: "data_nascita", label: "Data di nascita" },
  { value: "indirizzo", label: "Indirizzo" },
  { value: "tessera", label: "Tessera" },
  { value: "punti", label: "Punti" },
  { value: "altro", label: "Altro" },
];

export default async function Segnala({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  await getSocio();
  const errore = param(q.errore);
  const campo = param(q.campo) || "email";

  return (
    <>
      <Link href="/profilo" className="back-link"><IconIndietro /> Profilo</Link>
      <PageHead eyebrow="Profilo" titolo="Segnala un dato sbagliato">
        <p className="t-body-l">Scrivici cosa non è corretto e qual è il dato giusto: lo sistemiamo noi, anche alle casse dei negozi.</p>
      </PageHead>
      {errore && <p className="notice notice--errore" role="alert">{errore}</p>}

      <form action={segnalaDato} className="modulo">
        <div className="psc-field">
          <label className="psc-field__label" htmlFor="campo">Quale dato</label>
          <select id="campo" name="campo" className="psc-field__input" defaultValue={campo} required>
            {CAMPI.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div className="psc-field">
          <label className="psc-field__label" htmlFor="messaggio">Cosa non va</label>
          <textarea id="messaggio" name="messaggio" className="psc-field__input" rows={5} minLength={3} maxLength={1000} required
            defaultValue={param(q.messaggio)} placeholder="Es. La mia email giusta è mario.rossi@esempio.it" />
        </div>
        <p className="t-caption">Cellulare, data di nascita e indirizzo li puoi anche <Link href="/profilo/dati">correggere da solo</Link>.</p>
        <button type="submit" className="psc-btn psc-btn--primary psc-btn--block">Invia la segnalazione</button>
      </form>
    </>
  );
}
