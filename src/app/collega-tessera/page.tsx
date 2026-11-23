import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthPage, Campo, param } from "@/components/AuthPage";
import { CampoTessera } from "@/components/CampoTessera";
import { getSessione } from "@/lib/dati";
import { collegaTessera, continuaConQuestaEmail, inviaAllEmailTessera } from "../accesso/azioni";
import { leggiRecupero, mascheraEmail, soloNumeroTessera } from "../accesso/recupero";
import { forma, getTesti, ricco } from "@/lib/i18n";

export async function generateMetadata() {
  return { title: (await getTesti()).collega.titoloPagina };
}

export default async function CollegaTessera({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const { configurato, email, socio } = await getSessione();
  if (configurato && socio) redirect("/home");
  // Accesso già fatto ma nessuna tessera collegata: basta il numero.
  const conAccesso = configurato && email !== null;
  const t = await getTesti();
  const c = t.collega;
  const r = t.recupero;

  // Riquadro "email sbagliata": l'email della tessera arriva dal cookie cifrato e si
  // mostra solo mascherata. Vale solo per il numero tessera controllato.
  const tessera = param(q.tessera);
  const recupero = param(q.avviso) === "email_diversa" ? await leggiRecupero() : null;
  // Con il modulo "solo numero" l'email della tessera si mostra per intero, così il
  // socio vede subito un refuso (scelta di Daniele, 2026-11-23); altrimenti mascherata.
  const soloNumero = soloNumeroTessera();
  const emailDiversa = recupero && recupero.numero === tessera
    ? (soloNumero ? recupero.email : mascheraEmail(recupero.email))
    : null;
  const senzaEmail = param(q.avviso) === "senza_email" && /^\d{12}$/.test(tessera);
  const emailScritta = param(q.email);
  // Strada di riserva: si entra con l'email scritta (o quella dell'accesso) e la tessera
  // si collega alla cassa con il codice di 6 caratteri.
  const alNegozio = (stile: string) => conAccesso
    ? <Link href="/collega-tessera/negozio" className={`psc-btn ${stile} psc-btn--block`}>{r.codiceNegozio}</Link>
    : emailScritta && (
      <form action={continuaConQuestaEmail}>
        <input type="hidden" name="tessera" value={tessera} />
        <input type="hidden" name="email" value={emailScritta} />
        <button type="submit" className={`psc-btn ${stile} psc-btn--block`}>
          {forma(r.continua, { email: emailScritta })}
        </button>
      </form>
    );

  return (
    <AuthPage
      eyebrow={c.eyebrow}
      titolo={c.titolo}
      intro={conAccesso
        ? ricco(c.introConAccesso, { email: <strong dir="ltr">{email}</strong> })
        : soloNumero ? c.introSoloNumero : c.intro}
      errore={param(q.errore)}
    >
      {emailDiversa && (
        <div className="notice notice--errore riquadro-recupero" role="alert">
          <p><strong>{r.titoloDiversa}</strong></p>
          <p>{ricco(r.testoDiversa, { email: <strong dir="ltr">{emailDiversa}</strong> })}</p>
          <form action={inviaAllEmailTessera}>
            <input type="hidden" name="tessera" value={tessera} />
            <button type="submit" className="psc-btn psc-btn--primary psc-btn--block">
              {forma(r.invia, { email: emailDiversa })}
            </button>
          </form>
          <p>{r.nonUsoPiu}</p>
          {alNegozio("psc-btn--secondary")}
        </div>
      )}
      {senzaEmail && (
        <div className="notice notice--errore riquadro-recupero" role="alert">
          <p><strong>{r.titoloSenza}</strong></p>
          <p>{r.testoSenza}</p>
          {alNegozio("psc-btn--primary")}
        </div>
      )}
      <form action={collegaTessera}>
        <CampoTessera id="tessera" label={c.numero} required={configurato} defaultValue={tessera} help={c.numeroAiuto} />
        {!conAccesso && !soloNumero && <Campo id="email" label={t.comune.email} type="email" dir="ltr" autoComplete="email" required={configurato} defaultValue={param(q.email)} />}
        <button type="submit" className="psc-btn psc-btn--primary psc-btn--block">{t.comune.continua}</button>
      </form>
      {conAccesso && (
        <>
          <Link href="/collega-tessera/negozio" className="psc-btn psc-btn--secondary">{c.altraEmail}</Link>
          <Link href="/iscriviti" className="psc-btn psc-btn--ghost">{c.nonHaiTessera}</Link>
        </>
      )}
    </AuthPage>
  );
}
