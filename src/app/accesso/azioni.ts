"use server";

// Azioni dei moduli di accesso. La logica condivisa con /auth/callback è in flusso.ts.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_LINGUA, isLingua } from "@/lib/i18n/lingue";
import { getSupabase } from "@/lib/dati";
import { getTesti } from "@/lib/i18n";
import {
  campiIscrizione,
  completaAccesso,
  conErrore,
  eseguiCollega,
  eseguiIscrizione,
  leggiDopo,
  mandaLink,
  messaggioAuth,
  salvaAttesa,
  salvaLinguaUtente,
  testo,
  utenteCorrente,
  type Attesa,
} from "./flusso";

export async function accedi(form: FormData) {
  const supabase = await getSupabase();
  if (!supabase) redirect("/home");
  const t = (await getTesti()).errori;
  const email = testo(form, "email").toLowerCase();
  if (!email) redirect(conErrore("/accedi", t.email));
  await mandaLink(supabase, email, leggiDopo(form.get("dopo")), "/accedi", true);
}

export async function verifica(form: FormData) {
  const supabase = await getSupabase();
  if (!supabase) redirect("/home");
  const t = (await getTesti()).errori;
  const email = testo(form, "email").toLowerCase();
  const dopo = leggiDopo(form.get("dopo"));
  const token = testo(form, "codice").replace(/\s/g, "");
  if (!token) redirect(conErrore("/verifica", t.codice, { email, dopo }));

  let { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  // Iscrizione nuova: alcuni progetti Supabase accettano il codice di "Confirm signup"
  // solo come tipo signup. Un tentativo fallito non consuma il codice.
  if (error) ({ error } = await supabase.auth.verifyOtp({ email, token, type: "signup" }));
  if (error) {
    // Il codice si usa una volta sola: se il modulo è partito due volte (sesta cifra
    // e poi Invio o "Entra"), il secondo invio fallisce ma il primo ha già fatto
    // entrare. In quel caso si va avanti come se fosse andato bene.
    const user = await utenteCorrente(supabase);
    if (user?.email?.toLowerCase() === email) redirect(await completaAccesso(supabase, dopo));
    console.error("verifica codice", email.replace(/^(.).*@/, "$1***@"), error.code ?? error.message);
    redirect(conErrore("/verifica", messaggioAuth(error, t), { email, dopo }));
  }
  redirect(await completaAccesso(supabase, dopo));
}

export async function collegaTessera(form: FormData) {
  const supabase = await getSupabase();
  if (!supabase) redirect("/home");
  const t = (await getTesti()).errori;
  // Il campo manda già 12 cifre; qui si completa comunque chi ne ha scritte meno.
  const scritto = testo(form, "tessera").replace(/\s/g, "");
  const numero = /^\d{1,12}$/.test(scritto) ? scritto.padStart(12, "0") : scritto;
  if (!numero) redirect(conErrore("/collega-tessera", t.tessera));
  if (!/^\d{12}$/.test(numero)) redirect(conErrore("/collega-tessera", t.tessera12, { tessera: numero }));

  if (await utenteCorrente(supabase)) redirect(await eseguiCollega(supabase, numero));

  const email = testo(form, "email").toLowerCase();
  if (!email) redirect(conErrore("/collega-tessera", t.emailNegozio, { tessera: numero }));
  await salvaAttesa({ tipo: "collega", numero });
  await mandaLink(supabase, email, "collega", "/collega-tessera");
}

export async function iscriviti(form: FormData) {
  const supabase = await getSupabase();
  if (!supabase) redirect("/home");
  const t = (await getTesti()).errori;
  const attesa: Attesa = {
    tipo: "iscriviti",
    nome: testo(form, "nome"),
    cognome: testo(form, "cognome"),
    telefono: testo(form, "telefono"),
    nascita: testo(form, "nascita"),
    indirizzo: testo(form, "indirizzo"),
    cap: testo(form, "cap"),
    citta: testo(form, "citta"),
    invito: testo(form, "invito"),
    marketing: form.get("marketing") === "on",
  };
  const campi = campiIscrizione(attesa);
  if (!attesa.nome || !attesa.cognome) redirect(conErrore("/iscriviti", t.nomeCognome, campi));
  if (!attesa.telefono) redirect(conErrore("/iscriviti", t.telefono, campi));
  // Gli stessi controlli li rifà il database: qui servono per avvisare prima di mandare l'email.
  if (!attesa.nascita) redirect(conErrore("/iscriviti", t.nascita, campi));
  if (!attesa.indirizzo) redirect(conErrore("/iscriviti", t.indirizzo, campi));
  if (!/^\d{5}$/.test(attesa.cap)) redirect(conErrore("/iscriviti", t.cap, campi));
  if (!attesa.citta) redirect(conErrore("/iscriviti", t.citta, campi));
  if (form.get("privacy") !== "on") redirect(conErrore("/iscriviti", t.privacy, campi));

  if (await utenteCorrente(supabase)) redirect(await eseguiIscrizione(supabase, attesa));

  const email = testo(form, "email").toLowerCase();
  if (!email) redirect(conErrore("/iscriviti", t.email, campi));
  await salvaAttesa(attesa);
  await mandaLink(supabase, email, "iscriviti", "/iscriviti");
}

export async function esci() {
  const supabase = await getSupabase();
  await supabase?.auth.signOut();
  redirect("/");
}

/** Cambio lingua dal menu: cookie per un anno e, se si è dentro, anche nei dati dell'utente (email). */
export async function cambiaLingua(lingua: string) {
  if (!isLingua(lingua)) return;
  (await cookies()).set(COOKIE_LINGUA, lingua, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  const supabase = await getSupabase();
  if (supabase) await salvaLinguaUtente(supabase);
}
