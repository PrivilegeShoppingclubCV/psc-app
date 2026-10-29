import type { Metadata } from "next";
import { param } from "@/components/AuthPage";
import { EsciButton } from "@/components/EsciButton";
import { PageHead } from "@/components/PageHead";
import { formatData, formatTessera } from "@/lib/format";
import { getSocio } from "@/lib/socio";
import { attivaTesseraDigitale } from "./azioni";

export const metadata: Metadata = { title: "Profilo" };

export default async function Profilo({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [socio, q] = await Promise.all([getSocio(), searchParams]);
  const errore = param(q.errore);

  return (
    <>
      <PageHead eyebrow={`Livello ${socio.livello}`} titolo={`${socio.nome} ${socio.cognome}`.trim() || "Il tuo profilo"} />

      <section className="section" aria-labelledby="dati">
        <h2 id="dati" className="t-title">I tuoi dati</h2>
        <ul className="list">
          <li><span className="t-caption">Email</span><span>{socio.email}</span></li>
          {socio.tessere.map((t) => (
            <li key={t.codice}>
              <span className="t-caption">Tessera {t.tipo}</span>
              <span className="psc-code">{formatTessera(t.codice)}{t.inAttivazione ? " · in attivazione" : ""}</span>
            </li>
          ))}
          <li><span className="t-caption">Socio dal</span><span>{formatData(socio.iscrittoDal)}</span></li>
        </ul>
      </section>

      {!socio.tessere.some((t) => t.tipo === "digitale") && (
        <section className="section" aria-labelledby="digitale">
          <h2 id="digitale" className="t-title">Tessera digitale</h2>
          <p className="psc-hint">
            Oltre alla tessera di plastica puoi avere una tessera digitale, con un codice suo, da mostrare in cassa dal telefono.
            I punti sono gli stessi.
          </p>
          {errore && <p className="notice notice--errore" role="alert">{errore}</p>}
          <form action={attivaTesseraDigitale}>
            <button type="submit" className="psc-btn psc-btn--secondary psc-btn--block">Attiva la tessera digitale</button>
          </form>
        </section>
      )}

      <section className="section" aria-labelledby="invita">
        <div className="psc-referral">
          <span className="psc-referral__eyebrow">Invita un amico</span>
          <h2 id="invita" className="psc-referral__title">Il tuo codice invito</h2>
          <p className="psc-referral__text">Chi si iscrive con il tuo codice risulta invitato da te. I punti per gli inviti arrivano con la prossima versione.</p>
          <div className="psc-referral__code">
            <span className="psc-code">{socio.codiceInvito}</span>
          </div>
        </div>
      </section>

      <EsciButton />
    </>
  );
}
