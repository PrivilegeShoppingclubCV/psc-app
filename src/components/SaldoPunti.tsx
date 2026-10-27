import { formatPunti } from "@/lib/format";
import { prossimoPremio } from "@/lib/mock-data";

export function SaldoPunti({ saldo }: { saldo: number }) {
  const premio = prossimoPremio(saldo);
  const mancano = Math.max(premio.soglia - saldo, 0);
  const percentuale = Math.min(100, Math.round((saldo / premio.soglia) * 100));

  return (
    <div className="psc-points">
      <div className="psc-points__top">
        <span className="psc-points__value">{formatPunti(saldo)}</span>
        <span className="psc-points__unit">Punti</span>
      </div>
      <div
        className="psc-progress"
        role="progressbar"
        aria-label={`Avanzamento verso ${premio.nome}`}
        aria-valuemin={0}
        aria-valuemax={premio.soglia}
        aria-valuenow={Math.min(saldo, premio.soglia)}
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
    </div>
  );
}
