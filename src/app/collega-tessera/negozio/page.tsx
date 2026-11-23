import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthPage } from "@/components/AuthPage";
import { getSessione, getSupabase } from "@/lib/dati";
import { forma, getLingua, getTesti } from "@/lib/i18n";

export async function generateMetadata() {
  return { title: (await getTesti()).negozio.titoloPagina };
}
// Ogni visita crea un codice nuovo: niente cache.
export const dynamic = "force-dynamic";


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

  const t = await getTesti();
  const n = t.negozio;
  const ora = new Intl.DateTimeFormat(await getLingua(), { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" });
  return (
    <AuthPage
      eyebrow={t.collega.eyebrow}
      titolo={n.titolo}
      intro={n.intro}
      errore={errore}
      indietro="/collega-tessera"
    >
      {!errore && (
        <p className="codice-negozio" dir="ltr" aria-label={forma(n.codiceAria, { codice: codice.split("").join(" ") })}>{codice}</p>
      )}
      {!errore && <p className="psc-hint">{forma(n.vale, { ora: ora.format(new Date(scade)) })}</p>}
      <Link href="/home" className="psc-btn psc-btn--primary psc-btn--block">{n.fatto}</Link>
    </AuthPage>
  );
}
