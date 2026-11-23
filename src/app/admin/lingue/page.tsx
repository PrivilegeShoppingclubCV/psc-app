import type { Metadata } from "next";
import { SceltaLingua } from "@/components/SceltaLingua";
import { getSessione } from "@/lib/dati";
import { richiediAdmin } from "@/lib/admin/sessione";
import { direzione, getLingua, LINGUE } from "@/lib/i18n";
import { TESTI, TESTI_CLUB } from "@/lib/i18n/testi";
import { linguaDiProva } from "./azioni";

export const metadata: Metadata = { title: "Lingue" };

type Voce = { chiave: string; it: string; tradotto: string };
type Sezione = { titolo: string; voci: Voce[] };

/** Nomi leggibili delle sezioni dei dizionari. */
const SEZIONI: Record<string, string> = {
  comune: "Comuni", benvenuto: "Pagina iniziale", accedi: "Accedi", verifica: "Codice di accesso",
  iscriviti: "Iscrizione (privacy e consensi)", collega: "Collega la tessera", negozio: "Tessera fatta in negozio",
  errori: "Messaggi di errore", vaiHome: "Logo", home: "Home", punti: "Punti", scontrini: "Scontrini",
  offerte: "Offerte", negozi: "Negozi", profilo: "Profilo", dati: "Modifica dati", segnala: "Segnala un dato sbagliato",
  inAttesa: "In attesa del genitore", genitore: "Consenso del genitore", client: "Pulsanti e finestre",
};

/** Dalla struttura annidata alle righe "sezione.chiave" con testo italiano e tradotto. */
function appiattisci(it: unknown, tr: unknown, chiave: string, righe: Voce[]) {
  if (typeof it === "string") {
    righe.push({ chiave, it, tradotto: typeof tr === "string" ? tr : "" });
    return;
  }
  if (it && typeof it === "object") {
    for (const [k, v] of Object.entries(it)) {
      appiattisci(v, (tr as Record<string, unknown> | undefined)?.[k], chiave ? `${chiave}.${k}` : k, righe);
    }
  }
}

function sezioni(it: object, tr: object, gruppo: string): Sezione[] {
  return Object.keys(it).map((k) => {
    const voci: Voce[] = [];
    appiattisci((it as Record<string, unknown>)[k], (tr as Record<string, unknown>)[k], k, voci);
    return { titolo: `${gruppo} · ${SEZIONI[k] ?? k}`, voci };
  });
}

const PUBBLICHE = [
  { href: "/", label: "Pagina iniziale" },
  { href: "/accedi", label: "Accedi" },
  { href: "/iscriviti", label: "Iscriviti" },
  { href: "/collega-tessera", label: "Collega la tessera" },
];
const CLUB = [
  { href: "/home", label: "Home" },
  { href: "/punti", label: "Punti" },
  { href: "/punti/scontrini", label: "Scontrini" },
  { href: "/offerte", label: "Offerte" },
  { href: "/negozi", label: "Negozi" },
  { href: "/profilo", label: "Profilo" },
  { href: "/profilo/dati", label: "Modifica dati" },
  { href: "/profilo/segnala", label: "Segnala un dato" },
];

export default async function Lingue() {
  await richiediAdmin();
  const [lingua, { socio }] = await Promise.all([getLingua(), getSessione()]);
  const nome = LINGUE.find((l) => l.codice === lingua)?.nome ?? lingua;
  const elenco = [
    ...sezioni(TESTI.it, TESTI[lingua], "Accesso"),
    ...sezioni(TESTI_CLUB.it, TESTI_CLUB[lingua], "Club"),
  ];
  const totale = elenco.reduce((n, s) => n + s.voci.length, 0);

  return (
    <>
      <div className="admin-head">
        <div>
          <p className="t-eyebrow">Impostazioni</p>
          <h1 className="t-display-l">Lingue</h1>
        </div>
        <div className="admin-azioni">
          <SceltaLingua lingua={lingua} etichetta="Lingua di prova" azione={linguaDiProva} />
        </div>
      </div>
      <p className="t-body">
        Scegli una lingua per provarla: vale solo su questo browser, finché non ne scegli un&apos;altra. Il pannello admin resta
        in italiano, le pagine dell&apos;app si aprono in <strong>{nome}</strong>. Le email di accesso del tuo account non cambiano lingua.
      </p>

      <div className="admin-card">
        <h2 className="t-title">Apri le pagine in {nome}</h2>
        <p className="t-caption">Si aprono in una nuova scheda. Le pagine di accesso le vedi anche da entrato.</p>
        <div className="admin-lingue__link">
          {PUBBLICHE.map((p) => (
            <a key={p.href} href={p.href} target="_blank" rel="noopener" className="psc-btn psc-btn--secondary">{p.label}</a>
          ))}
        </div>
        {socio ? (
          <div className="admin-lingue__link">
            {CLUB.map((p) => (
              <a key={p.href} href={p.href} target="_blank" rel="noopener" className="psc-btn psc-btn--secondary">{p.label}</a>
            ))}
          </div>
        ) : (
          <p className="t-body">
            Le pagine dei soci (home, punti, offerte, profilo) si aprono solo con una tessera collegata a questo account. Per
            vederle collega una tessera da <a href="/collega-tessera">Collega la tessera</a>, oppure leggi i testi qui sotto.
          </p>
        )}
      </div>

      <h2 className="t-title">
        Tutti i testi ({totale}){lingua === "it" ? ": scegli una lingua in alto per vederli accanto all'italiano" : ""}
      </h2>
      <p className="t-caption">
        Le parole tra graffe vengono sostituite dall&apos;app: {"{nome}"} col nome del socio, {"{premio}"} col nome del premio,
        {"{punti}"} coi punti, {"{data}"} e {"{ora}"} con data e ora. Il testo tra doppi asterischi esce in grassetto. Offerte, premi e nomi dei negozi arrivano dal
        database e restano in italiano.
      </p>
      <div className="admin-table-wrap">
        <table className="admin-table admin-lingue">
          <thead>
            <tr><th>Italiano</th>{lingua !== "it" && <th lang={lingua}>{nome}</th>}</tr>
          </thead>
          {elenco.map((s) => (
            <tbody key={s.titolo}>
              <tr className="admin-gruppo"><th colSpan={2}>{s.titolo}</th></tr>
              {s.voci.map((v) => (
                <tr key={v.chiave} title={v.chiave}>
                  <td>{v.it}</td>
                  {lingua !== "it" && <td lang={lingua} dir={direzione(lingua)}>{v.tradotto || <em className="t-caption">manca</em>}</td>}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </>
  );
}
