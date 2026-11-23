import { forma, getFormati, getTestiClub, ricco } from "@/lib/i18n";
import type { TestiClub } from "@/lib/i18n/testi";
import type { Formati } from "@/lib/i18n/formati";
import { prossimoPremio, type Premio } from "@/lib/tipi";

export async function SaldoPunti({ saldo, premi }: { saldo: number; premi: Premio[] }) {
  const premio = prossimoPremio(premi, saldo);
  const f = await getFormati();
  const t = (await getTestiClub()).client.saldo;

  return (
    <div className="psc-points">
      <div className="psc-points__top">
        <span className="psc-points__value">{f.punti(saldo)}</span>
        <span className="psc-points__unit">{t.unita}</span>
      </div>
      {premio && <Avanzamento saldo={saldo} premio={premio} f={f} t={t} />}
    </div>
  );
}

function Avanzamento({ saldo, premio, f, t }: { saldo: number; premio: Premio; f: Formati; t: TestiClub["client"]["saldo"] }) {
  const valori = { premio: premio.nome };
  // <bdi>: il nome del premio (es. "Buono da 15 €") resta intero anche dentro una frase in arabo.
  const nomi = { premio: <bdi>{premio.nome}</bdi> };
  const mancano = Math.max(premio.soglia - saldo, 0);
  const percentuale = Math.max(0, Math.min(100, Math.round((saldo / premio.soglia) * 100)));

  return (
    <>
      <div
        className="psc-progress"
        role="progressbar"
        aria-label={forma(t.avanzamento, valori)}
        aria-valuemin={0}
        aria-valuemax={premio.soglia}
        aria-valuenow={Math.max(0, Math.min(saldo, premio.soglia))}
      >
        <span style={{ width: `${percentuale}%` }} />
      </div>
      <p className="psc-points__next">
        {mancano > 0 ? ricco(forma(t.mancano, { punti: f.punti(mancano) }), nomi) : ricco(t.raggiunto, nomi)}
      </p>
    </>
  );
}
