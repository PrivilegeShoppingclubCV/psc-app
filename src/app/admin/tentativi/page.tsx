import type { Metadata } from "next";
import Link from "next/link";
import { param } from "@/components/AuthPage";
import { Esito } from "@/components/admin/Esito";
import { dataMovimento } from "@/lib/admin/form";
import { richiediAdmin } from "@/lib/admin/sessione";

export const metadata: Metadata = { title: "Tentativi non riusciti" };

type Riga = {
  id: number; creato_il: string; tipo: "collegamento" | "iscrizione"; email: string | null; numero_tessera: string | null;
  motivo: string; socio_id: string | null; socio: string | null; nome: string | null; cognome: string | null;
  telefono: string | null; ora_collegato: boolean;
};

const TIPI = [
  { valore: "", label: "Tutti" },
  { valore: "collegamento", label: "Collegamento tessera" },
  { valore: "iscrizione", label: "Iscrizione" },
];

export default async function Tentativi({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const cerca = param(q.cerca).trim();
  const tipo = TIPI.some((t) => t.valore === param(q.tipo)) ? param(q.tipo) : "";
  const { supabase } = await richiediAdmin();
  const { data, error } = await supabase.rpc("admin_tentativi_falliti", { p_cerca: cerca || null, p_tipo: tipo || null });
  const righe = (data ?? []) as Riga[];
  const link = (t: string) => `/admin/tentativi?${new URLSearchParams({ ...(cerca && { cerca }), ...(t && { tipo: t }) })}`;

  return (
    <>
      <div className="admin-head">
        <div>
          <p className="t-eyebrow">Club</p>
          <h1 className="t-display-l">Tentativi non riusciti</h1>
        </div>
      </div>
      <Esito q={error ? { errore: error.message } : q} />
      <p className="t-body">
        Chi negli ultimi 7 giorni ha provato a collegare la tessera o a iscriversi dall&apos;app e non ci è riuscito, con il motivo.
        Le righe più vecchie di 7 giorni si cancellano da sole. &quot;Ora collegato&quot; vuol dire che poi ce l&apos;ha fatta.
      </p>

      <form className="admin-cerca" action="/admin/tentativi">
        {tipo && <input type="hidden" name="tipo" value={tipo} />}
        <div className="psc-field">
          <label className="psc-field__label" htmlFor="cerca">Cerca</label>
          <input id="cerca" name="cerca" type="search" className="psc-field__input" defaultValue={cerca}
            placeholder="Email, numero tessera, nome, cellulare o motivo" />
        </div>
        <button type="submit" className="psc-btn psc-btn--primary">Cerca</button>
      </form>

      <nav className="admin-nav" aria-label="Filtra per tipo">
        {TIPI.map((t) => (
          <Link key={t.valore} href={link(t.valore)} className={tipo === t.valore ? "is-active" : undefined}>{t.label}</Link>
        ))}
      </nav>

      {righe.length ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>Quando</th><th>Tipo</th><th>Chi</th><th>Tessera scritta</th><th>Motivo</th><th>Scheda</th><th></th></tr>
            </thead>
            <tbody>
              {righe.map((r) => (
                <tr key={r.id}>
                  <td className="min">{dataMovimento(r.creato_il)}</td>
                  <td className="min">{r.tipo === "collegamento" ? "Collegamento" : "Iscrizione"}</td>
                  <td>
                    {r.email ?? "—"}
                    {(r.nome || r.cognome || r.telefono) && (
                      <div className="t-caption">{[[r.nome, r.cognome].filter(Boolean).join(" "), r.telefono].filter(Boolean).join(" · ")}</div>
                    )}
                  </td>
                  <td className="min">{r.numero_tessera ?? ""}</td>
                  <td>{r.motivo}</td>
                  <td>{r.socio_id ? <Link href={`/admin/soci/${r.socio_id}`}>{r.socio || "Apri scheda"}</Link> : "—"}</td>
                  <td className="min">{r.ora_collegato ? "Ora collegato" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="admin-vuoto">{cerca ? "Nessun tentativo trovato." : "Nessun tentativo non riuscito negli ultimi 7 giorni."}</p>
      )}
    </>
  );
}
