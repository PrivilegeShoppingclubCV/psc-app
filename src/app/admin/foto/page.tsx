import type { Metadata } from "next";
import { param } from "@/components/AuthPage";
import { Campo } from "@/components/admin/Campi";
import { Esito } from "@/components/admin/Esito";
import { dataBreve, dataOra } from "@/lib/admin/form";
import { richiediAdmin } from "@/lib/admin/sessione";
import { formatEuro } from "@/lib/format";
import { aggiungiOperatoreFoto, attivaOperatoreFoto } from "./azioni";

export const metadata: Metadata = { title: "Foto prodotto" };

const PERIODI = [
  { value: "oggi", label: "Oggi" },
  { value: "7", label: "7 giorni" },
  { value: "30", label: "30 giorni" },
  { value: "tutto", label: "Sempre" },
];

function inizioPeriodo(p: string): string | null {
  if (p === "tutto") return null;
  const d = new Date();
  if (p === "oggi") {
    // Mezzanotte italiana, non UTC.
    const oggi = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(d);
    const offset = new Intl.DateTimeFormat("en", { timeZone: "Europe/Rome", timeZoneName: "shortOffset" })
      .formatToParts(d).find((x) => x.type === "timeZoneName")?.value.replace("GMT", "") || "+0";
    const [h, m = "0"] = offset.split(":");
    const ore = Number(h);
    return new Date(`${oggi}T00:00:00${ore < 0 ? "-" : "+"}${String(Math.abs(ore)).padStart(2, "0")}:${m.padStart(2, "0")}`).toISOString();
  }
  d.setDate(d.getDate() - Number(p));
  return d.toISOString();
}

type Riga = {
  operatore_id: string | null; email: string; nome: string | null; generate: number; errori: number;
  sovrascritte: number; sul_sito: number; costo_eur: number; durata_media_s: number | null; prima: string; ultima: string;
};
type Gen = {
  id: number; email: string; ean: string; creata_il: string; durata_ms: number | null; esito: string;
  errore: string | null; sovrascritta: boolean; sul_sito: boolean; modello: string | null;
};

export default async function FotoProdotto({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const periodo = PERIODI.some((p) => p.value === param(q.periodo)) ? param(q.periodo) : "7";
  const { supabase } = await richiediAdmin();
  const da = inizioPeriodo(periodo);

  const [operatori, riepilogo, ultime, mancanti, conFoto] = await Promise.all([
    supabase.from("foto_operatori").select("id, email, nome, attivo, creato_il").order("attivo", { ascending: false }).order("email"),
    supabase.rpc("admin_foto_riepilogo", { p_da: da }),
    supabase.from("foto_generazioni").select("id, email, ean, creata_il, durata_ms, esito, errore, sovrascritta, sul_sito, modello")
      .order("creata_il", { ascending: false }).limit(50),
    supabase.from("prodotti").select("id", { count: "exact", head: true }).gt("disponibilita", 0).eq("nascosto", false).is("immagine_path", null),
    supabase.from("prodotti").select("id", { count: "exact", head: true }).gt("disponibilita", 0).eq("nascosto", false).not("immagine_path", "is", null),
  ]);
  const righe = (riepilogo.data ?? []) as Riga[];
  const tot = righe.reduce(
    (a, r) => ({ generate: a.generate + Number(r.generate), sovrascritte: a.sovrascritte + Number(r.sovrascritte), errori: a.errori + Number(r.errori), costo: a.costo + Number(r.costo_eur) }),
    { generate: 0, sovrascritte: 0, errori: 0, costo: 0 },
  );
  const errore = operatori.error ?? riepilogo.error ?? ultime.error;

  return (
    <>
      <div className="admin-head">
        <div>
          <p className="t-eyebrow">Strumento foto</p>
          <h1 className="t-display-l">Foto prodotto</h1>
          <p className="t-caption">Chi può generare le foto ambientate, quante ne ha fatte e quante mancano.</p>
        </div>
      </div>
      <Esito q={errore ? { errore: errore.message } : q} />

      <section className="admin-card">
        <h2 className="t-title">Foto dei prodotti disponibili</h2>
        <p className="t-body">
          <strong>{conFoto.count ?? 0}</strong> con foto · <strong>{mancanti.count ?? 0}</strong> ancora senza foto
        </p>
        <p className="t-caption">
          Contano i prodotti disponibili e non nascosti. Le foto fatte con lo strumento si collegano da Prodotti → «Prendi foto dal sito».
        </p>
      </section>

      <section className="admin-card">
        <div className="admin-head">
          <h2 className="t-title">Riepilogo per persona</h2>
          <nav className="admin-azioni" aria-label="Periodo">
            {PERIODI.map((p) => (
              <a key={p.value} href={`/admin/foto?periodo=${p.value}`}
                className={`psc-btn ${p.value === periodo ? "psc-btn--primary" : "psc-btn--secondary"} admin-btn--small`}
                aria-current={p.value === periodo ? "page" : undefined}>
                {p.label}
              </a>
            ))}
          </nav>
        </div>
        <p className="t-body">
          {tot.generate} foto generate, di cui {tot.sovrascritte} sovrascritte · {tot.errori} errori · costo stimato {formatEuro(tot.costo)}
        </p>
        {righe.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th>Persona</th><th className="num">Generate</th><th className="num">Sovrascritte</th><th className="num">Sul sito</th><th className="num">Errori</th><th className="num">Tempo medio</th><th className="num">Costo</th><th>Ultima</th></tr>
              </thead>
              <tbody>
                {righe.map((r) => (
                  <tr key={r.operatore_id ?? r.email}>
                    <td>{r.nome ?? r.email}{r.nome && <div className="t-caption">{r.email}</div>}</td>
                    <td className="num">{r.generate}</td>
                    <td className="num">{r.sovrascritte}</td>
                    <td className="num">{r.sul_sito}</td>
                    <td className="num">{r.errori}</td>
                    <td className="num">{r.durata_media_s !== null ? `${r.durata_media_s} s` : "—"}</td>
                    <td className="num">{formatEuro(Number(r.costo_eur))}</td>
                    <td className="min">{dataOra(r.ultima)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="t-caption">Nessuna foto generata in questo periodo.</p>
        )}
      </section>

      <section className="admin-card">
        <h2 className="t-title">Chi può generare</h2>
        <p className="t-caption">
          La persona entra nello strumento foto con questa email: riceve un codice via mail. Disattivandola non può più generare, e le sue foto restano nel registro.
        </p>
        <form action={aggiungiOperatoreFoto} className="admin-form">
          <div className="admin-grid">
            <Campo id="email" label="Email" type="email" required />
            <Campo id="nome" label="Nome" help="Facoltativo, per riconoscerla nel riepilogo." />
          </div>
          <div className="admin-azioni"><button type="submit" className="psc-btn psc-btn--primary">Aggiungi</button></div>
        </form>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Persona</th><th>Stato</th><th>Dal</th><th></th></tr></thead>
            <tbody>
              {(operatori.data ?? []).map((o) => (
                <tr key={o.id}>
                  <td>{o.nome ?? o.email}{o.nome && <div className="t-caption">{o.email}</div>}</td>
                  <td>{o.attivo ? "Attivo" : "Disattivato"}</td>
                  <td className="min">{dataBreve(o.creato_il)}</td>
                  <td>
                    <form action={attivaOperatoreFoto}>
                      <input type="hidden" name="id" value={o.id} />
                      <input type="hidden" name="attivo" value={o.attivo ? "0" : "1"} />
                      <button type="submit" className="psc-btn psc-btn--secondary admin-btn--small">{o.attivo ? "Disattiva" : "Riattiva"}</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-card">
        <h2 className="t-title">Ultime generazioni</h2>
        {(ultime.data ?? []).length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Quando</th><th>Persona</th><th>EAN</th><th>Esito</th><th className="num">Tempo</th></tr></thead>
              <tbody>
                {((ultime.data ?? []) as Gen[]).map((g) => (
                  <tr key={g.id}>
                    <td className="min">{dataOra(g.creata_il)}</td>
                    <td>{g.email}</td>
                    <td className="min">{g.ean}</td>
                    <td>
                      {g.esito === "ok"
                        ? [g.sovrascritta ? "Sovrascritta" : "Nuova", g.sul_sito ? "sul sito" : "non caricata"].join(" · ")
                        : <span title={g.errore ?? ""}>Errore{g.errore ? `: ${g.errore.slice(0, 60)}` : ""}</span>}
                    </td>
                    <td className="num">{g.durata_ms ? `${Math.round(g.durata_ms / 1000)} s` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="t-caption">Ancora nessuna generazione registrata.</p>
        )}
      </section>
    </>
  );
}
