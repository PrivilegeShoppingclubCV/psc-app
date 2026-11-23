import { forma, ricco } from "@/lib/i18n";
import type { formati } from "@/lib/i18n/formati";
import type { TestiClub } from "@/lib/i18n/testi";
import type { Scontrino } from "@/lib/tipi";

/**
 * Lo scontrino come lo vede il socio in app. Lo usano la pagina del socio e
 * l'anteprima del pannello admin, così le due cose non possono divergere.
 */
export function CartaScontrino({ s, f, t }: {
  s: Scontrino;
  f: ReturnType<typeof formati>;
  t: TestiClub["scontrini"];
}) {
  return (
    <div className="scontrino__carta">
      <p className="scontrino__testa">
        <strong>Privilege Shopping Club</strong>
        {s.negozio && <span>{s.negozio}</span>}
        <span>{f.dataOra(s.data, t.dataOra)}</span>
        <span>{forma(t.documento, { numero: s.numero })}</span>
      </p>
      {s.righe.length > 0 && (
        <ul className="scontrino__righe">
          {s.righe.map((r, i) => (
            <li key={i}>
              <span>{r.quantita && r.quantita !== 1 ? `${r.quantita} × ` : ""}{r.descrizione}</span>
              <span>{f.euro(r.importo)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="scontrino__totale">
        <span>{s.totale < 0 ? t.reso : t.totale}</span>
        <span>{f.euro(s.totale)}</span>
      </p>
      <p className="scontrino__punti">
        {s.punti === 0
          ? t.nessunPunto
          : ricco(t.punti, { punti: <bdi dir="ltr">{`${s.punti > 0 ? "+" : "−"}${f.punti(Math.abs(s.punti))}`}</bdi> })}
      </p>
      <p className="t-caption">{t.cortesia}</p>
    </div>
  );
}
