import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Campo, Scelta } from "@/components/admin/Campi";
import { Conferma } from "@/components/admin/Conferma";
import { Esito } from "@/components/admin/Esito";
import { ModuloScheda } from "@/components/admin/ModuloScheda";
import { dataBreve, dataMovimento } from "@/lib/admin/form";
import { richiediAdmin } from "@/lib/admin/sessione";
import { formatEuro, formatPunti, formatTessera } from "@/lib/format";
import { annullaUnione, assegnaTesseraFisica, bloccaTessera, collegaConCodice, registraPunti, salvaSocio, scollegaAccount, unisciDaApp, unisciSoci } from "../azioni";

export const metadata: Metadata = { title: "Socio" };

const TIPI: Record<string, string> = {
  saldo_iniziale: "Saldo iniziale", acquisto: "Acquisto", riscatto: "Riscatto", bonus: "Bonus",
  invito: "Invito", rettifica: "Rettifica", storno: "Storno", scadenza: "Scadenza",
};
const CONSENSI: Record<string, string> = { privacy: "Privacy", regolamento: "Regolamento", marketing: "Marketing", profilazione: "Profilazione" };
const ORIGINI: Record<string, string> = { import: "Gestionale", app: "App", negozio: "Negozio" };

export default async function SchedaSocio({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, q] = await Promise.all([params, searchParams]);
  const { supabase } = await richiediAdmin();
  const [socio, tessere, saldo, movimenti, consensi, invitati, invitatoDa, livelli, negozi, premi, genitore] = await Promise.all([
    supabase.from("soci").select("*").eq("id", id).maybeSingle(),
    supabase.from("tessere").select("id, codice, tipo, stato, stato_cassa, consegnata_il, bloccata_il, motivo_blocco").eq("socio_id", id).order("creato_il"),
    supabase.from("saldi_punti").select("saldo").eq("socio_id", id).maybeSingle(),
    supabase.from("movimenti_punti").select("id, data_movimento, tipo, descrizione, punti, fonte, negozi(nome)").eq("socio_id", id).order("data_movimento", { ascending: false }).limit(100),
    supabase.from("consensi_attuali").select("tipo, concesso, versione_testo, canale, registrato_il").eq("socio_id", id),
    supabase.from("inviti").select("id, stato, creato_il, invitato:soci!inviti_invitato_id_fkey(id, nome, cognome, email)").eq("invitante_id", id),
    supabase.from("inviti").select("stato, invitante:soci!inviti_invitante_id_fkey(id, nome, cognome, email)").eq("invitato_id", id).maybeSingle(),
    supabase.from("livelli").select("codice, nome").order("ordine"),
    supabase.from("negozi").select("id, nome").order("ordine").order("nome"),
    supabase.from("premi").select("id, nome, soglia_punti").eq("attivo", true).order("soglia_punti"),
    supabase.from("autorizzazioni_genitore").select("id, approvato_il, genitore_nome, genitore_cognome, genitore_email, approva_iscrizione, approva_punti, approva_marketing")
      .eq("socio_id", id).not("approvato_il", "is", null).order("approvato_il", { ascending: false }),
  ]);
  const s = socio.data;
  if (!s) notFound();
  // Scontrini degli ultimi 30 giorni, con chi li ha battuti (solo per l'amministrazione).
  const { data: scontrini } = await supabase.from("scontrini")
    .select("numero_documento, data_scontrino, totale, punti, cassa, negozi(nome)")
    .eq("socio_id", id).order("data_scontrino", { ascending: false }).limit(100);
  const { data: operatori } = scontrini?.length
    ? await supabase.from("scontrini_operatori").select("numero_documento, operatore").in("numero_documento", scontrini.map((x) => x.numero_documento))
    : { data: [] };
  const operatoreDi = new Map((operatori ?? []).map((o) => [o.numero_documento, o.operatore]));
  // Iscritti dall'app con il cellulare di una scheda senza email: da unire in negozio.
  const { data: daUnire } = await supabase.from("soci").select("id, nome, cognome, email, da_unire_con")
    .or(`id.eq.${s.da_unire_con ?? "00000000-0000-0000-0000-000000000000"},da_unire_con.eq.${s.id}`);

  const nome = [s.nome, s.cognome].filter(Boolean).join(" ") || "Senza nome";
  const opzioniNegozi = [{ value: "", label: "Nessuno" }, ...(negozi.data ?? []).map((n) => ({ value: n.id, label: n.nome }))];
  type Persona = { id: string; nome: string | null; cognome: string | null; email: string | null };
  const chi = (p: Persona) => <Link href={`/admin/soci/${p.id}`}>{[p.nome, p.cognome].filter(Boolean).join(" ") || p.email || "Senza nome"}</Link>;
  const attive = (tessere.data ?? []).filter((t) => t.stato === "attiva");
  const attiva = attive[0];
  const fisica = attiva?.tipo === "fisica" ? attiva : undefined;
  const da = invitatoDa.data?.invitante as unknown as Persona | null;

  return (
    <>
      <div className="admin-head">
        <div>
          <Link href="/admin/soci" className="admin-back">← Soci</Link>
          <h1 className="t-display-l">{nome}</h1>
          <p className="t-caption">
            {attive.length ? attive.map((t) => formatTessera(t.codice)).join(" · ") : "Nessuna tessera attiva"} · da {ORIGINI[s.origine] ?? s.origine} · iscritto il {dataBreve(s.iscritto_il)}
          </p>
        </div>
        <div className="admin-stat">
          <span className="t-eyebrow">Saldo punti</span>
          <span className="admin-stat__valore">{formatPunti(saldo.data?.saldo ?? 0)}</span>
        </div>
      </div>
      <Esito q={q} />
      {(daUnire ?? []).map((altra) => {
        // "app" è la scheda nata dall'app, "vecchia" quella con la tessera di ReadyPro.
        const app = altra.da_unire_con === s.id ? altra.id : s.id;
        const vecchia = altra.da_unire_con === s.id ? s.id : altra.id;
        return (
          <section key={altra.id} className="admin-card">
            <h2 className="t-title">Probabile doppione da unire</h2>
            <p className="t-body">
              {app === s.id
                ? <>Questa scheda è nata dall&apos;app con lo stesso cellulare di {chi(altra)}, che in negozio non aveva lasciato un&apos;email. </>
                : <>{chi(altra)} si è iscritto dall&apos;app con lo stesso cellulare di questa scheda, che non ha un&apos;email. </>}
              Chiedi conferma al cliente quando passa in negozio. Finché non decidi, la tessera digitale dell&apos;app non va a ReadyPro.
            </p>
            <div className="admin-azioni">
              <form action={unisciDaApp}>
                <input type="hidden" name="tieni" value={vecchia} />
                <input type="hidden" name="togli" value={app} />
                <input type="hidden" name="pagina" value={s.id} />
                <Conferma messaggio="Unire le due schede? Resta la tessera fisica, con i punti di tutte e due. L'operazione non si annulla.">È la stessa persona: unisci</Conferma>
              </form>
              <form action={annullaUnione}>
                <input type="hidden" name="id" value={app} />
                <input type="hidden" name="pagina" value={s.id} />
                <button type="submit" className="psc-btn psc-btn--secondary">Non è la stessa persona</button>
              </form>
            </div>
          </section>
        );
      })}

      <div className="admin-cols">
        <ModuloScheda azione={salvaSocio} socio={s} haApp={!!s.user_id} livelli={livelli.data ?? []} negozi={negozi.data ?? []} />

        <div className="psc-stack">
          <section className="admin-card">
            <h2 className="t-title">App</h2>
            <dl className="admin-dl">
              <dt>Account</dt><dd>{s.user_id ? "Collegato" : "Non collegato"}</dd>
              <dt>Codice invito</dt><dd>{s.codice_invito}</dd>
              {da && <><dt>Invitato da</dt><dd>{chi(da)}</dd></>}
            </dl>
            {s.user_id && (
              <form action={scollegaAccount}>
                <input type="hidden" name="id" value={s.id} />
                <Conferma messaggio="Scollegare l'account dell'app da questo socio? Dovrà ricollegare la tessera." className="psc-btn psc-btn--secondary admin-btn--small admin-btn--danger">
                  Scollega account
                </Conferma>
              </form>
            )}
            {!s.user_id && (
              <form action={collegaConCodice} className="admin-form">
                <input type="hidden" name="id" value={s.id} />
                <Campo id="codice" label="Codice mostrato dall'app" autoComplete="off" required placeholder="K7M2QX"
                  help="Per chi non ha lasciato un'email o ne usa un'altra: nell'app sceglie «In negozio non ho lasciato questa email» e ti mostra un codice valido 15 minuti." />
                <div className="admin-azioni"><button type="submit" className="psc-btn psc-btn--secondary admin-btn--small">Collega l&apos;app</button></div>
              </form>
            )}
          </section>

          <section className="admin-card">
            <h2 className="t-title">Consensi</h2>
            {consensi.data?.length ? (
              <dl className="admin-dl">
                {consensi.data.map((c) => (
                  <div key={c.tipo} style={{ display: "contents" }}>
                    <dt>{CONSENSI[c.tipo] ?? c.tipo}</dt>
                    <dd>{c.concesso ? "Sì" : "No"} <span className="t-caption">· {c.canale}, {dataBreve(c.registrato_il)}</span></dd>
                  </div>
                ))}
              </dl>
            ) : <p className="t-caption">Nessun consenso registrato.</p>}
          </section>

          {(!!genitore.data?.length || s.stato === "in_attesa" || !s.punti_attivi) && (
            <section className="admin-card">
              <h2 className="t-title">Consenso del genitore</h2>
              {s.stato === "in_attesa" && <p className="t-caption">Minore di 14 anni: la tessera si attiva quando un genitore approva dal link mandato dall&apos;app.</p>}
              {!s.punti_attivi && <p className="t-caption">Raccolta punti spenta: le vendite non danno punti finché un genitore non approva (o fino ai 18 anni).</p>}
              {genitore.data?.map((g) => (
                <p key={g.id}>
                  {g.genitore_nome} {g.genitore_cognome} ({g.genitore_email}), {dataBreve(g.approvato_il!)}:{" "}
                  {[g.approva_iscrizione && "iscrizione", g.approva_punti && "punti", g.approva_marketing && "offerte"].filter(Boolean).join(", ") || "nessuna approvazione"}
                </p>
              ))}
            </section>
          )}

          {!!invitati.data?.length && (
            <section className="admin-card">
              <h2 className="t-title">Amici invitati</h2>
              <ul className="list">
                {invitati.data.map((i) => (
                  <li key={i.id}><span>{chi(i.invitato as unknown as Persona)}</span><span className="t-caption">{i.stato}</span></li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      <section className="admin-card">
        <h2 className="t-title">Tessere</h2>
        <p className="t-caption">
          Una tessera attiva per socio: la digitale finché non riceve quella di plastica, poi la fisica (che vede anche nell&apos;app).
          Il codice non si modifica mai; una tessera persa si blocca e se ne consegna un&apos;altra. I punti restano sul socio.
        </p>
        {tessere.data?.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Codice</th><th>Tipo</th><th>Stato</th><th>Data</th><th></th></tr></thead>
              <tbody>
                {tessere.data.map((t) => (
                  <tr key={t.id}>
                    <td className="psc-code">{t.codice}</td>
                    <td>{t.tipo === "fisica" ? "Fisica" : "Digitale"}</td>
                    <td>
                      {t.stato === "bloccata"
                        ? <><span className="psc-badge psc-badge--danger">Bloccata</span> <span className="t-caption">{t.motivo_blocco}</span></>
                        : t.stato_cassa === "in_attivazione"
                          ? <span className="psc-badge psc-badge--warning">In attivazione</span>
                          : <span className="psc-badge psc-badge--success">Attiva in cassa</span>}
                    </td>
                    <td className="min">{dataBreve(t.stato === "bloccata" ? t.bloccata_il : t.consegnata_il)}</td>
                    <td>
                      {t.stato === "attiva" && (
                        <form action={bloccaTessera} className="admin-azioni">
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
          <form action={assegnaTesseraFisica} className="admin-form">
            <input type="hidden" name="socio_id" value={s.id} />
            <h3 className="t-eyebrow">{fisica ? "Sostituisci la tessera fisica" : "Consegna una tessera fisica"}</h3>
            {attiva?.tipo === "digitale" && (
              <p className="t-caption">La fisica prende il posto della digitale {attiva.codice}: nell&apos;app il socio vedrà il codice della plastica.</p>
            )}
            <div className="admin-grid">
              <Campo id="codice_fisica" label="Codice della tessera" autoComplete="off" required inputMode="numeric" help="Scansiona il codice a barre o scrivilo con gli zeri iniziali." />
              {fisica && <Campo id="motivo" label="Perché la sostituisci" required placeholder="Persa, rovinata…" help={`La ${fisica.codice} verrà bloccata.`} />}
            </div>
            <div className="admin-azioni"><button type="submit" className="psc-btn psc-btn--primary">{fisica ? "Sostituisci" : "Consegna"}</button></div>
          </form>
          <form action={unisciSoci} className="admin-form">
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
        <div className="admin-cols">
          <form action={registraPunti} className="admin-form">
            <input type="hidden" name="socio_id" value={s.id} />
            <h3 className="t-eyebrow">Aggiungi o togli punti</h3>
            <div className="admin-grid">
              <Scelta id="tipo" label="Tipo" opzioni={[
                { value: "bonus", label: "Bonus" }, { value: "rettifica", label: "Rettifica" },
                { value: "acquisto", label: "Acquisto" }, { value: "storno", label: "Storno" },
              ]} />
              <Campo id="punti" label="Punti" inputMode="numeric" required placeholder="100 o -100" />
              <Scelta id="negozio_id" label="Negozio" opzioni={opzioniNegozi} />
              <Campo id="descrizione" label="Motivo" placeholder="Es. compleanno" />
            </div>
            <div className="admin-azioni"><button type="submit" className="psc-btn psc-btn--primary">Registra</button></div>
          </form>
          <form action={registraPunti} className="admin-form">
            <input type="hidden" name="socio_id" value={s.id} />
            <input type="hidden" name="tipo" value="riscatto" />
            <h3 className="t-eyebrow">Riscatta un premio</h3>
            <div className="admin-grid">
              <Scelta id="premio_id" label="Premio" opzioni={(premi.data ?? []).map((p) => ({ value: p.id, label: `${p.nome} · ${formatPunti(p.soglia_punti)} punti` }))} />
              <Scelta id="negozio_id" label="Negozio" opzioni={opzioniNegozi} />
            </div>
            <div className="admin-azioni"><button type="submit" className="psc-btn psc-btn--secondary" disabled={!premi.data?.length}>Riscatta</button></div>
          </form>
        </div>
        <p className="t-caption">I movimenti non si modificano né si cancellano: per correggere un errore registra una rettifica di segno opposto.</p>

        {movimenti.data?.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Data</th><th>Tipo</th><th>Descrizione</th><th>Negozio</th><th>Fonte</th><th className="num">Punti</th></tr></thead>
              <tbody>
                {movimenti.data.map((m) => (
                  <tr key={m.id}>
                    <td className="min">{dataMovimento(m.data_movimento)}</td>
                    <td>{TIPI[m.tipo] ?? m.tipo}</td>
                    <td>{m.descrizione}</td>
                    <td className="min">{(m.negozi as unknown as { nome: string } | null)?.nome ?? "—"}</td>
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
        <p className="t-caption">Quelli che il socio vede in app. L&apos;operatore che ha battuto lo scontrino lo vede solo l&apos;amministrazione.</p>
        {scontrini?.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Data</th><th>N. doc.</th><th>Negozio</th><th>Operatore</th><th className="num">Totale</th><th className="num">Punti</th></tr></thead>
              <tbody>
                {scontrini.map((x) => (
                  <tr key={x.numero_documento}>
                    <td className="min">{dataMovimento(x.data_scontrino)}</td>
                    <td className="min">{x.numero_documento}</td>
                    <td className="min">{(x.negozi as unknown as { nome: string } | null)?.nome ?? x.cassa ?? "—"}</td>
                    <td className="min">{operatoreDi.get(x.numero_documento) ?? "—"}</td>
                    <td className="num">{formatEuro(Number(x.totale))}</td>
                    <td className="num">{formatPunti(x.punti)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="admin-vuoto">Nessuno scontrino negli ultimi 30 giorni.</p>}
      </section>
    </>
  );
}
