import type { Metadata } from "next";
import Link from "next/link";
import { Campo, oggi, param } from "@/components/AuthPage";
import { IconIndietro } from "@/components/Icons";
import { PageHead } from "@/components/PageHead";
import { getRecapiti } from "@/lib/dati";
import { getSocio } from "@/lib/socio";
import { salvaRecapiti } from "../azioni";
import { CampoData } from "@/components/CampoData";

export const metadata: Metadata = { title: "I tuoi dati" };

export default async function ModificaDati({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const socio = await getSocio();
  const r = await getRecapiti(socio.id);
  const errore = param(q.errore);
  // Dopo un errore il modulo mostra quello che il socio aveva scritto.
  const valore = (k: "telefono" | "nascita" | "indirizzo" | "cap" | "citta") => (errore ? param(q[k]) : r[k]);
  const nome = errore ? param(q.nome) : socio.nome;
  const cognome = errore ? param(q.cognome) : socio.cognome;

  return (
    <>
      <Link href="/profilo" className="back-link"><IconIndietro /> Profilo</Link>
      <PageHead eyebrow="Profilo" titolo="Modifica i tuoi dati">
        <p className="t-body-l">I dati aggiornati arrivano anche alle casse dei negozi in pochi minuti.</p>
      </PageHead>
      {errore && <p className="notice notice--errore" role="alert">{errore}</p>}

      <form action={salvaRecapiti} className="modulo">
        <Campo id="nome" label="Nome" autoComplete="given-name" maxLength={80} required defaultValue={nome} />
        <Campo id="cognome" label="Cognome" autoComplete="family-name" maxLength={80} required defaultValue={cognome} help="Scrivili come sul documento d'identità." />
        <Campo id="telefono" label="Cellulare" type="tel" autoComplete="tel" inputMode="tel" required defaultValue={valore("telefono")} />
        <CampoData id="nascita" label="Data di nascita" autoComplete="bday" max={oggi()} required defaultValue={valore("nascita")} />
        <Campo id="indirizzo" label="Indirizzo" autoComplete="street-address" maxLength={120} required defaultValue={valore("indirizzo")} help="Via e numero civico." />
        <Campo id="cap" label="CAP" autoComplete="postal-code" inputMode="numeric" pattern="[0-9]{5}" maxLength={5} required defaultValue={valore("cap")} />
        <Campo id="citta" label="Città" autoComplete="address-level2" maxLength={80} required defaultValue={valore("citta")} />
        <p className="t-caption">L&apos;email non si cambia da qui: se è sbagliata, <Link href="/profilo/segnala?campo=email">segnalacelo</Link>.</p>
        <button type="submit" className="psc-btn psc-btn--primary psc-btn--block">Salva</button>
      </form>
    </>
  );
}
