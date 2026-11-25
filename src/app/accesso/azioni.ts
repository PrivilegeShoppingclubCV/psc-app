"use server";

// Azioni dei moduli di accesso. La logica condivisa con /auth/callback è in flusso.ts.

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_LINGUA, isLingua } from "@/lib/i18n/lingue";
import { getSupabase } from "@/lib/dati";
import { getLingua, getTesti } from "@/lib/i18n";
import {
  campiIscrizione,
  completaAccesso,
  conAvviso,
  conErrore,
  eseguiCollega,
  eseguiIscrizione,
  leggiDopo,
  mandaLink,
  messaggioAuth,
  salvaAttesa,
  salvaCodiceInviato,
  salvaLinguaUtente,
  testo,
  utenteCorrente,
  type Attesa,
} from "./flusso";
import { controllaTessera, leggiRecupero, salvaRecupero, soloNumeroTessera } from "./recupero";

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
  // Recupero: l'email è quella della tessera, che il socio non vede. Sta nel cookie cifrato.
  const recupero = form.get("recupero") === "1";
  const email = recupero ? ((await leggiRecupero())?.email ?? "") : testo(form, "email").toLowerCase();
  if (recupero && !email) redirect(conErrore("/collega-tessera", t.recuperoScaduto));
  const dopo = leggiDopo(form.get("dopo"));
  // Nell'indirizzo della pagina non deve mai finire l'email della tessera.
  const ritorno: Record<string, string> = recupero ? { recupero: "1", dopo } : { email, dopo };
  const token = testo(form, "codice").replace(/\s/g, "");
  if (!token) redirect(conErrore("/verifica", t.codice, ritorno));

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
    redirect(conErrore("/verifica", messaggioAuth(error, t), ritorno));
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

  // Solo numero: il codice va subito all'email della tessera.
  if (soloNumeroTessera()) await mandaCodiceTessera(supabase, numero);

  const email = testo(form, "email").toLowerCase();
  if (!email) redirect(conErrore("/collega-tessera", t.emailNegozio, { tessera: numero }));

  // Prima di mandare il codice si controlla che l'email sia quella della tessera.
  // (Senza chiave segreta sul server il controllo salta e si va avanti come prima.)
  const esito = await controllaTessera(numero, email, "controllo");
  if (esito?.esito === "non_trovata") redirect(conErrore("/collega-tessera", t.tesseraNonTrovata, { tessera: numero, email }));
  if (esito?.esito === "troppi_tentativi") redirect(conErrore("/collega-tessera", t.troppiTentativi, { tessera: numero, email }));
  if (esito?.esito === "senza_email") redirect(conAvviso("senza_email", numero, email));
  if (esito?.esito === "email_diversa") {
    await salvaRecupero({ numero, email: esito.email });
    redirect(conAvviso("email_diversa", numero, email));
  }
  await salvaAttesa({ tipo: "collega", numero });
  await mandaLink(supabase, email, "collega", "/collega-tessera");
}

/** "Manda il codice all'email della tessera": l'indirizzo lo sa solo il database. */
export async function inviaAllEmailTessera(form: FormData) {
  const supabase = await getSupabase();
  if (!supabase) redirect("/home");
  const t = (await getTesti()).errori;
  const numero = testo(form, "tessera");
  if (!/^\d{12}$/.test(numero)) redirect(conErrore("/collega-tessera", t.tessera));
  await mandaCodiceTessera(supabase, numero);
}

async function mandaCodiceTessera(supabase: NonNullable<Awaited<ReturnType<typeof getSupabase>>>, numero: string): Promise<never> {
  const t = (await getTesti()).errori;
  const esito = await controllaTessera(numero, null, "invio");
  if (esito?.esito === "troppi_tentativi") redirect(conErrore("/collega-tessera", t.troppiTentativi, { tessera: numero }));
  if (esito?.esito === "non_trovata") redirect(conErrore("/collega-tessera", t.tesseraNonTrovata, { tessera: numero }));
  // Scheda senza email: la sistemano in negozio controllando il gestionale.
  if (esito?.esito === "senza_email") redirect(conErrore("/collega-tessera", t.tesseraProblema, { tessera: numero }));
  if (esito?.esito !== "email_diversa") redirect(conErrore("/collega-tessera", t.generico, { tessera: numero }));

  // Chi era entrato con un'altra email esce (solo da questo telefono): si rientra con quella della tessera.
  if (await utenteCorrente(supabase)) await supabase.auth.signOut({ scope: "local" });
  const h = await headers();
  const origine = h.get("origin") ?? `https://${h.get("host")}`;
  const { error } = await supabase.auth.signInWithOtp({
    email: esito.email,
    options: { emailRedirectTo: `${origine}/auth/callback?dopo=collega`, shouldCreateUser: true, data: { lingua: await getLingua() } },
  });
  if (error) redirect(conErrore("/collega-tessera", messaggioAuth(error, t), { tessera: numero }));
  await salvaRecupero({ numero, email: esito.email });
  await salvaAttesa({ tipo: "collega", numero });
  await salvaCodiceInviato({ recupero: true, dopo: "collega" });
  redirect(`/verifica?${new URLSearchParams({ recupero: "1", dopo: "collega" })}`);
}

/**
 * Tessera senza email in negozio (o email della tessera che non si usa più):
 * si entra con l'email scritta e poi si collega la tessera alla cassa con il codice.
 */
export async function continuaConQuestaEmail(form: FormData) {
  const supabase = await getSupabase();
  if (!supabase) redirect("/home");
  const t = (await getTesti()).errori;
  if (await utenteCorrente(supabase)) redirect("/collega-tessera/negozio");
  const email = testo(form, "email").toLowerCase();
  if (!email) redirect(conErrore("/collega-tessera", t.emailNegozio, { tessera: testo(form, "tessera") }));
  await mandaLink(supabase, email, "negozio", "/collega-tessera");
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
  // Solo questo dispositivo. Senza "local" Supabase chiude le sessioni dell'account su
  // tutti i dispositivi (scope "global"): chi usa lo stesso account sul telefono, sul PC
  // o alla cassa si ritrovava fuori senza aver premuto Esci.
  await supabase?.auth.signOut({ scope: "local" });
  redirect("/");
}

/** Cambio lingua dal menu: cookie per un anno e, se si è dentro, anche nei dati dell'utente (email). */
export async function cambiaLingua(lingua: string) {
  if (!isLingua(lingua)) return;
  (await cookies()).set(COOKIE_LINGUA, lingua, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  const supabase = await getSupabase();
  if (supabase) await salvaLinguaUtente(supabase);
}
