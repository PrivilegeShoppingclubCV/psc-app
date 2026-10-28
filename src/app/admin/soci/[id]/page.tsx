import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Campo, Scelta } from "@/components/admin/Campi";
import { Conferma } from "@/components/admin/Conferma";
import { Esito } from "@/components/admin/Esito";
import { dataBreve, dataOra } from "@/lib/admin/form";
import { richiediAdmin } from "@/lib/admin/sessione";
import { formatPunti, formatTessera } from "@/lib/format";
import { registraPunti, salvaSocio, scollegaAccount } from "../azioni";

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
  const [socio, saldo, movimenti, consensi, invitati, invitatoDa, livelli, negozi, premi] = await Promise.all([
    supabase.from("soci").select("*").eq("id", id).maybeSingle(),
    supabase.from("saldi_punti").select("saldo").eq("socio_id", id).maybeSingle(),
    supabase.from("movimenti_punti").select("id, data_movimento, tipo, descrizione, punti, fonte, negozi(nome)").eq("socio_id", id).order("data_movimento", { ascending: false }).limit(100),
    supabase.from("consensi_attuali").select("tipo, concesso, versione_testo, canale, registrato_il").eq("socio_id", id),
    supabase.from("inviti").select("id, stato, creato_il, invitato:soci!inviti_invitato_id_fkey(id, numero_tessera, nome, cognome)").eq("invitante_id", id),
    supabase.from("inviti").select("stato, invitante:soci!inviti_invitante_id_fkey(id, numero_tessera, nome, cognome)").eq("invitato_id", id).maybeSingle(),
    supabase.from("livelli").select("codice, nome").order("ordine"),
    supabase.from("negozi").select("id, nome").order("ordine").order("nome"),
    supabase.from("premi").select("id, nome, soglia_punti").eq("attivo", true).order("soglia_punti"),
  ]);
  const s = socio.data;
  if (!s) notFound();

  const nome = [s.nome, s.cognome].filter(Boolean).join(" ") || "Senza nome";
  const opzioniNegozi = [{ value: "", label: "Nessuno" }, ...(negozi.data ?? []).map((n) => ({ value: n.id, label: n.nome }))];
  type Persona = { id: string; numero_tessera: string; nome: string | null; cognome: string | null };
  const chi = (p: Persona) => <Link href={`/admin/soci/${p.id}`}>{[p.nome, p.cognome].filter(Boolean).join(" ") || p.numero_tessera}</Link>;
  const da = invitatoDa.data?.invitante as unknown as Persona | null;

  return (
    <>
      <div className="admin-head">
        <div>
          <Link href="/admin/soci" className="admin-back">← Soci</Link>
          <h1 className="t-display-l">{nome}</h1>
          <p className="t-caption">
            {formatTessera(s.numero_tessera)} · da {ORIGINI[s.origine] ?? s.origine} · iscritto il {dataBreve(s.iscritto_il)}
          </p>
        </div>
        <div className="admin-stat">
          <span className="t-eyebrow">Saldo punti</span>
          <span className="admin-stat__valore">{formatPunti(saldo.data?.saldo ?? 0)}</span>
        </div>
      </div>
      <Esito q={q} />

      <div className="admin-cols">
        <form action={salvaSocio} className="admin-card admin-form">
          <input type="hidden" name="id" value={s.id} />
          <h2 className="t-title">Scheda</h2>
          <div className="admin-grid">
            <Campo id="nome" label="Nome" defaultValue={s.nome ?? ""} />
            <Campo id="cognome" label="Cognome" defaultValue={s.cognome ?? ""} />
            <Campo id="email" label="Email" type="email" defaultValue={s.email ?? ""} help="Serve per collegare la tessera all'app." />
            <Campo id="telefono" label="Telefono" type="tel" defaultValue={s.telefono ?? ""} />
            <Campo id="data_nascita" label="Data di nascita" type="date" defaultValue={s.data_nascita ?? ""} />
            <Campo id="cap" label="CAP" defaultValue={s.cap ?? ""} />
            <Campo id="citta" label="Città" defaultValue={s.citta ?? ""} />
            <Scelta id="livello" label="Livello" defaultValue={s.livello} opzioni={(livelli.data ?? []).map((l) => ({ value: l.codice, label: l.nome }))} />
            <Scelta id="stato" label="Stato" defaultValue={s.stato} help="Sospeso o cessato: la tessera sparisce dall'app."
              opzioni={[{ value: "attivo", label: "Attivo" }, { value: "sospeso", label: "Sospeso" }, { value: "cessato", label: "Cessato" }]} />
            <Scelta id="negozio_preferito_id" label="Negozio preferito" defaultValue={s.negozio_preferito_id ?? ""} opzioni={opzioniNegozi} />
          </div>
          <p className="t-caption">Il numero tessera non si modifica: arriva dal gestionale ed è stampato sulla tessera.</p>
          <div className="admin-azioni">
            <button type="submit" className="psc-btn psc-btn--primary">Salva scheda</button>
          </div>
        </form>

        <div className="psc-stack">
          <section className="admin-card">
            <h2 className="t-title">App</h2>
            <dl className="admin-dl">
              <dt>Account</dt><dd>{s.user_id ? "Collegato" : "Non collegato"}</dd>
              <dt>Cassa</dt><dd>{s.stato_cassa === "in_attivazione" ? "In attivazione: ReadyPro non la conosce ancora" : "Attiva"}</dd>
              <dt>Codice invito</dt><dd>{s.codice_invito}</dd>
              {da && <><dt>Invitato da</dt><dd>{chi(da)}</dd></>}
            </dl>
            {s.user_id && (
              <form action={scollegaAccount}>
                <input type="hidden" name="id" value={s.id} />
                <Conferma messaggio="Scollegare l'account dell'app da questa tessera? Il socio dovrà ricollegarla." className="psc-btn psc-btn--secondary admin-btn--small admin-btn--danger">
                  Scollega account
                </Conferma>
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
                    <td className="min">{dataOra(m.data_movimento)}</td>
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
    </>
  );
}
