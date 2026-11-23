"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { conEsito, messaggioDb, spunta, testo, testoONull } from "@/lib/admin/form";
import { richiediStaff } from "./sessione";

// Azioni dell'area operatori. Ognuna chiama una funzione del database che
// controlla da sola chi la usa (personale dei negozi) e cosa si può cambiare.

/** Il commesso segna il buono come usato. Il database rifiuta buoni usati, annullati o scaduti. */
export async function usaBuono(form: FormData) {
  const { supabase } = await richiediStaff();
  const codice = testo(form, "codice");
  const negozio = testo(form, "negozio");
  const { error } = await supabase.rpc("usa_buono", { p_codice: codice, p_negozio_id: negozio || null });
  const q = new URLSearchParams({ codice });
  if (error) q.set("errore", error.message);
  else q.set("usato", "1");
  redirect(`/cassa?${q}`);
}

/** Dati anagrafici del socio. Livello, stato, punti ed email di chi ha l'app restano all'amministrazione. */
export async function salvaSocioCassa(form: FormData) {
  const { supabase } = await richiediStaff();
  const id = testo(form, "id");
  const pagina = `/cassa/soci/${id}`;
  const { error } = await supabase.rpc("personale_aggiorna_socio", {
    p_id: id,
    p_nome: testo(form, "nome"),
    p_cognome: testo(form, "cognome"),
    p_email: testoONull(form, "email"),
    p_telefono: testoONull(form, "telefono"),
    p_data_nascita: testo(form, "data_nascita") || null,
    p_indirizzo: testoONull(form, "indirizzo"),
    p_cap: testoONull(form, "cap"),
    p_citta: testoONull(form, "citta"),
    p_negozio_preferito_id: testo(form, "negozio_preferito_id") || null,
  });
  revalidatePath(pagina);
  redirect(conEsito(pagina, error ? { errore: messaggioDb(error) } : { ok: "Scheda salvata. Ricorda di correggere i dati anche in ReadyPro." }));
}

export async function nuovoSocioCassa(form: FormData) {
  const { supabase } = await richiediStaff();
  const campi = Object.fromEntries(["codice", "nome", "cognome", "telefono", "email", "data_nascita", "negozio_id"].map((k) => [k, testo(form, k)]));
  const { data, error } = await supabase.rpc("staff_nuovo_socio_fisica", {
    p_codice: campi.codice,
    p_nome: campi.nome,
    p_cognome: campi.cognome,
    p_privacy_firmata: spunta(form, "privacy"),
    p_consenso_marketing: spunta(form, "marketing"),
    p_telefono: campi.telefono || null,
    p_email: campi.email || null,
    p_data_nascita: campi.data_nascita || null,
    p_negozio_id: campi.negozio_id || null,
  });
  if (error) redirect(conEsito(`/cassa/soci/nuovo?${new URLSearchParams(campi)}`, { errore: messaggioDb(error) }));
  redirect(conEsito(`/cassa/soci/${(data as { id: string }).id}`, { ok: `Socio creato con la tessera ${campi.codice}. ReadyPro la riceve con il prossimo invio.` }));
}

export async function assegnaTesseraCassa(form: FormData) {
  const { supabase } = await richiediStaff();
  const id = testo(form, "socio_id");
  const pagina = `/cassa/soci/${id}`;
  const { error } = await supabase.rpc("staff_assegna_tessera_fisica", {
    p_socio_id: id,
    p_codice: testo(form, "codice_fisica"),
    p_motivo_sostituzione: testoONull(form, "motivo"),
  });
  revalidatePath(pagina);
  redirect(conEsito(pagina, error ? { errore: messaggioDb(error) } : { ok: "Tessera fisica consegnata: ReadyPro la riceve con il prossimo invio." }));
}

export async function bloccaTesseraCassa(form: FormData) {
  const { supabase } = await richiediStaff();
  const id = testo(form, "socio_id");
  const pagina = `/cassa/soci/${id}`;
  const { error } = await supabase.rpc("staff_blocca_tessera", { p_tessera_id: testo(form, "tessera_id"), p_motivo: testo(form, "motivo") });
  revalidatePath(pagina);
  redirect(conEsito(pagina, error ? { errore: messaggioDb(error) } : { ok: "Tessera bloccata. Bloccala anche in ReadyPro." }));
}
