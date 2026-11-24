import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Campo } from "@/components/admin/Campi";
import { Conferma } from "@/components/admin/Conferma";
import { Esito } from "@/components/admin/Esito";
import { ModuloScheda } from "@/components/admin/ModuloScheda";
import { dataBreve, dataMovimento } from "@/lib/admin/form";
import { formatEuro, formatPunti, formatTessera } from "@/lib/format";
import { annullaUnioneCassa, assegnaTesseraCassa, bloccaTesseraCassa, salvaSocioCassa, unisciDaAppCassa, unisciSociCassa } from "../../azioni";
import { richiediStaff } from "../../sessione";
import { TestaCassa } from "../../Testa";
import "../../../admin/admin.css";

export const metadata: Metadata = { title: "Cassa: socio", robots: { index: false, follow: false } };

type Tessera = {
  id: string; codice: string; tipo: "fisica" | "digitale"; stato: string; stato_cassa: string | null;
  consegnata_il: string | null; bloccata_il: string | null; motivo_blocco: string | null;
};
type Scheda = {
  id: string; nome: string | null; cognome: string | null; email: string | null; telefono: string | null;
  data_nascita: string | null; indirizzo: string | null; cap: string | null; citta: string | null;
  negozio_preferito_id: string | null; livello: string; stato: string; origine: string; iscritto_il: string;
  ha_app: boolean; saldo: number; tessere: Tessera[];
  movimenti: { id: string; data_movimento: string; tipo: string; descrizione: string | null; punti: number; fonte: string; negozio: string | null }[];
  scontrini: { numero_documento: string; data_scontrino: string; totale: number; punti: number; negozio: string | null }[];
  da_unire: { id: string; nome: string | null; cognome: string | null; email: string | null; da_unire_con: string | null }[];
};

const TIPI: Record<string, string> = {
  saldo_iniziale: "Saldo iniziale", acquisto: "Acquisto", riscatto: "Riscatto", bonus: "Bonus",
  invito: "Invito", rettifica: "Rettifica", storno: "Storno", scadenza: "Scadenza",
};

const STATI_TESSERA: Record<string, string> = { attiva: "Attiva", bloccata: "Bloccata", da_consegnare: "Da consegnare" };

/**
 * Scheda del socio per l'operatore: come quella del pannello admin (dati, tessere,
 * unione dei doppioni), con punti e scontrini in sola lettura. Niente aggiunta di
 * punti, riscatto di premi, consensi, inviti né operatore dello scontrino.
 */
export default async function SocioCassa({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, q] = await Promise.all([params, searchParams]);
  const accesso = await richiediStaff();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [{ data }, { data: negozi }, { data: livelli }] = await Promise.all([
    accesso.supabase.rpc("personale_scheda_socio", { p_id: id }),
    accesso.supabase.from("negozi").select("id, nome").eq("attivo", true).order("ordine").order("nome"),
    accesso.supabase.from("livelli").select("codice, nome").order("ordine"),
  ]);
  const s = data as Scheda | null;
  if (!s) notFound();

  const nome = [s.nome, s.cognome].filter(Boolean).join(" ") || "Senza nome";
  const attive = s.tessere.filter((t) => t.stato === "attiva");
  const fisica = attive.find((t) => t.tipo === "fisica");
  const digitale = attive.find((t) => t.tipo === "digitale");

  return (
    <main className="cassa cassa--larga">
      <TestaCassa nome={accesso.nome ?? accesso.email} admin={accesso.admin} attiva="soci" />
      <div className="admin-head">
        <div>
          <Link href="/cassa/soci" className="admin-back">← Soci</Link>
          <h1 className="t-display-l">{nome}</h1>
          <p className="t-caption">
            {attive.length ? attive.map((t) => formatTessera(t.codice)).join(" · ") : "Nessuna tessera attiva"} · iscritto il {dataBreve(s.iscritto_il)}
            {s.stato !== "attivo" && <> · <span className="psc-badge psc-badge--danger">{s.stato}</span></>}
          </p>
        </div>
        <div className="admin-stat">
          <span className="t-eyebrow">Saldo punti</span>
          <span className="admin-stat__valore">{formatPunti(s.saldo)}</span>
        </div>
      </div>
      <Esito q={q} />

      {s.da_unire.map((altra) => {
        // "app" è la scheda nata dall'app, "vecchia" quella con la tessera di ReadyPro.
        const app = altra.da_unire_con === s.id ? altra.id : s.id;
        const vecchia = altra.da_unire_con === s.id ? s.id : altra.id;
        const chi = <Link href={`/cassa/soci/${altra.id}`}>{[altra.nome, altra.cognome].filter(Boolean).join(" ") || altra.email || "Senza nome"}</Link>;
        return (
          <section key={altra.id} className="admin-card">
            <h2 className="t-title">Probabile doppione da unire</h2>
            <p className="t-body">
              {app === s.id
                ? <>Questa scheda è nata dall&apos;app con lo stesso cellulare di {chi}, che in negozio non aveva lasciato un&apos;email. </>
                : <>{chi} si è iscritto dall&apos;app con lo stesso cellulare di questa scheda, che non ha un&apos;email. </>}
              Chiedi conferma al cliente. Finché non decidi, la tessera digitale dell&apos;app non va a ReadyPro.
            </p>
            <div className="admin-azioni">
              <form action={unisciDaAppCassa}>
                <input type="hidden" name="tieni" value={vecchia} />
                <input type="hidden" name="togli" value={app} />
                <input type="hidden" name="pagina" value={s.id} />
                <Conferma messaggio="Unire le due schede? Resta la tessera fisica, con i punti di tutte e due. L'operazione non si annulla.">È la stessa persona: unisci</Conferma>
              </form>
              <form action={annullaUnioneCassa}>
                <input type="hidden" name="id" value={app} />
                <input type="hidden" name="pagina" value={s.id} />
                <button type="submit" className="psc-btn psc-btn--secondary">Non è la stessa persona</button>
              </form>
            </div>
          </section>
        );
      })}

      <ModuloScheda azione={salvaSocioCassa} socio={s} haApp={s.ha_app} emailSoloAdmin livelli={livelli ?? []} negozi={negozi ?? []} />

      <section className="admin-card">
        <h2 className="t-title">Tessere</h2>
        {s.tessere.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Codice</th><th>Tipo</th><th>Stato</th><th>Dal</th><th></th></tr></thead>
              <tbody>
                {s.tessere.map((t) => (
                  <tr key={t.id}>
                    <td><code>{formatTessera(t.codice)}</code></td>
                    <td>{t.tipo === "fisica" ? "Fisica" : "Digitale"}</td>
                    <td>
                      {STATI_TESSERA[t.stato] ?? t.stato}
                      {t.stato === "attiva" && t.stato_cassa === "in_attivazione" && <> <span className="psc-badge psc-badge--warning">In attivazione</span></>}
                      {t.motivo_blocco && <div className="t-caption">{t.motivo_blocco}</div>}
                    </td>
                    <td className="min">{dataBreve(t.stato === "bloccata" ? t.bloccata_il : t.consegnata_il)}</td>
                    <td>
                      {t.stato === "attiva" && (
                        <form action={bloccaTesseraCassa} className="admin-azioni">
                          <input type="hidden" name="socio_id" value={s.id} />
                          <input type="hidden" name="tessera_id" value={t.id} />
                          <input name="motivo" className="psc-field__input admin-input--small" placeholder="Motivo (persa, rubata…)" required aria-label={`Motivo del blocco di ${t.codice}`} />
                          <Conferma messaggio={`Bloccare la tessera ${t.codice}? Non si potrà riattivare. Ricorda di bloccarla anche in ReadyPro.`} className="psc-btn psc-btn--secondary admin-btn--small admin-btn--danger">
                            Blocca
                          </Conferma>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="admin-vuoto">Nessuna tessera.</p>}

        <div className="admin-cols">
          <form action={assegnaTesseraCassa} className="admin-form">
            <input type="hidden" name="socio_id" value={s.id} />
            <h3 className="t-eyebrow">{fisica ? "Sostituisci la tessera fisica" : "Consegna una tessera fisica"}</h3>
            {!fisica && digitale && (
              <p className="t-caption">La fisica prende il posto della digitale {digitale.codice}: nell&apos;app il socio vedrà il codice della plastica.</p>
            )}
            <div className="admin-grid">
              <Campo id="codice_fisica" label="Codice della tessera" autoComplete="off" required inputMode="numeric" help="Scansiona il codice a barre o scrivilo con gli zeri iniziali." />
              {fisica && <Campo id="motivo" label="Perché la sostituisci" required placeholder="Persa, rovinata…" help={`La ${fisica.codice} verrà bloccata.`} />}
            </div>
            <div className="admin-azioni"><button type="submit" className="psc-btn psc-btn--primary">{fisica ? "Sostituisci" : "Consegna"}</button></div>
          </form>
          <form action={unisciSociCassa} className="admin-form">
            <input type="hidden" name="socio_id" value={s.id} />
            <h3 className="t-eyebrow">Unisci un doppione</h3>
            <Campo id="codice_altro" label="Una tessera dell'altra scheda" autoComplete="off" required
              help="Se la stessa persona ha due schede (es. tessera fatta in negozio e iscrizione dall'app), punti, consensi e tessere dell'altra passano qui e l'altra scheda sparisce. Se una ha la fisica e l'altra la digitale, resta la fisica." />
            <div className="admin-azioni">
              <Conferma messaggio="Unire l'altra scheda a questa? L'operazione non si annulla.">Unisci a questa scheda</Conferma>
            </div>
          </form>
        </div>
      </section>
      <section className="admin-card">
        <h2 className="t-title">Punti</h2>
        <p className="t-caption">Solo da consultare: i punti li aggiunge o li toglie l&apos;amministrazione.</p>
        {s.movimenti.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Data</th><th>Tipo</th><th>Descrizione</th><th>Negozio</th><th>Fonte</th><th className="num">Punti</th></tr></thead>
              <tbody>
                {s.movimenti.map((m) => (
                  <tr key={m.id}>
                    <td className="min">{dataMovimento(m.data_movimento)}</td>
                    <td>{TIPI[m.tipo] ?? m.tipo}</td>
                    <td>{m.descrizione}</td>
                    <td className="min">{m.negozio ?? "—"}</td>
                    <td className="min">{m.fonte}</td>
                    <td className="num">{m.punti > 0 ? "+" : ""}{formatPunti(m.punti)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="admin-vuoto">Nessun movimento.</p>}
      </section>

      <section className="admin-card">
        <h2 className="t-title">Scontrini (ultimi 30 giorni)</h2>
        <p className="t-caption">Quelli che il socio vede in app.</p>
        {s.scontrini.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Data</th><th>N. doc.</th><th>Negozio</th><th className="num">Totale</th><th className="num">Punti</th></tr></thead>
              <tbody>
                {s.scontrini.map((x) => (
                  <tr key={x.numero_documento}>
                    <td className="min">{dataMovimento(x.data_scontrino)}</td>
                    <td className="min">{x.numero_documento}</td>
                    <td className="min">{x.negozio ?? "—"}</td>
                    <td className="num">{formatEuro(Number(x.totale))}</td>
                    <td className="num">{formatPunti(x.punti)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="admin-vuoto">Nessuno scontrino negli ultimi 30 giorni.</p>}
      </section>
    </main>
  );
}
