"use server";

// Azioni dei moduli di accesso. La logica condivisa con /auth/callback è in flusso.ts.

import { redirect } from "next/navigation";
import { getSupabase } from "@/lib/dati";
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
  testo,
  utenteCorrente,
  type Attesa,
} from "./flusso";

export async function accedi(form: FormData) {
  const supabase = await getSupabase();
  if (!supabase) redirect("/home");
  const email = testo(form, "email").toLowerCase();
  if (!email) redirect(conErrore("/accedi", "Inserisci la tua email."));
  await mandaLink(supabase, email, leggiDopo(form.get("dopo")), "/accedi", true);
}

export async function verifica(form: FormData) {
  const supabase = await getSupabase();
  if (!supabase) redirect("/home");
  const email = testo(form, "email").toLowerCase();
  const dopo = leggiDopo(form.get("dopo"));
  const token = testo(form, "codice").replace(/\s/g, "");
  if (!token) redirect(conErrore("/verifica", "Inserisci il codice ricevuto via email.", { email, dopo }));

  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) redirect(conErrore("/verifica", messaggioAuth(error), { email, dopo }));
  redirect(await completaAccesso(supabase, dopo));
}

export async function collegaTessera(form: FormData) {
  const supabase = await getSupabase();
  if (!supabase) redirect("/home");
  // Il campo manda già 12 cifre; qui si completa comunque chi ne ha scritte meno.
  const scritto = testo(form, "tessera").replace(/\s/g, "");
  const numero = /^\d{1,12}$/.test(scritto) ? scritto.padStart(12, "0") : scritto;
  if (!numero) redirect(conErrore("/collega-tessera", "Inserisci il numero della tessera."));
  if (!/^\d{12}$/.test(numero)) redirect(conErrore("/collega-tessera", "Il numero della tessera ha 12 cifre: controlla di averlo scritto bene.", { tessera: numero }));

  if (await utenteCorrente(supabase)) redirect(await eseguiCollega(supabase, numero));

  const email = testo(form, "email").toLowerCase();
  if (!email) redirect(conErrore("/collega-tessera", "Inserisci l'email che hai lasciato in negozio.", { tessera: numero }));
  await salvaAttesa({ tipo: "collega", numero });
  await mandaLink(supabase, email, "collega", "/collega-tessera");
}

export async function iscriviti(form: FormData) {
  const supabase = await getSupabase();
  if (!supabase) redirect("/home");
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
  if (!attesa.nome || !attesa.cognome) redirect(conErrore("/iscriviti", "Nome e cognome sono obbligatori.", campi));
  if (!attesa.telefono) redirect(conErrore("/iscriviti", "Il numero di telefono è obbligatorio.", campi));
  // Gli stessi controlli li rifà il database: qui servono per avvisare prima di mandare l'email.
  if (!attesa.nascita) redirect(conErrore("/iscriviti", "La data di nascita è obbligatoria.", campi));
  if (!attesa.indirizzo) redirect(conErrore("/iscriviti", "L'indirizzo è obbligatorio.", campi));
  if (!/^\d{5}$/.test(attesa.cap)) redirect(conErrore("/iscriviti", "Il CAP è obbligatorio ed è fatto di 5 cifre.", campi));
  if (!attesa.citta) redirect(conErrore("/iscriviti", "La città è obbligatoria.", campi));
  if (form.get("privacy") !== "on") redirect(conErrore("/iscriviti", "Per iscriverti conferma di aver letto l'informativa privacy.", campi));

  if (await utenteCorrente(supabase)) redirect(await eseguiIscrizione(supabase, attesa));

  const email = testo(form, "email").toLowerCase();
  if (!email) redirect(conErrore("/iscriviti", "Inserisci la tua email.", campi));
  await salvaAttesa(attesa);
  await mandaLink(supabase, email, "iscriviti", "/iscriviti");
}

export async function esci() {
  const supabase = await getSupabase();
  await supabase?.auth.signOut();
  redirect("/");
}
