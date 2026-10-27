import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { completaAccesso, leggiDopo } from "@/app/accesso/flusso";
import { getSupabase } from "@/lib/dati";

/**
 * Arrivo dal link dell'email, se il modello dell'email lo contiene.
 * Funziona nel browser in cui si apre il link; nell'app installata si usa il codice.
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

  if (error) redirect(`/accedi?${new URLSearchParams({ errore: "Il link è scaduto o è già stato usato: chiedi un nuovo codice." })}`);
  redirect(await completaAccesso(supabase, dopo));
}
