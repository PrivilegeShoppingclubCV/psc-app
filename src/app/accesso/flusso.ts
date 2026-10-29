// Accesso con link via email (magic link), collegamento della tessera, iscrizione, uscita.
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

export type Supabase = NonNullable<Awaited<ReturnType<typeof getSupabase>>>;

/** Cosa fare dopo l'accesso. Solo valori noti: mai un indirizzo arbitrario. */
export type Dopo = "home" | "collega" | "iscriviti" | "admin";
export const leggiDopo = (v: unknown): Dopo => (v === "collega" || v === "iscriviti" || v === "admin" ? v : "home");

export const COOKIE_ATTESA = "psc_attesa";

export type Attesa =
  | { tipo: "collega"; numero: string }
  | { tipo: "iscriviti"; nome: string; cognome: string; invito: string; marketing: boolean };

export const testo = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
export const conErrore = (pagina: string, messaggio: string, extra: Record<string, string> = {}) =>
  `${pagina}?${new URLSearchParams({ ...extra, errore: messaggio })}`;

export function messaggioAuth(e: { message: string; code?: string; status?: number }) {
  // Supabase lascia passare un'email ogni 60 secondi per indirizzo ("...only request this
  // after 42 seconds") e un tetto di email l'ora per tutto il progetto.
  const secondi = /after (\d+) seconds?/i.exec(e.message)?.[1];
  if (secondi) return `Ti abbiamo appena mandato un'email: aspetta ${secondi} secondi prima di chiederne un'altra.`;
  if (e.status === 429 || e.code === "over_email_send_rate_limit" || e.code === "over_request_rate_limit")
    return "Sono state chieste troppe email di accesso: riprova tra qualche minuto.";
  if (e.code === "otp_expired" || e.code === "invalid_credentials" || /expired|invalid/i.test(e.message))
    return "Link o codice scaduto: chiedi una nuova email e usa l'ultima che ricevi.";
  if (e.code === "email_address_invalid" || /email/i.test(e.message)) return "Controlla l'indirizzo email.";
  return "Qualcosa non ha funzionato. Riprova tra poco.";
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

export async function mandaLink(supabase: Supabase, email: string, dopo: Dopo, pagina: string): Promise<never> {
  const h = await headers();
  const origine = h.get("origin") ?? `https://${h.get("host")}`;
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origine}/auth/callback?dopo=${dopo}` },
  });
  if (error) redirect(conErrore(pagina, messaggioAuth(error), { email }));
  redirect(`/verifica?${new URLSearchParams({ email, dopo })}`);
}

export async function eseguiCollega(supabase: Supabase, numero: string): Promise<string> {
  const { error } = await supabase.rpc("collega_tessera", { p_numero_tessera: numero });
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
  });
  return error ? conErrore("/iscriviti", error.message, { nome: a.nome, cognome: a.cognome, invito: a.invito }) : "/home";
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
