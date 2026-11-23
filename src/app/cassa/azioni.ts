"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { conEsito, messaggioDb, spunta, testo, testoONull } from "@/lib/admin/form";
import { campiScheda, STATI_SOCIO } from "@/lib/admin/scheda";
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

/** Stessa funzione e stesse regole della scheda admin: le modifiche vanno anche a ReadyPro. */
export async function salvaSocioCassa(form: FormData) {
  const { supabase } = await richiediStaff();
  const id = testo(form, "id");
  const pagina = `/cassa/soci/${id}`;
  const stato = testo(form, "stato");
  if (!STATI_SOCIO.includes(stato)) redirect(conEsito(pagina, { errore: "Stato non valido." }));
  const { error } = await supabase.rpc("staff_aggiorna_socio", campiScheda(form, id, stato));
  revalidatePath(pagina);
  redirect(conEsito(pagina, error ? { errore: messaggioDb(error) } : { ok: "Scheda salvata: ReadyPro riceve le modifiche con il prossimo invio." }));
}

/** Unisce alla scheda aperta quella che ha la tessera indicata (stessa persona con due schede). */
export async function unisciSociCassa(form: FormData) {
  const { supabase } = await richiediStaff();
  const id = testo(form, "socio_id");
  const pagina = `/cassa/soci/${id}`;
  const codice = testo(form, "codice_altro").replace(/\s/g, "");
  const { error } = await supabase.rpc("staff_unisci_da_tessera", { p_tieni: id, p_codice: codice });
  revalidatePath(pagina);
  redirect(conEsito(pagina, error ? { errore: messaggioDb(error) } : { ok: `Scheda della tessera ${codice} unita a questa.` }));
}

// Scheda nata dall'app con il cellulare di una scheda senza email: si tiene quella con la tessera fisica.
export async function unisciDaAppCassa(form: FormData) {
  const { supabase } = await richiediStaff();
  const tieni = testo(form, "tieni");
  const { error } = await supabase.rpc("admin_unisci_soci", { p_tieni: tieni, p_togli: testo(form, "togli") });
  redirect(conEsito(`/cassa/soci/${error ? testo(form, "pagina") : tieni}`, error
    ? { errore: messaggioDb(error) }
    : { ok: "Schede unite: ora l'app mostra la tessera fisica e i punti, e ReadyPro riceve l'email con il prossimo invio." }));
}

export async function annullaUnioneCassa(form: FormData) {
  const { supabase } = await richiediStaff();
  const pagina = `/cassa/soci/${testo(form, "pagina")}`;
  const { error } = await supabase.rpc("admin_annulla_unione", { p_socio_id: testo(form, "id") });
  revalidatePath(pagina);
  redirect(conEsito(pagina, error
    ? { errore: messaggioDb(error) }
    : { ok: "Fatto: le due schede restano separate e la tessera digitale va a ReadyPro con il prossimo invio." }));
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
