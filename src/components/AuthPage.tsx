import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { IconIndietro } from "./Icons";

/** Guscio comune delle pagine di accesso: torna al benvenuto, titolo, eventuale errore, contenuto. */
export function AuthPage({ eyebrow, titolo, intro, errore, indietro = "/", children }: {
  eyebrow: string;
  titolo: string;
  intro: React.ReactNode;
  errore?: string;
  indietro?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="auth">
      <Link href={indietro} className="back-link"><IconIndietro /> Indietro</Link>
      <div className="page-head">
        <p className="t-eyebrow">{eyebrow}</p>
        <h1 className="t-display-l">{titolo}</h1>
        <p className="t-body-l">{intro}</p>
      </div>
      {errore && <p className="notice notice--errore" role="alert">{errore}</p>}
      {children}
      {!isSupabaseConfigured && (
        <p className="notice">Anteprima: il database non è collegato. Con «Continua» entri con un socio di prova.</p>
      )}
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

export function Spunta({ id, children, ...input }: { id: string; children: React.ReactNode } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="spunta" htmlFor={id}>
      <input id={id} name={id} type="checkbox" {...input} />
      <span>{children}</span>
    </label>
  );
}

/** La data di oggi come AAAA-MM-GG, per il massimo dei campi data. */
export const oggi = () => new Date().toISOString().slice(0, 10);

/** Ultima data di nascita (AAAA-MM-GG) di chi oggi ha almeno 18 anni. */
export function maggiorenneDal() {
  const d = new Date();
  // Chi è nato il 29 febbraio compie gli anni il 1° marzo negli anni non bisestili.
  const anno = d.getFullYear() - 18;
  const data = new Date(Date.UTC(anno, d.getMonth(), d.getDate()));
  if (data.getUTCMonth() !== d.getMonth()) data.setUTCDate(0);
  return data.toISOString().slice(0, 10);
}

/** Legge un parametro della query string come testo (Next li passa come string | string[]). */
export const param = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
