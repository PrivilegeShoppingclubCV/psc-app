import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { direzione, getLingua } from "@/lib/i18n";
import { TESTI, testiClient } from "@/lib/i18n/testi";
import { TestiProvider } from "@/lib/i18n/client";
import { IconIndietro } from "./Icons";
import { SceltaLingua } from "./SceltaLingua";

/**
 * Guscio comune delle pagine di accesso: torna al benvenuto, scelta della lingua,
 * titolo, eventuale errore, contenuto. Lingua e direzione (arabo da destra a
 * sinistra) valgono per tutta la pagina.
 */
export async function AuthPage({ eyebrow, titolo, intro, errore, indietro = "/", children }: {
  eyebrow: string;
  titolo: string;
  intro: React.ReactNode;
  errore?: string;
  indietro?: string;
  children: React.ReactNode;
}) {
  const lingua = await getLingua();
  const t = TESTI[lingua];
  return (
    <main className="auth" lang={lingua} dir={direzione(lingua)}>
      <TestiProvider testi={testiClient(lingua)}>
        <div className="auth__barra">
          <Link href={indietro} className="back-link"><IconIndietro /> {t.comune.indietro}</Link>
          <SceltaLingua lingua={lingua} etichetta={t.comune.lingua} />
        </div>
        <div className="page-head">
          <p className="t-eyebrow">{eyebrow}</p>
          <h1 className="t-display-l">{titolo}</h1>
          <p className="t-body-l">{intro}</p>
        </div>
        {errore && <p className="notice notice--errore" role="alert">{errore}</p>}
        {children}
        {!isSupabaseConfigured && <p className="notice">{t.comune.anteprima}</p>}
      </TestiProvider>
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

/** Legge un parametro della query string come testo (Next li passa come string | string[]). */
export const param = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
