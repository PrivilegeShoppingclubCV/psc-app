import { Campo, Scelta } from "@/components/admin/Campi";
import { CampoData } from "@/components/CampoData";

type Socio = {
  id: string; nome: string | null; cognome: string | null; email: string | null; telefono: string | null;
  data_nascita: string | null; indirizzo: string | null; cap: string | null; citta: string | null;
  livello: string; stato: string; negozio_preferito_id: string | null;
};

/**
 * Dati del socio: lo stesso modulo nel pannello admin e nella scheda degli
 * operatori (/cassa). Salva con staff_aggiorna_socio, che manda le modifiche a ReadyPro.
 */
export function ModuloScheda({ azione, socio: s, haApp, livelli, negozi, emailSoloAdmin = false }: {
  azione: (form: FormData) => Promise<void>;
  socio: Socio;
  haApp: boolean;
  /** Operatori: l'email di accesso di chi usa l'app la cambia solo l'amministrazione. */
  emailSoloAdmin?: boolean;
  livelli: { codice: string; nome: string }[];
  negozi: { id: string; nome: string }[];
}) {
  return (
    <form action={azione} className="admin-card admin-form">
      <input type="hidden" name="id" value={s.id} />
      <h2 className="t-title">Scheda</h2>
      <div className="admin-grid">
        <Campo id="nome" label="Nome" defaultValue={s.nome ?? ""} />
        <Campo id="cognome" label="Cognome" defaultValue={s.cognome ?? ""} />
        {haApp && emailSoloAdmin ? (
          <Campo id="email" label="Email" type="email" defaultValue={s.email ?? ""} readOnly
            help="Il socio entra nell'app con questa email: per cambiarla chiedi all'amministrazione." />
        ) : (
          <Campo id="email" label="Email" type="email" defaultValue={s.email ?? ""} help={haApp
            ? "Il socio accede all'app con questa email: se la correggi, da subito entra con quella nuova (nessuna conferma da fare)."
            : "Con questa email il socio collega da solo la tessera all'app."} />
        )}
        <Campo id="telefono" label="Telefono" type="tel" defaultValue={s.telefono ?? ""} />
        <CampoData id="data_nascita" label="Data di nascita" defaultValue={s.data_nascita ?? ""} />
        <Campo id="indirizzo" label="Indirizzo" defaultValue={s.indirizzo ?? ""} />
        <Campo id="cap" label="CAP" defaultValue={s.cap ?? ""} />
        <Campo id="citta" label="Città" defaultValue={s.citta ?? ""} />
        <Scelta id="livello" label="Livello" defaultValue={s.livello} opzioni={livelli.map((l) => ({ value: l.codice, label: l.nome }))} />
        <Scelta id="stato" label="Stato" defaultValue={s.stato} help="Sospeso o cessato: la tessera sparisce dall'app."
          opzioni={[{ value: "attivo", label: "Attivo" }, { value: "sospeso", label: "Sospeso" }, { value: "cessato", label: "Cessato" }, { value: "in_attesa", label: "In attesa del genitore (minore di 14 anni)" }]} />
        <Scelta id="negozio_preferito_id" label="Negozio preferito" defaultValue={s.negozio_preferito_id ?? ""}
          opzioni={[{ value: "", label: "Nessuno" }, ...negozi.map((n) => ({ value: n.id, label: n.nome }))]} />
      </div>
      <p className="t-caption">Le modifiche a nome, recapiti e negozio arrivano a ReadyPro con il prossimo invio dello script.</p>
      <div className="admin-azioni">
        <button type="submit" className="psc-btn psc-btn--primary">Salva scheda</button>
      </div>
    </form>
  );
}
