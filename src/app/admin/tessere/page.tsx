import type { Metadata } from "next";
import Link from "next/link";
import { param } from "@/components/AuthPage";
import { Area, Campo, Interruttore } from "@/components/admin/Campi";
import { Conferma } from "@/components/admin/Conferma";
import { Esito } from "@/components/admin/Esito";
import { dataBreve } from "@/lib/admin/form";
import { richiediAdmin } from "@/lib/admin/sessione";
import { caricaTessere, salvaRegole, togliDalMagazzino } from "./azioni";

export const metadata: Metadata = { title: "Tessere" };

const STATI: Record<string, string> = { da_consegnare: "Nel magazzino", attiva: "Consegnata", bloccata: "Bloccata" };

export default async function Tessere({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const cerca = param(q.codice).replace(/\s/g, "");
  const { supabase } = await richiediAdmin();
  const conta = (filtri: Record<string, string>) => supabase.from("tessere").select("id", { count: "exact", head: true }).match(filtri);

  const [magazzino, fisiche, digitali, bloccate, ultime, regole, trovata] = await Promise.all([
    conta({ stato: "da_consegnare" }),
    conta({ stato: "attiva", tipo: "fisica" }),
    conta({ stato: "attiva", tipo: "digitale" }),
    conta({ stato: "bloccata" }),
    supabase.from("tessere").select("codice, creato_il").eq("stato", "da_consegnare").order("codice").limit(50),
    supabase.from("impostazioni").select("chiave, valore").in("chiave", ["tessera_fisica_formato", "tessere_fisiche_solo_magazzino"]),
    cerca
      ? supabase.from("tessere").select("codice, tipo, stato, stato_cassa, motivo_blocco, consegnata_il, soci(id, nome, cognome)").eq("codice", cerca).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const regola = (k: string) => regole.data?.find((r) => r.chiave === k)?.valore;
  const socio = trovata.data?.soci as unknown as { id: string; nome: string | null; cognome: string | null } | null;

  const stat = [
    { label: "Nel magazzino", valore: magazzino.count },
    { label: "Fisiche consegnate", valore: fisiche.count },
    { label: "Digitali attive", valore: digitali.count },
    { label: "Bloccate", valore: bloccate.count },
  ];

  return (
    <>
      <div className="admin-head">
        <div>
          <p className="t-eyebrow">Club</p>
          <h1 className="t-display-l">Tessere</h1>
        </div>
        <Link href="/admin/soci/nuovo" className="psc-btn psc-btn--primary">Nuovo socio con tessera fisica</Link>
      </div>
      <Esito q={q} />

      <div className="admin-stats">
        {stat.map((s) => (
          <div key={s.label} className="admin-stat">
            <span className="t-eyebrow">{s.label}</span>
            <span className="admin-stat__valore">{s.valore ?? "—"}</span>
          </div>
        ))}
      </div>

      <form className="admin-cerca" action="/admin/tessere">
        <Campo id="codice" label="Cerca una tessera" defaultValue={cerca} autoComplete="off" placeholder="Codice stampato o 900000000123" />
        <button type="submit" className="psc-btn psc-btn--primary">Cerca</button>
      </form>
      {cerca && (
        <section className="admin-card">
          {trovata.data ? (
            <dl className="admin-dl">
              <dt>Codice</dt><dd className="psc-code">{trovata.data.codice}</dd>
              <dt>Tipo</dt><dd>{trovata.data.tipo === "fisica" ? "Fisica" : "Digitale"}</dd>
              <dt>Stato</dt><dd>{STATI[trovata.data.stato]}{trovata.data.motivo_blocco ? ` · ${trovata.data.motivo_blocco}` : ""}{trovata.data.stato === "attiva" && trovata.data.stato_cassa === "in_attivazione" ? " · ReadyPro non la conosce ancora" : ""}</dd>
              {socio && <><dt>Socio</dt><dd><Link href={`/admin/soci/${socio.id}`}>{[socio.nome, socio.cognome].filter(Boolean).join(" ") || "Senza nome"}</Link>{trovata.data.consegnata_il ? ` · dal ${dataBreve(trovata.data.consegnata_il)}` : ""}</dd></>}
            </dl>
          ) : <p className="admin-vuoto">Nessuna tessera con il codice {cerca}.</p>}
        </section>
      )}

      <div className="admin-cols">
        <form action={caricaTessere} className="admin-card admin-form">
          <h2 className="t-title">Carica tessere stampate</h2>
          <p className="t-caption">
            I codici delle tessere di plastica ancora da consegnare. Così in negozio un codice digitato male viene riconosciuto
            e sai quante tessere restano. Un codice già presente non si duplica.
          </p>
          <Area id="elenco" label="Codici" placeholder={"000101\n000102\n000103"} help="Uno per riga, o separati da virgole. Puoi incollarli da Excel." />
          <div className="admin-grid">
            <Campo id="da" label="Oppure dal codice" inputMode="numeric" placeholder="000100" />
            <Campo id="a" label="al codice" inputMode="numeric" placeholder="000999" help="Compresi tutti e due; gli zeri iniziali restano." />
          </div>
          <div className="admin-azioni"><button type="submit" className="psc-btn psc-btn--primary">Carica</button></div>
        </form>

        <form action={salvaRegole} className="admin-card admin-form">
          <h2 className="t-title">Regole</h2>
          <Campo id="formato" label="Formato dei codici fisici" defaultValue={String(regola("tessera_fisica_formato") ?? "")} placeholder="^[0-9]{6}$"
            help="Espressione regolare, es. ^[0-9]{6}$ per sei cifre. Vuoto = qualsiasi codice senza spazi." />
          <Interruttore id="solo_magazzino" label="Consegna solo tessere caricate nel magazzino" defaultChecked={regola("tessere_fisiche_solo_magazzino") === true}
            help="Attivalo dopo aver caricato tutti i codici stampati: un codice che non c'è viene rifiutato." />
          <div className="admin-azioni"><button type="submit" className="psc-btn psc-btn--secondary">Salva regole</button></div>
        </form>
      </div>

      <section className="admin-card">
        <h2 className="t-title">Nel magazzino</h2>
        {ultime.data?.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Codice</th><th>Caricata</th><th></th></tr></thead>
              <tbody>
                {ultime.data.map((t) => (
                  <tr key={t.codice}>
                    <td className="psc-code">{t.codice}</td>
                    <td className="min">{dataBreve(t.creato_il)}</td>
                    <td>
                      <form action={togliDalMagazzino}>
                        <input type="hidden" name="codice" value={t.codice} />
                        <Conferma messaggio={`Togliere ${t.codice} dal magazzino?`} className="psc-btn psc-btn--secondary admin-btn--small admin-btn--danger">Togli</Conferma>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="admin-vuoto">Nessuna tessera nel magazzino.</p>}
        {(magazzino.count ?? 0) > 50 && <p className="t-caption">Le prime 50 di {magazzino.count}, in ordine di codice. Per le altre usa la ricerca.</p>}
      </section>
    </>
  );
}
