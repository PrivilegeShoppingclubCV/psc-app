import type { Metadata } from "next";
import Link from "next/link";
import { param } from "@/components/AuthPage";
import { Esito } from "@/components/admin/Esito";
import { dataMovimento } from "@/lib/admin/form";
import { richiediAdmin } from "@/lib/admin/sessione";
import { formatEuro, formatPunti } from "@/lib/format";

export const metadata: Metadata = { title: "Scontrini" };

const PER_PAGINA = 25;

type Riga = {
  id: string; numero_documento: string; data_scontrino: string; totale: number; punti: number; cassa: string | null;
  negozi: { nome: string } | null; soci: { id: string; nome: string | null; cognome: string | null } | null;
};

/** Tutti gli scontrini dei soci degli ultimi 30 giorni, con l'anteprima di come li vede il socio. */
export default async function ScontriniAdmin({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const cerca = param(q.q).trim();
  const pagina = Math.max(1, Number(param(q.pagina)) || 1);
  const { supabase } = await richiediAdmin();
  let query = supabase.from("scontrini")
    .select("id, numero_documento, data_scontrino, totale, punti, cassa, negozi(nome), soci(id, nome, cognome)")
    .order("data_scontrino", { ascending: false }).order("id", { ascending: false })
    .range((pagina - 1) * PER_PAGINA, pagina * PER_PAGINA);
  if (cerca) query = query.ilike("numero_documento", `%${cerca.replace(/[,()*%\\]/g, "")}%`);
  const { data, error } = await query;
  const tutti = (data ?? []) as unknown as Riga[];
  // Uno in più per sapere se c'è una pagina dopo, senza contare tutta la tabella.
  const scontrini = tutti.slice(0, PER_PAGINA);
  const successivi = tutti.length > PER_PAGINA;
  const link = (p: number) => `/admin/scontrini?${new URLSearchParams({ ...(cerca ? { q: cerca } : {}), ...(p > 1 ? { pagina: String(p) } : {}) })}`;
  const { data: conProdotti } = scontrini.length
    ? await supabase.from("scontrini").select("numero_documento, numero_norm").in("id", scontrini.map((s) => s.id))
    : { data: [] };
  const norm = (conProdotti ?? []).map((s) => s.numero_norm as string);
  const { data: righe } = norm.length
    ? await supabase.from("scontrini_righe").select("numero_documento").in("numero_documento", norm)
    : { data: [] };
  const prodotti = new Map<string, number>();
  for (const r of righe ?? []) prodotti.set(r.numero_documento, (prodotti.get(r.numero_documento) ?? 0) + 1);
  const normDi = new Map((conProdotti ?? []).map((s) => [s.numero_documento, s.numero_norm as string]));

  return (
    <>
      <div className="admin-head">
        <div>
          <p className="t-eyebrow">Club</p>
          <h1 className="t-display-l">Scontrini</h1>
          <p className="t-caption">Gli scontrini dei soci degli ultimi 30 giorni, come arrivano da ReadyPro. Apri «Anteprima» per vederli come li vede il socio in app.</p>
        </div>
        <div className="admin-azioni">
          <Link href="/admin/scontrini/esempio" className="psc-btn psc-btn--secondary">Scontrino di esempio</Link>
        </div>
      </div>
      <Esito q={error ? { errore: error.message } : q} />

      <form className="admin-cerca" action="/admin/scontrini">
        <div className="psc-field">
          <label className="psc-field__label" htmlFor="q">N. documento</label>
          <input id="q" name="q" type="search" className="psc-field__input" defaultValue={cerca} />
        </div>
        <button type="submit" className="psc-btn psc-btn--primary">Cerca</button>
      </form>

      {scontrini.length ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Data</th><th>N. doc.</th><th>Socio</th><th>Negozio</th><th className="num">Prodotti</th><th className="num">Totale</th><th className="num">Punti</th><th></th></tr></thead>
            <tbody>
              {scontrini.map((s) => (
                <tr key={s.id}>
                  <td className="min">{dataMovimento(s.data_scontrino)}</td>
                  <td className="min">{s.numero_documento}</td>
                  <td>{s.soci ? <Link href={`/admin/soci/${s.soci.id}`}>{[s.soci.nome, s.soci.cognome].filter(Boolean).join(" ") || "Senza nome"}</Link> : "—"}</td>
                  <td className="min">{s.negozi?.nome ?? s.cassa ?? "—"}</td>
                  <td className="num">{prodotti.get(normDi.get(s.numero_documento) ?? "") ?? 0}</td>
                  <td className="num">{formatEuro(Number(s.totale))}</td>
                  <td className="num">{formatPunti(s.punti)}</td>
                  <td><Link href={`/admin/scontrini/${s.id}`} className="psc-btn psc-btn--secondary admin-btn--small">Anteprima</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="admin-vuoto">
          Nessuno scontrino{cerca ? ` con «${cerca}»` : " negli ultimi 30 giorni"}. Arrivano con l&apos;invio delle vendite da ReadyPro, solo per gli acquisti fatti con la tessera.
        </p>
      )}

      {(pagina > 1 || successivi) && (
        <div className="admin-pagine">
          {pagina > 1 && <Link href={link(pagina - 1)} className="psc-btn psc-btn--secondary admin-btn--small">Precedenti</Link>}
          <span className="t-caption">Pagina {pagina}</span>
          {successivi && <Link href={link(pagina + 1)} className="psc-btn psc-btn--secondary admin-btn--small">Successivi</Link>}
        </div>
      )}
    </>
  );
}
