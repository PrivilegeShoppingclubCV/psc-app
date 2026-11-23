import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Campo, Scelta } from "@/components/admin/Campi";
import { Conferma } from "@/components/admin/Conferma";
import { Esito } from "@/components/admin/Esito";
import { CampoData } from "@/components/CampoData";
import { dataBreve } from "@/lib/admin/form";
import { formatPunti, formatTessera } from "@/lib/format";
import { assegnaTesseraCassa, bloccaTesseraCassa, salvaSocioCassa } from "../../azioni";
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
};

const STATI_TESSERA: Record<string, string> = { attiva: "Attiva", bloccata: "Bloccata", da_consegnare: "Da consegnare" };

/**
 * Scheda del socio per l'operatore: dati anagrafici modificabili, tessere e saldo.
 * Punti, livello, stato, consensi e unione dei doppioni restano nel pannello admin.
 */
export default async function SocioCassa({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, q] = await Promise.all([params, searchParams]);
  const accesso = await richiediStaff();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [{ data }, { data: negozi }] = await Promise.all([
    accesso.supabase.rpc("personale_scheda_socio", { p_id: id }),
    accesso.supabase.from("negozi").select("id, nome").eq("attivo", true).order("ordine").order("nome"),
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

      <form action={salvaSocioCassa} className="admin-card admin-form">
        <input type="hidden" name="id" value={s.id} />
        <h2 className="t-title">Dati del socio</h2>
        <div className="admin-grid">
          <Campo id="nome" label="Nome" required defaultValue={s.nome ?? ""} />
          <Campo id="cognome" label="Cognome" required defaultValue={s.cognome ?? ""} />
          {s.ha_app ? (
            <>
              <input type="hidden" name="email" value={s.email ?? ""} />
              <Campo id="email_app" label="Email" type="email" value={s.email ?? ""} readOnly
                help="Il socio entra nell'app con questa email: per cambiarla chiedi all'amministrazione." />
            </>
          ) : (
            <Campo id="email" label="Email" type="email" defaultValue={s.email ?? ""} help="Con questa email il socio collega da solo la tessera all'app." />
          )}
          <Campo id="telefono" label="Telefono" type="tel" defaultValue={s.telefono ?? ""} />
          <CampoData id="data_nascita" label="Data di nascita" defaultValue={s.data_nascita ?? ""} />
          <Campo id="indirizzo" label="Indirizzo" defaultValue={s.indirizzo ?? ""} />
          <Campo id="cap" label="CAP" defaultValue={s.cap ?? ""} />
          <Campo id="citta" label="Città" defaultValue={s.citta ?? ""} />
          <Scelta id="negozio_preferito_id" label="Negozio preferito" defaultValue={s.negozio_preferito_id ?? ""}
            opzioni={[{ value: "", label: "Nessuno" }, ...(negozi ?? []).map((n) => ({ value: n.id, label: n.nome }))]} />
        </div>
        <p className="t-caption">Le correzioni valgono nell&apos;app: falle anche in ReadyPro.</p>
        <div className="admin-azioni">
          <button type="submit" className="psc-btn psc-btn--primary">Salva</button>
        </div>
      </form>

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
      </section>
    </main>
  );
}
