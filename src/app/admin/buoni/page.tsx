import type { Metadata } from "next";
import Link from "next/link";
import { param } from "@/components/AuthPage";
import { Esito } from "@/components/admin/Esito";
import { dataMovimento } from "@/lib/admin/form";
import { richiediAdmin } from "@/lib/admin/sessione";
import { codiceBuono } from "@/lib/tipi";
import { annullaBuonoAdmin } from "./azioni";

export const metadata: Metadata = { title: "Buoni premio" };

type Riga = {
  id: string; codice: string; nome_premio: string; punti: number; stato: string;
  creato_il: string; scade_il: string; usato_il: string | null;
  soci: { id: string; nome: string | null; cognome: string | null } | null;
  negozi: { nome: string } | null;
};

const FILTRI = [
  { valore: "attivo", label: "Da usare" },
  { valore: "usato", label: "Usati" },
  { valore: "", label: "Tutti" },
];
const STATI: Record<string, string> = { attivo: "Da usare", usato: "Usato", annullato: "Annullato", scaduto: "Scaduto" };

export default async function Buoni({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const stato = FILTRI.some((f) => f.valore === param(q.stato)) ? param(q.stato) : "attivo";
  const { supabase } = await richiediAdmin();
  let query = supabase
    .from("buoni")
    .select("id, codice, nome_premio, punti, stato, creato_il, scade_il, usato_il, soci(id, nome, cognome), negozi(nome)")
    .order("creato_il", { ascending: false })
    .limit(200);
  if (stato) query = query.eq("stato", stato);
  const { data, error } = await query;
  const righe = (data ?? []) as unknown as Riga[];

  return (
    <>
      <div className="admin-head">
        <div>
          <p className="t-eyebrow">Club</p>
          <h1 className="t-display-l">Buoni premio</h1>
        </div>
        <Link href="/cassa" className="psc-btn psc-btn--primary">Verifica un buono</Link>
      </div>
      <Esito q={error ? { errore: error.message } : q} />
      <p className="t-body">
        I premi che i soci hanno riscattato dall&apos;app. I punti si scalano al riscatto; se il buono scade o viene annullato
        tornano al socio. In cassa il personale lo verifica e lo segna come usato dalla pagina Cassa.
      </p>

      <nav className="admin-nav" aria-label="Filtra per stato">
        {FILTRI.map((f) => (
          <Link key={f.valore} href={f.valore ? `/admin/buoni?stato=${f.valore}` : "/admin/buoni?stato="} className={stato === f.valore ? "is-active" : undefined}>{f.label}</Link>
        ))}
      </nav>

      {righe.length ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>Creato</th><th>Codice</th><th>Premio</th><th>Socio</th><th>Stato</th><th>Scade / usato</th><th></th></tr>
            </thead>
            <tbody>
              {righe.map((r) => (
                <tr key={r.id}>
                  <td className="min">{dataMovimento(r.creato_il)}</td>
                  <td className="min">{codiceBuono(r.codice)}</td>
                  <td>{r.nome_premio}<div className="t-caption">{r.punti} punti</div></td>
                  <td>{r.soci ? <Link href={`/admin/soci/${r.soci.id}`}>{[r.soci.nome, r.soci.cognome].filter(Boolean).join(" ") || "Apri scheda"}</Link> : "—"}</td>
                  <td className="min">{STATI[r.stato] ?? r.stato}</td>
                  <td className="min">
                    {r.usato_il ? `${dataMovimento(r.usato_il)}${r.negozi ? ` · ${r.negozi.nome}` : ""}` : dataMovimento(r.scade_il)}
                  </td>
                  <td className="min">
                    {r.stato === "attivo" && (
                      <form action={annullaBuonoAdmin}>
                        <input type="hidden" name="id" value={r.id} />
                        <button type="submit" className="psc-btn psc-btn--ghost">Annulla e restituisci i punti</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="admin-vuoto">Nessun buono.</p>
      )}
    </>
  );
}
