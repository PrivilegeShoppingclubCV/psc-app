import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthPage } from "@/components/AuthPage";
import { getSessione, getSupabase } from "@/lib/dati";

export const metadata: Metadata = { title: "Collega la tessera in negozio" };
// Ogni visita crea un codice nuovo: niente cache.
export const dynamic = "force-dynamic";

const ora = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" });

/**
 * Per chi ha la tessera fisica ma in negozio non ha lasciato un'email (o ne ha
 * lasciata un'altra): l'app mostra un codice di 6 caratteri, valido 15 minuti,
 * che il commesso scrive nella scheda del socio.
 */
export default async function CollegaInNegozio() {
  const { configurato, email, socio } = await getSessione();
  if (configurato && socio) redirect("/home");
  if (configurato && !email) redirect("/accedi?dopo=collega");

  const supabase = await getSupabase();
  let codice = "K7M2QX";
  let scade = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  let errore = "";
  if (supabase) {
    const { data, error } = await supabase.rpc("crea_codice_collegamento");
    if (error) errore = error.message;
    else ({ codice, scade_il: scade } = data as { codice: string; scade_il: string });
  }

  return (
    <AuthPage
      eyebrow="Ho già la tessera"
      titolo="Mostra questo codice in negozio"
      intro="Porta la tessera in negozio e fai vedere questo codice alla cassa: il commesso collega la tessera al tuo account e da lì in poi trovi qui punti e offerte."
      errore={errore}
      indietro="/collega-tessera"
    >
      {!errore && (
        <p className="codice-negozio" aria-label={`Codice ${codice.split("").join(" ")}`}>{codice}</p>
      )}
      {!errore && <p className="psc-hint">Vale fino alle {ora.format(new Date(scade))}. Se scade, ricarica la pagina per averne uno nuovo.</p>}
      <Link href="/home" className="psc-btn psc-btn--primary psc-btn--block">Fatto, apri l&apos;app</Link>
    </AuthPage>
  );
}
