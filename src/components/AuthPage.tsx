import Link from "next/link";
import { IconIndietro } from "./Icons";

/** Guscio comune delle pagine di accesso: torna al benvenuto, titolo, contenuto. */
export function AuthPage({ eyebrow, titolo, intro, children }: { eyebrow: string; titolo: string; intro: string; children: React.ReactNode }) {
  return (
    <main className="auth">
      <Link href="/" className="back-link"><IconIndietro /> Indietro</Link>
      <div className="page-head">
        <p className="t-eyebrow">{eyebrow}</p>
        <h1 className="t-display-l">{titolo}</h1>
        <p className="t-body-l">{intro}</p>
      </div>
      {children}
      <p className="notice">Anteprima: l&apos;accesso non è ancora collegato. Con «Continua» entri con un socio di prova.</p>
    </main>
  );
}

export function Campo({ id, label, help, ...input }: { id: string; label: string; help?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="psc-field">
      <label className="psc-field__label" htmlFor={id}>{label}</label>
      <input id={id} name={id} className="psc-field__input" aria-describedby={help ? `${id}-help` : undefined} {...input} />
      {help && <span id={`${id}-help`} className="psc-field__help">{help}</span>}
    </div>
  );
}
