"use client";

import { useActionState } from "react";
import { creaChiave, type EsitoChiave } from "./azioni";

export function CreaChiave() {
  const [esito, azione, inCorso] = useActionState<EsitoChiave, FormData>(creaChiave, null);
  return (
    <div className="psc-stack">
      <form action={azione} className="admin-cerca">
        <div className="psc-field">
          <label className="psc-field__label" htmlFor="nome-chiave">Nome della chiave</label>
          <input id="nome-chiave" name="nome" className="psc-field__input" placeholder="Server negozi" />
        </div>
        <button type="submit" className="psc-btn psc-btn--primary" disabled={inCorso}>{inCorso ? "Creo…" : "Crea chiave"}</button>
      </form>
      {esito?.errore && <p className="notice notice--errore" role="alert">{esito.errore}</p>}
      {esito?.chiave && (
        <div className="notice notice--ok" role="status">
          <p style={{ margin: 0 }}>Copia la chiave adesso e mettila nel file di configurazione dello script: non si potrà più rivedere.</p>
          <p className="admin-chiave">{esito.chiave}</p>
        </div>
      )}
    </div>
  );
}
