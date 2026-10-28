import type { Metadata } from "next";
import Link from "next/link";
import { Esito } from "@/components/admin/Esito";
import { richiediAdmin } from "@/lib/admin/sessione";

export const metadata: Metadata = { title: "Negozi" };

export default async function Negozi({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const { supabase } = await richiediAdmin();
  const { data: negozi, error } = await supabase
    .from("negozi")
    .select("id, nome, codice_gestionale, indirizzo, cap, citta, orari_testo, attivo")
    .order("ordine")
    .order("nome");

  return (
    <>
      <div className="admin-head">
        <div>
          <p className="t-eyebrow">Catena</p>
          <h1 className="t-display-l">Negozi</h1>
        </div>
        <Link href="/admin/negozi/nuovo" className="psc-btn psc-btn--primary">Nuovo negozio</Link>
      </div>
      <Esito q={error ? { errore: error.message } : q} />

      {negozi?.length ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Negozio</th><th>Codice gestionale</th><th>Orari</th><th>Stato</th></tr></thead>
            <tbody>
              {negozi.map((n) => (
                <tr key={n.id}>
                  <td>
                    <Link href={`/admin/negozi/${n.id}`}>{n.nome}</Link>
                    <div className="t-caption">{[n.indirizzo, [n.cap, n.citta].filter(Boolean).join(" ")].filter(Boolean).join(", ")}</div>
                  </td>
                  <td className="min">{n.codice_gestionale ?? "—"}</td>
                  <td className="min">{n.orari_testo ?? "—"}</td>
                  <td>{n.attivo ? <span className="psc-badge psc-badge--success">Attivo</span> : <span className="psc-badge psc-badge--info">Nascosto</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="admin-vuoto">Nessun negozio. <Link href="/admin/negozi/nuovo">Aggiungi il primo</Link>.</p>
      )}
    </>
  );
}
