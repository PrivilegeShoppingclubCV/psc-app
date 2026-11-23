import { testo, testoONull } from "./form";

/** Parametri di staff_aggiorna_socio letti dal modulo della scheda (admin e /cassa). */
export function campiScheda(form: FormData, id: string, stato: string) {
  return {
    p_id: id,
    p_nome: testoONull(form, "nome"),
    p_cognome: testoONull(form, "cognome"),
    p_email: testoONull(form, "email")?.toLowerCase() ?? null,
    p_telefono: testoONull(form, "telefono"),
    p_data_nascita: testo(form, "data_nascita") || null,
    p_indirizzo: testoONull(form, "indirizzo"),
    p_cap: testoONull(form, "cap"),
    p_citta: testoONull(form, "citta"),
    p_livello: testo(form, "livello") || "classic",
    p_stato: stato,
    p_negozio_preferito_id: testo(form, "negozio_preferito_id") || null,
  };
}

export const STATI_SOCIO = ["attivo", "sospeso", "cessato", "in_attesa"];
