import { formatPunti } from "@/lib/format";
import { prossimoPremio, type Premio } from "@/lib/tipi";

export function SaldoPunti({ saldo, premi }: { saldo: number; premi: Premio[] }) {
  const premio = prossimoPremio(premi, saldo);

  return (
    <div className="psc-points">
      <div className="psc-points__top">
        <span className="psc-points__value">{formatPunti(saldo)}</span>
        <span className="psc-points__unit">Punti</span>
      </div>
      {premio && <Avanzamento saldo={saldo} premio={premio} />}
    </div>
  );
}

function Avanzamento({ saldo, premio }: { saldo: number; premio: Premio }) {
  const mancano = Math.max(premio.soglia - saldo, 0);
  const percentuale = Math.max(0, Math.min(100, Math.round((saldo / premio.soglia) * 100)));

  return (
    <>
      <div
        className="psc-progress"
        role="progressbar"
        aria-label={`Avanzamento verso ${premio.nome}`}
        aria-valuemin={0}
        aria-valuemax={premio.soglia}
        aria-valuenow={Math.max(0, Math.min(saldo, premio.soglia))}
      >
        <span style={{ width: `${percentuale}%` }} />
      </div>
      <p className="psc-points__next">
        {mancano > 0 ? (
          <>Ancora <strong>{formatPunti(mancano)} punti</strong> per il {premio.nome.toLowerCase()}</>
        ) : (
          <>Hai raggiunto il <strong>{premio.nome.toLowerCase()}</strong>: chiedilo in cassa</>
        )}
      </p>
    </>
  );
}
