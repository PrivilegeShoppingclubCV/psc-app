import type { Metadata } from "next";
import Link from "next/link";
import { Campo, oggi, param } from "@/components/AuthPage";
import { IconIndietro } from "@/components/Icons";
import { PageHead } from "@/components/PageHead";
import { getRecapiti } from "@/lib/dati";
import { getSocio } from "@/lib/socio";
import { salvaRecapiti } from "../azioni";

export const metadata: Metadata = { title: "I tuoi dati" };

export default async function ModificaDati({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const socio = await getSocio();
  const r = await getRecapiti(socio.id);
  const errore = param(q.errore);
  // Dopo un errore il modulo mostra quello che il socio aveva scritto.
  const valore = (k: "telefono" | "nascita" | "cap" | "citta") => (errore ? param(q[k]) : r[k]);

  return (
    <>
      <Link href="/profilo" className="back-link"><IconIndietro /> Profilo</Link>
      <PageHead eyebrow="Profilo" titolo="Modifica i tuoi dati">
        <p className="t-body-l">I dati aggiornati arrivano anche alle casse dei negozi in pochi minuti.</p>
      </PageHead>
      {errore && <p className="notice notice--errore" role="alert">{errore}</p>}

      <form action={salvaRecapiti} className="modulo">
        <Campo id="telefono" label="Cellulare" type="tel" autoComplete="tel" inputMode="tel" required defaultValue={valore("telefono")} />
        <Campo id="nascita" label="Data di nascita (facoltativa)" type="date" autoComplete="bday" max={oggi()} defaultValue={valore("nascita")} />
        <Campo id="cap" label="CAP (facoltativo)" autoComplete="postal-code" inputMode="numeric" pattern="[0-9]{5}" maxLength={5} defaultValue={valore("cap")} />
        <Campo id="citta" label="Città (facoltativa)" autoComplete="address-level2" maxLength={80} defaultValue={valore("citta")} />
        <p className="t-caption">Per cambiare nome, cognome o email chiedi in negozio.</p>
        <button type="submit" className="psc-btn psc-btn--primary psc-btn--block">Salva</button>
      </form>
    </>
  );
}
