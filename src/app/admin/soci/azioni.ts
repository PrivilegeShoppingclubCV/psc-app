"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { conEsito, intero, messaggioDb, spunta, testo, testoONull } from "@/lib/admin/form";
import { richiediAdmin } from "@/lib/admin/sessione";

const STATI = ["attivo", "sospeso", "cessato", "in_attesa"];

export async function salvaSocio(form: FormData) {
  const { supabase } = await richiediAdmin();
  const id = testo(form, "id");
  const pagina = `/admin/soci/${id}`;
  const stato = testo(form, "stato");
  const dataNascita = testo(form, "data_nascita");
  if (!STATI.includes(stato)) redirect(conEsito(pagina, { errore: "Stato non valido." }));

  // L'email passa da admin_cambia_email: se il socio ha l'app cambia anche
  // l'email con cui accede, e l'import da ReadyPro non rimette quella vecchia.
  const email = testoONull(form, "email")?.toLowerCase() ?? null;
  const { data: prima } = await supabase.from("soci").select("email").eq("id", id).maybeSingle();
  if (email !== (prima?.email?.trim().toLowerCase() ?? null)) {
    const { error: errEmail } = await supabase.rpc("admin_cambia_email", { p_socio_id: id, p_email: email });
    if (errEmail) redirect(conEsito(pagina, { errore: messaggioDb(errEmail) }));
  }

  const { error } = await supabase.from("soci").update({
    nome: testoONull(form, "nome"),
    cognome: testoONull(form, "cognome"),
    telefono: testoONull(form, "telefono"),
    data_nascita: dataNascita || null,
    indirizzo: testoONull(form, "indirizzo"),
    cap: testoONull(form, "cap"),
    citta: testoONull(form, "citta"),
    livello: testo(form, "livello") || "classic",
    stato,
    negozio_preferito_id: testo(form, "negozio_preferito_id") || null,
  }).eq("id", id);
  revalidatePath(pagina);
  redirect(conEsito(pagina, error ? { errore: messaggioDb(error) } : { ok: "Scheda salvata." }));
}

const TIPI_MANUALI = ["bonus", "rettifica", "acquisto", "storno"];

export async function registraPunti(form: FormData) {
  const { supabase, userId } = await richiediAdmin();
  const id = testo(form, "socio_id");
  const pagina = `/admin/soci/${id}`;
  const tipo = testo(form, "tipo");
  const premioId = testo(form, "premio_id");

  let riga: Record<string, unknown>;
  if (tipo === "riscatto") {
    const { data: premio } = await supabase.from("premi").select("id, nome, soglia_punti").eq("id", premioId).maybeSingle();
    if (!premio) redirect(conEsito(pagina, { errore: "Scegli il premio da riscattare." }));
    riga = { tipo, punti: -premio.soglia_punti, premio_id: premio.id, descrizione: `${premio.nome} riscattato` };
  } else {
    const punti = intero(form, "punti");
    if (!TIPI_MANUALI.includes(tipo)) redirect(conEsito(pagina, { errore: "Tipo di movimento non valido." }));
    if (!punti || Number.isNaN(punti)) redirect(conEsito(pagina, { errore: "Indica i punti come numero intero diverso da zero (negativo per toglierli)." }));
    riga = { tipo, punti, descrizione: testoONull(form, "descrizione") };
  }

  const { error } = await supabase.from("movimenti_punti").insert({
    ...riga,
    socio_id: id,
    negozio_id: testo(form, "negozio_id") || null,
    fonte: "admin",
    creato_da: userId,
  });
  revalidatePath(pagina);
  redirect(conEsito(pagina, error ? { errore: messaggioDb(error) } : { ok: "Movimento registrato." }));
}

export async function scollegaAccount(form: FormData) {
  const { supabase } = await richiediAdmin();
  const id = testo(form, "id");
  const { error } = await supabase.from("soci").update({ user_id: null }).eq("id", id);
  redirect(conEsito(`/admin/soci/${id}`, error
    ? { errore: messaggioDb(error) }
    : { ok: "Account scollegato: la tessera si può ricollegare dall'app con numero ed email." }));
}

// Tessere: le regole (magazzino, una fisica attiva, blocco) stanno nelle funzioni
// del database, qui si passano solo i campi e si mostra l'esito.

export async function nuovoSocioFisica(form: FormData) {
  const { supabase } = await richiediAdmin();
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
  if (error) redirect(conEsito(`/admin/soci/nuovo?${new URLSearchParams(campi)}`, { errore: messaggioDb(error) }));
  revalidatePath("/admin/soci");
  redirect(conEsito(`/admin/soci/${(data as { id: string }).id}`, { ok: `Socio creato con la tessera ${campi.codice}. ReadyPro la riceve con il prossimo invio.` }));
}

export async function assegnaTesseraFisica(form: FormData) {
  const { supabase } = await richiediAdmin();
  const id = testo(form, "socio_id");
  const pagina = `/admin/soci/${id}`;
  const { error } = await supabase.rpc("staff_assegna_tessera_fisica", {
    p_socio_id: id,
    p_codice: testo(form, "codice_fisica"),
    p_motivo_sostituzione: testoONull(form, "motivo"),
  });
  revalidatePath(pagina);
  redirect(conEsito(pagina, error ? { errore: messaggioDb(error) } : { ok: "Tessera fisica consegnata: ReadyPro la riceve con il prossimo invio." }));
}

export async function bloccaTessera(form: FormData) {
  const { supabase } = await richiediAdmin();
  const pagina = `/admin/soci/${testo(form, "socio_id")}`;
  const { error } = await supabase.rpc("staff_blocca_tessera", { p_tessera_id: testo(form, "tessera_id"), p_motivo: testo(form, "motivo") });
  revalidatePath(pagina);
  redirect(conEsito(pagina, error ? { errore: messaggioDb(error) } : { ok: "Tessera bloccata. Bloccala anche in ReadyPro." }));
}

export async function collegaConCodice(form: FormData) {
  const { supabase } = await richiediAdmin();
  const id = testo(form, "id");
  const pagina = `/admin/soci/${id}`;
  const { error } = await supabase.rpc("staff_collega_account", { p_socio_id: id, p_codice: testo(form, "codice") });
  revalidatePath(pagina);
  redirect(conEsito(pagina, error ? { errore: messaggioDb(error) } : { ok: "App collegata: il socio ora vede tessera e punti." }));
}

export async function unisciSoci(form: FormData) {
  const { supabase } = await richiediAdmin();
  const id = testo(form, "socio_id");
  const pagina = `/admin/soci/${id}`;
  const codice = testo(form, "codice_altro").replace(/\s/g, "");
  const { data: altra } = await supabase.from("tessere").select("socio_id").eq("codice", codice).maybeSingle();
  if (!altra?.socio_id) redirect(conEsito(pagina, { errore: `Nessun socio ha la tessera ${codice}.` }));
  const { error } = await supabase.rpc("admin_unisci_soci", { p_tieni: id, p_togli: altra.socio_id });
  revalidatePath("/admin/soci");
  redirect(conEsito(pagina, error ? { errore: messaggioDb(error) } : { ok: `Scheda della tessera ${codice} unita a questa.` }));
}

// Scheda nata dall'app con il cellulare di una scheda senza email (vedi
// "da_unire_con"): si tiene quella con la tessera fisica.
export async function unisciDaApp(form: FormData) {
  const { supabase } = await richiediAdmin();
  const tieni = testo(form, "tieni");
  const { error } = await supabase.rpc("admin_unisci_soci", { p_tieni: tieni, p_togli: testo(form, "togli") });
  revalidatePath("/admin/soci");
  redirect(conEsito(`/admin/soci/${error ? testo(form, "pagina") : tieni}`, error
    ? { errore: messaggioDb(error) }
    : { ok: "Schede unite: ora l'app mostra la tessera fisica e i punti, e ReadyPro riceve l'email con il prossimo invio." }));
}

export async function annullaUnione(form: FormData) {
  const { supabase } = await richiediAdmin();
  const pagina = `/admin/soci/${testo(form, "pagina")}`;
  const { error } = await supabase.rpc("admin_annulla_unione", { p_socio_id: testo(form, "id") });
  revalidatePath(pagina);
  redirect(conEsito(pagina, error
    ? { errore: messaggioDb(error) }
    : { ok: "Fatto: le due schede restano separate e la tessera digitale va a ReadyPro con il prossimo invio." }));
}
