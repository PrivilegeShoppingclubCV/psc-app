import type { Metadata } from "next";
import Link from "next/link";
import { param } from "@/components/AuthPage";
import { Esito } from "@/components/admin/Esito";
import { dataMovimento } from "@/lib/admin/form";
import { richiediAdmin } from "@/lib/admin/sessione";
import { risolviSegnalazione } from "./azioni";

export const metadata: Metadata = { title: "Segnalazioni" };

const CAMPI: Record<string, string> = {
  nome: "Nome", cognome: "Cognome", email: "Email", telefono: "Cellulare", data_nascita: "Data di nascita",
  indirizzo: "Indirizzo", tessera: "Tessera", punti: "Punti", altro: "Altro",
};

type Riga = {
  id: string; campo: string; messaggio: string; stato: string; nota_admin: string | null; creato_il: string; risolta_il: string | null;
  soci: { id: string; nome: string | null; cognome: string | null; email: string | null; telefono: string | null } | null;
};

export default async function Segnalazioni({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const risolte = param(q.filtro) === "risolte";
  const { supabase } = await richiediAdmin();
  const { data, error } = await supabase
    .from("segnalazioni_dati")
    .select("id, campo, messaggio, stato, nota_admin, creato_il, risolta_il, soci(id, nome, cognome, email, telefono)")
    .eq("stato", risolte ? "risolta" : "aperta")
    .order("creato_il", { ascending: risolte ? false : true })
    .limit(200);
  const righe = (data ?? []) as unknown as Riga[];

  return (
    <>
      <div className="admin-head">
        <div>
          <p className="t-eyebrow">Club</p>
          <h1 className="t-display-l">Segnalazioni</h1>
        </div>
      </div>
      <Esito q={error ? { errore: error.message } : q} />
      <p className="t-body">
        Dati sbagliati segnalati dai soci dall&apos;app. Correggi il dato nella scheda del socio (e in ReadyPro, se serve), poi segna la segnalazione come risolta.
      </p>

      <nav className="admin-nav" aria-label="Filtra le segnalazioni">
        <Link href="/admin/segnalazioni" className={!risolte ? "is-active" : undefined}>Da sistemare</Link>
        <Link href="/admin/segnalazioni?filtro=risolte" className={risolte ? "is-active" : undefined}>Risolte</Link>
      </nav>

      {righe.length ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>Quando</th><th>Socio</th><th>Dato</th><th>Messaggio</th><th>{risolte ? "Nota" : ""}</th></tr>
            </thead>
            <tbody>
              {righe.map((r) => (
                <tr key={r.id}>
                  <td className="min">{dataMovimento(r.creato_il)}</td>
                  <td>
                    {r.soci ? <Link href={`/admin/soci/${r.soci.id}`}>{[r.soci.nome, r.soci.cognome].filter(Boolean).join(" ") || "Senza nome"}</Link> : "—"}
                    <div className="t-caption">{r.soci?.email ?? r.soci?.telefono}</div>
                  </td>
                  <td>{CAMPI[r.campo] ?? r.campo}</td>
                  <td style={{ whiteSpace: "pre-wrap" }}>{r.messaggio}</td>
                  <td>
                    {risolte ? (
                      <>{r.nota_admin ?? ""}<div className="t-caption">{dataMovimento(r.risolta_il)}</div></>
                    ) : (
                      <form action={risolviSegnalazione} className="admin-azioni">
                        <input type="hidden" name="id" value={r.id} />
                        <input name="nota" className="psc-field__input" placeholder="Nota (facoltativa)" aria-label="Nota" maxLength={300} />
                        <button type="submit" className="psc-btn psc-btn--secondary">Risolta</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="admin-vuoto">{risolte ? "Nessuna segnalazione risolta." : "Nessuna segnalazione da sistemare."}</p>
      )}
    </>
  );
}
