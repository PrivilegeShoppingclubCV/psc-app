import type { Metadata } from "next";
import Link from "next/link";
import { param } from "@/components/AuthPage";
import { Esito } from "@/components/admin/Esito";
import { formatPunti } from "@/lib/format";
import { richiediStaff } from "../sessione";
import { TestaCassa } from "../Testa";
import "../../admin/admin.css";

export const metadata: Metadata = { title: "Cassa: soci", robots: { index: false, follow: false } };

const PER_PAGINA = 50;

type Riga = {
  id: string; nome: string | null; cognome: string | null; email: string | null; telefono: string | null;
  fisica: string | null; digitale: string | null; stato: string; ha_app: boolean; in_attivazione: boolean;
  saldo: number; totale: number;
};

/** Ricerca dei soci per l'operatore: tessera, nome, email o telefono. */
export default async function SociCassa({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const accesso = await richiediStaff();
  const cerca = param(q.q).trim();
  const pagina = Math.max(1, Number(param(q.pagina)) || 1);
  const { data, error } = await accesso.supabase.rpc("personale_cerca_soci", {
    p_testo: cerca, p_limite: PER_PAGINA, p_da: (pagina - 1) * PER_PAGINA,
  });
  const soci = (data ?? []) as Riga[];
  const totale = soci[0]?.totale ?? 0;
  const pagine = Math.max(1, Math.ceil(totale / PER_PAGINA));
  const link = (p: number) => `/cassa/soci?${new URLSearchParams({ ...(cerca ? { q: cerca } : {}), ...(p > 1 ? { pagina: String(p) } : {}) })}`;

  return (
    <main className="cassa cassa--larga">
      <TestaCassa nome={accesso.nome ?? accesso.email} admin={accesso.admin} attiva="soci" />
      <div className="page-head">
        <p className="t-eyebrow">Negozio</p>
        <h1 className="t-display-l">Soci</h1>
      </div>
      <Esito q={error ? { errore: error.message } : q} />

      <form className="admin-cerca" action="/cassa/soci">
        <div className="psc-field">
          <label className="psc-field__label" htmlFor="q">Cerca</label>
          <input id="q" name="q" type="search" className="psc-field__input" defaultValue={cerca} autoFocus
            placeholder="Tessera, nome, cognome, email o telefono" />
        </div>
        <button type="submit" className="psc-btn psc-btn--primary">Cerca</button>
      </form>

      <p className="t-caption">{totale} soci{cerca ? ` per «${cerca}»` : ""}</p>

      {soci.length ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Tessera</th><th>Socio</th><th>App</th><th className="num">Punti</th></tr></thead>
            <tbody>
              {soci.map((s) => (
                <tr key={s.id}>
                  <td>
                    <Link href={`/cassa/soci/${s.id}`}>{s.fisica ?? s.digitale ?? "Nessuna"}</Link>
                    {s.fisica && s.digitale && <div className="t-caption">{s.digitale}</div>}
                  </td>
                  <td>
                    <Link href={`/cassa/soci/${s.id}`}>{[s.nome, s.cognome].filter(Boolean).join(" ") || "—"}</Link>
                    {s.stato !== "attivo" && <> <span className="psc-badge psc-badge--danger">{s.stato}</span></>}
                    <div className="t-caption">{s.telefono ?? s.email}</div>
                  </td>
                  <td>
                    {s.in_attivazione
                      ? <span className="psc-badge psc-badge--warning">In attivazione</span>
                      : s.ha_app ? <span className="psc-badge psc-badge--success">Sì</span> : <span className="min">No</span>}
                  </td>
                  <td className="num">{formatPunti(s.saldo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="admin-vuoto">Nessun socio trovato. <Link href="/cassa/soci/nuovo">Iscrivi un socio nuovo</Link></p>
      )}

      {pagine > 1 && (
        <div className="admin-pagine">
          {pagina > 1 && <Link href={link(pagina - 1)} className="psc-btn psc-btn--secondary admin-btn--small">Precedenti</Link>}
          <span className="t-caption">Pagina {pagina} di {pagine}</span>
          {pagina < pagine && <Link href={link(pagina + 1)} className="psc-btn psc-btn--secondary admin-btn--small">Successivi</Link>}
        </div>
      )}
    </main>
  );
}
