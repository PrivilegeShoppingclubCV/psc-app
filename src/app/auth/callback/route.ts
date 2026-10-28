import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { completaAccesso, leggiDopo } from "@/app/accesso/flusso";
import { getSupabase } from "@/lib/dati";

/**
 * Arrivo dal link dell'email (magic link).
 * Con il modello standard di Supabase arriva "code": vale solo nel browser in cui
 * è stato chiesto il link, perché la verifica usa un cookie salvato lì.
 * Con un modello che usa {{ .TokenHash }} arriva "token_hash", che vale ovunque.
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
    // Link aperto in un browser diverso da quello in cui è stato chiesto (es. Gmail
    // che apre il suo browser interno): manca il cookie della verifica.
    const altroBrowser = code && /code verifier/i.test(error.message);
    const errore = altroBrowser
      ? "Apri il link nello stesso browser in cui l'hai chiesto, oppure chiedine uno nuovo da qui."
      : "Il link è scaduto o è già stato usato: chiedine uno nuovo.";
    redirect(`/accedi?${new URLSearchParams({ errore })}`);
  }
  redirect(await completaAccesso(supabase, dopo));
}
