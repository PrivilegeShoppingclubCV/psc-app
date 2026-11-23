// Accesso con codice di 6 cifre via email, collegamento della tessera, iscrizione, uscita.
// (Dal 2026-11-21 l'email non ha più il link: /auth/callback resta solo per le email vecchie.)
//
// L'email si verifica sempre prima di toccare la tessera: chi compila "Ho già la
// tessera" o "Voglio iscrivermi" senza aver fatto l'accesso riceve un link, e i
// dati del modulo aspettano in un cookie finché il link non viene aperto
// (/auth/callback). Il link funziona nel browser in cui è stato chiesto: l'app
// installata sulla schermata Home di iPhone ha cookie suoi, quindi lì resta
// possibile digitare il codice, se il modello dell'email lo contiene ({{ .Token }}).

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { getSupabase } from "@/lib/dati";
import { forma, getTesti } from "@/lib/i18n";
import type { Testi } from "@/lib/i18n/testi";

export type Supabase = NonNullable<Awaited<ReturnType<typeof getSupabase>>>;

/** Cosa fare dopo l'accesso. Solo valori noti: mai un indirizzo arbitrario. */
export type Dopo = "home" | "collega" | "iscriviti" | "admin";
export const leggiDopo = (v: unknown): Dopo => (v === "collega" || v === "iscriviti" || v === "admin" ? v : "home");

export const COOKIE_ATTESA = "psc_attesa";

export type Attesa =
  | { tipo: "collega"; numero: string }
  | {
      tipo: "iscriviti";
      nome: string;
      cognome: string;
      telefono: string;
      nascita: string;
      indirizzo: string;
      cap: string;
      citta: string;
      invito: string;
      marketing: boolean;
    };

/** Campi del modulo di iscrizione da rimettere nella pagina se qualcosa va storto. */
// (Un cookie salvato prima di questi campi può non averli: diventano vuoti.)
export const campiIscrizione = (a: Extract<Attesa, { tipo: "iscriviti" }>) => ({
  nome: a.nome ?? "",
  cognome: a.cognome ?? "",
  telefono: a.telefono ?? "",
  nascita: a.nascita ?? "",
  indirizzo: a.indirizzo ?? "",
  cap: a.cap ?? "",
  citta: a.citta ?? "",
  invito: a.invito ?? "",
});

export const testo = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
export const conErrore = (pagina: string, messaggio: string, extra: Record<string, string> = {}) =>
  `${pagina}?${new URLSearchParams({ ...extra, errore: messaggio })}`;

/** Messaggio per il socio, nella sua lingua, a partire da un errore di Supabase Auth. */
export function messaggioAuth(e: { message: string; code?: string; status?: number }, t: Testi["errori"]) {
  // Supabase lascia passare un'email ogni 60 secondi per indirizzo ("...only request this
  // after 42 seconds") e un tetto di email l'ora per tutto il progetto.
  const secondi = /after (\d+) seconds?/i.exec(e.message)?.[1];
  if (secondi) return forma(t.aspetta, { secondi });
  if (e.status === 429 || e.code === "over_email_send_rate_limit" || e.code === "over_request_rate_limit")
    return t.troppeEmail;
  if (e.code === "otp_expired" || e.code === "invalid_credentials" || /expired|invalid/i.test(e.message))
    return t.codiceSbagliato;
  if (e.code === "email_address_invalid" || /email/i.test(e.message)) return t.controllaEmail;
  return t.generico;
}

export async function salvaAttesa(attesa: Attesa) {
  (await cookies()).set(COOKIE_ATTESA, JSON.stringify(attesa), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 60,
  });
}

async function prendiAttesa(): Promise<Attesa | null> {
  const store = await cookies();
  const valore = store.get(COOKIE_ATTESA)?.value;
  if (!valore) return null;
  store.delete(COOKIE_ATTESA);
  try {
    return JSON.parse(valore) as Attesa;
  } catch {
    return null;
  }
}

export async function utenteCorrente(supabase: Supabase) {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/** Supabase risponde così quando l'email non ha un account e non se ne crea uno. */
const senzaAccount = (e: { message: string; code?: string }) =>
  e.code === "otp_disabled" || e.code === "user_not_found" || /signups? not allowed/i.test(e.message);

/**
 * Manda il link di accesso. Con `soloSeEsiste` (pagina "Accedi") non crea
 * account nuovi: chi non si è mai registrato torna al benvenuto, sulla scelta
 * "Ho già la tessera" / "Non ho una tessera".
 */
export async function mandaLink(supabase: Supabase, email: string, dopo: Dopo, pagina: string, soloSeEsiste = false): Promise<never> {
  const h = await headers();
  const origine = h.get("origin") ?? `https://${h.get("host")}`;
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origine}/auth/callback?dopo=${dopo}`, shouldCreateUser: !soloSeEsiste },
  });
  const t = (await getTesti()).errori;
  if (error && soloSeEsiste && senzaAccount(error)) {
    if (dopo === "admin") redirect(conErrore(pagina, t.senzaAccount, { email, dopo }));
    redirect(`/?${new URLSearchParams({ registrati: "1", email })}`);
  }
  if (error) redirect(conErrore(pagina, messaggioAuth(error, t), { email }));
  redirect(`/verifica?${new URLSearchParams({ email, dopo })}`);
}

/**
 * Registra nel pannello un collegamento o un'iscrizione non riusciti, con il
 * motivo. Se il registro non risponde si va avanti lo stesso.
 */
async function registraFallito(supabase: Supabase, tipo: "collegamento" | "iscrizione", campi: {
  numero?: string; messaggio: string; dati?: Record<string, string>;
}) {
  const { error } = await supabase.rpc("registra_tentativo_fallito", {
    p_tipo: tipo,
    p_numero_tessera: campi.numero ?? null,
    p_messaggio: campi.messaggio,
    p_dati: campi.dati ?? null,
  });
  if (error) console.error("registro tentativi", error.code ?? error.message);
}

export async function eseguiCollega(supabase: Supabase, numero: string): Promise<string> {
  const { error } = await supabase.rpc("collega_tessera", { p_numero_tessera: numero });
  if (error) await registraFallito(supabase, "collegamento", { numero, messaggio: error.message });
  return error ? conErrore("/collega-tessera", error.message, { tessera: numero }) : "/home";
}

export async function eseguiIscrizione(supabase: Supabase, a: Extract<Attesa, { tipo: "iscriviti" }>): Promise<string> {
  const h = await headers();
  const { error } = await supabase.rpc("iscriviti", {
    p_nome: a.nome,
    p_cognome: a.cognome,
    p_accetta_privacy: true,
    p_consenso_marketing: a.marketing,
    p_codice_invito: a.invito || null,
    p_user_agent: h.get("user-agent"),
    p_telefono: a.telefono,
    p_data_nascita: a.nascita || null,
    p_cap: a.cap || null,
    p_citta: a.citta || null,
    p_indirizzo: a.indirizzo || null,
  });
  if (error) {
    await registraFallito(supabase, "iscrizione", {
      messaggio: error.message,
      dati: { nome: a.nome, cognome: a.cognome, telefono: a.telefono },
    });
  }
  // Già socio con questa email (es. tessera fatta in negozio): niente seconda scheda,
  // si collega quella che ha.
  if (error?.hint === "gia_socio_email") return conErrore("/collega-tessera", error.message);
  return error ? conErrore("/iscriviti", error.message, campiIscrizione(a)) : "/home";
}

/** Dopo un accesso riuscito: completa il modulo rimasto in attesa e dice dove andare. */
export async function completaAccesso(supabase: Supabase, dopo: Dopo): Promise<string> {
  const attesa = await prendiAttesa();
  // Il modulo in attesa vale anche se "dopo" si è perso per strada (link dell'email
  // che torna alla Site URL o modello con {{ .TokenHash }}, che non lo porta).
  if (attesa?.tipo === "collega" && dopo !== "admin") return eseguiCollega(supabase, attesa.numero);
  if (attesa?.tipo === "iscriviti" && dopo !== "admin") return eseguiIscrizione(supabase, attesa);
  if (dopo === "admin") return "/admin";

  // Accesso semplice: chi non ha ancora una tessera collegata va a collegarla.
  const user = await utenteCorrente(supabase);
  const { data } = await supabase.from("soci").select("id").eq("user_id", user?.id ?? "").maybeSingle();
  if (data) return "/home";
  // Lo staff senza tessera va al pannello (che spiega se l'account non è admin).
  const { data: staff } = await supabase.from("staff").select("ruolo").eq("user_id", user?.id ?? "").maybeSingle();
  return staff ? "/admin" : "/collega-tessera";
}
