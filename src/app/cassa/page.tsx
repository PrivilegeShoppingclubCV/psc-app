import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { esci } from "@/app/accesso/azioni";
import { param } from "@/components/AuthPage";
import { dataOra } from "@/lib/admin/form";
import { formatEuro } from "@/lib/format";
import { codiceBuono } from "@/lib/tipi";
import { usaBuono } from "./azioni";
import { getAccessoCassa } from "./sessione";
import { TestaCassa } from "./Testa";
import "../admin/admin.css";

export const metadata: Metadata = { title: "Cassa: verifica buono", robots: { index: false, follow: false } };

type Scheda = {
  id: string; codice: string; stato: "attivo" | "usato" | "annullato" | "scaduto"; premio: string;
  valore_euro: number | null; punti: number; creato_il: string; scade_il: string; usato_il: string | null;
  negozio: string | null; socio: string;
};

const STATI: Record<Scheda["stato"], string> = {
  attivo: "Valido",
  usato: "Già usato",
  annullato: "Annullato dal socio",
  scaduto: "Scaduto",
};

/**
 * Pagina del commesso: scrive o scansiona il codice del buono (un lettore di codici
 * a barre collegato al PC scrive nel campo come una tastiera), vede di chi è e lo
 * segna come usato. Poi batte in ReadyPro l'articolo "Premio PSC".
 */
export default async function Cassa({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const accesso = await getAccessoCassa();
  if (accesso.stato === "non_entrato") redirect("/accedi?dopo=admin");
  if (accesso.stato !== "staff") {
    return (
      <main className="auth">
        <div className="page-head">
          <p className="t-eyebrow">Cassa</p>
          <h1 className="t-display-l">{accesso.stato === "non_configurato" ? "Database non collegato" : "Accesso riservato"}</h1>
          {accesso.stato === "non_staff" && (
            <p className="t-body-l">
              L&apos;account <strong>{accesso.email}</strong> non fa parte del personale dei negozi. Chiedi a un admin di
              aggiungerti dalla sezione Staff, oppure esci ed entra con un altro indirizzo.
            </p>
          )}
        </div>
        {accesso.stato === "non_staff" && (
          <form action={esci}>
            <button type="submit" className="psc-btn psc-btn--secondary psc-btn--block">Esci</button>
          </form>
        )}
      </main>
    );
  }

  const codice = param(q.codice).trim();
  const errore = param(q.errore);
  const usato = param(q.usato) === "1";
  let scheda: Scheda | null = null;
  let erroreLettura = "";
  if (codice) {
    const { data, error } = await accesso.supabase.rpc("verifica_buono", { p_codice: codice });
    if (error) erroreLettura = error.message;
    scheda = (data as Scheda | null) ?? null;
  }
  const { data: negozi } = accesso.negozioId
    ? { data: null }
    : await accesso.supabase.from("negozi").select("id, nome").order("nome");

  return (
    <main className="cassa">
      <TestaCassa nome={accesso.nome ?? accesso.email} admin={accesso.admin} attiva="buoni" />

      <div className="page-head">
        <p className="t-eyebrow">Cassa</p>
        <h1 className="t-display-l">Verifica buono</h1>
        <p className="t-body-l">Scansiona il codice a barre del buono sul telefono del socio, oppure scrivi le 8 lettere e cifre.</p>
      </div>

      <form action="/cassa" className="admin-cerca">
        <div className="psc-field">
          <label className="psc-field__label" htmlFor="codice">Codice del buono</label>
          <input id="codice" name="codice" className="psc-field__input cassa__campo" autoFocus autoComplete="off"
            autoCapitalize="characters" spellCheck={false} placeholder="ABCD-EFGH" defaultValue={usato ? "" : codice} required />
        </div>
        <button type="submit" className="psc-btn psc-btn--primary">Verifica</button>
      </form>

      {erroreLettura && <p className="notice notice--errore" role="alert">{erroreLettura}</p>}
      {errore && <p className="notice notice--errore" role="alert">{errore}</p>}
      {codice && !scheda && !erroreLettura && (
        <p className="notice notice--errore" role="alert">Nessun buono con il codice «{codice}». Controlla le lettere e riprova.</p>
      )}

      {scheda && (
        <section className={`cassa__buono cassa__buono--${scheda.stato}`} aria-live="polite">
          {usato && scheda.stato === "usato" ? (
            <p className="cassa__esito">Buono segnato come usato.</p>
          ) : (
            <p className="cassa__esito">{STATI[scheda.stato]}</p>
          )}
          <dl className="cassa__dati">
            <dt>Premio</dt><dd><strong>{scheda.premio}</strong>{scheda.valore_euro != null && ` (${formatEuro(Number(scheda.valore_euro))})`}</dd>
            <dt>Socio</dt><dd>{scheda.socio}</dd>
            <dt>Codice</dt><dd>{codiceBuono(scheda.codice)}</dd>
            <dt>Valido fino al</dt><dd>{dataOra(scheda.scade_il)}</dd>
            {scheda.usato_il && (<><dt>Usato</dt><dd>{dataOra(scheda.usato_il)}{scheda.negozio && ` · ${scheda.negozio}`}</dd></>)}
          </dl>

          {scheda.stato === "attivo" && (
            <form action={usaBuono} className="modulo">
              <input type="hidden" name="codice" value={scheda.codice} />
              {negozi && negozi.length > 0 && (
                <div className="psc-field">
                  <label className="psc-field__label" htmlFor="negozio">Negozio</label>
                  <select id="negozio" name="negozio" className="psc-field__input" defaultValue="">
                    <option value="">Non indicato</option>
                    {negozi.map((n) => <option key={n.id} value={n.id}>{n.nome}</option>)}
                  </select>
                </div>
              )}
              <button type="submit" className="psc-btn psc-btn--primary psc-btn--block">Segna come usato</button>
            </form>
          )}

          {(scheda.stato === "attivo" || usato) && (
            <p className="notice">
              In ReadyPro batti sullo scontrino l&apos;articolo <strong>Premio PSC</strong>
              {scheda.valore_euro != null && <> da <strong>{formatEuro(Number(scheda.valore_euro))}</strong></>}.
            </p>
          )}
        </section>
      )}
    </main>
  );
}
