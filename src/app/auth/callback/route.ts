import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { completaAccesso, leggiDopo } from "@/app/accesso/flusso";
import { getSupabase } from "@/lib/dati";

/**
 * Arrivo dal link dell'email (magic link).
 * - "token_hash": modello supabase/templates/accesso.html, il link punta qui
 *   direttamente. Vale in qualsiasi browser.
 * - "code": modello standard di Supabase ({{ .ConfirmationURL }}). Vale solo nel
 *   browser e nel dominio in cui è stato chiesto il link, perché la verifica
 *   (PKCE) usa un cookie salvato lì, e solo con l'ultima email chiesta.
 */
export async function GET(request: NextRequest) {
  const supabase = await getSupabase();
  if (!supabase) redirect("/home");

  const params = request.nextUrl.searchParams;
  const dopo = leggiDopo(params.get("dopo"));
  const code = params.get("code");
  const tokenHash = params.get("token_hash");

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type: (params.get("type") ?? "email") as EmailOtpType })
      : { error: new Error("Link incompleto") };

  if (error) {
    console.error("auth/callback:", error.message);
    // Manca il cookie della verifica: link aperto in un altro browser (es. quello
    // interno di Gmail) o chiesto da un altro indirizzo dell'app (anteprima Vercel).
    const altroBrowser = code && /non-empty|missing/i.test(error.message);
    // Il cookie c'è ma è di una richiesta più recente: è stata usata un'email vecchia.
    const emailVecchia = code && /does not match|code verifier/i.test(error.message);
    const errore = altroBrowser
      ? "Apri il link nello stesso browser, e dallo stesso indirizzo dell'app, in cui l'hai chiesto. Oppure chiedine uno nuovo da qui."
      : emailVecchia
        ? "Hai usato un'email precedente: apri il link dell'ultima email ricevuta, oppure chiedine uno nuovo da qui."
        : "Il link è scaduto o è già stato usato: chiedine uno nuovo.";
    redirect(`/accedi?${new URLSearchParams({ errore })}`);
  }
  redirect(await completaAccesso(supabase, dopo));
}
