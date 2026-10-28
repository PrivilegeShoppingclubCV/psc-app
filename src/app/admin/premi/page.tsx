import type { Metadata } from "next";
import Link from "next/link";
import { Esito } from "@/components/admin/Esito";
import { richiediAdmin } from "@/lib/admin/sessione";
import { formatEuro, formatPunti } from "@/lib/format";

export const metadata: Metadata = { title: "Premi" };

export default async function Premi({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const { supabase } = await richiediAdmin();
  const { data: premi, error } = await supabase.from("premi").select("id, nome, soglia_punti, valore_euro, attivo").order("soglia_punti");

  return (
    <>
      <div className="admin-head">
        <div>
          <p className="t-eyebrow">Catalogo punti</p>
          <h1 className="t-display-l">Premi</h1>
        </div>
        <Link href="/admin/premi/nuovo" className="psc-btn psc-btn--primary">Nuovo premio</Link>
      </div>
      <Esito q={error ? { errore: error.message } : q} />

      {premi?.length ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Premio</th><th className="num">Punti</th><th className="num">Valore</th><th>Stato</th></tr></thead>
            <tbody>
              {premi.map((p) => (
                <tr key={p.id}>
                  <td><Link href={`/admin/premi/${p.id}`}>{p.nome}</Link></td>
                  <td className="num">{formatPunti(p.soglia_punti)}</td>
                  <td className="num">{p.valore_euro !== null ? formatEuro(p.valore_euro) : "—"}</td>
                  <td>{p.attivo ? <span className="psc-badge psc-badge--success">Attivo</span> : <span className="psc-badge psc-badge--info">Nascosto</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="admin-vuoto">Nessun premio. <Link href="/admin/premi/nuovo">Aggiungi il primo</Link>.</p>
      )}
    </>
  );
}
