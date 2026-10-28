import type { Metadata } from "next";
import { Campo, Scelta } from "@/components/admin/Campi";
import { Conferma } from "@/components/admin/Conferma";
import { Esito } from "@/components/admin/Esito";
import { dataBreve } from "@/lib/admin/form";
import { richiediAdmin } from "@/lib/admin/sessione";
import { aggiungiStaff, modificaStaff, rimuoviStaff } from "./azioni";

export const metadata: Metadata = { title: "Staff" };

type Membro = { user_id: string; email: string; ruolo: string; negozio_id: string | null; negozio: string | null; nome: string | null; creato_il: string };

const RUOLI = [
  { value: "admin", label: "Admin: tutto il pannello" },
  { value: "operatore", label: "Operatore: cassa" },
];

export default async function Staff({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const { supabase, userId } = await richiediAdmin();
  const [staff, negozi] = await Promise.all([
    supabase.rpc("admin_elenco_staff"),
    supabase.from("negozi").select("id, nome").order("ordine").order("nome"),
  ]);
  const opzioniNegozi = [{ value: "", label: "Tutti i negozi" }, ...(negozi.data ?? []).map((n) => ({ value: n.id, label: n.nome }))];

  return (
    <>
      <div className="admin-head">
        <div>
          <p className="t-eyebrow">Accessi</p>
          <h1 className="t-display-l">Staff</h1>
        </div>
      </div>
      <Esito q={staff.error ? { errore: staff.error.message } : q} />

      <section className="admin-card">
        <h2 className="t-title">Aggiungi una persona</h2>
        <p className="t-caption">
          La persona deve prima entrare una volta nell&apos;app con la sua email (Accedi → link via email): così l&apos;account esiste e qui lo puoi trovare.
          Gli admin entrano nel pannello da <strong>/admin</strong>. Gli operatori per ora non hanno una schermata dedicata.
        </p>
        <form action={aggiungiStaff} className="admin-form">
          <div className="admin-grid">
            <Campo id="email" label="Email" type="email" required />
            <Campo id="nome" label="Nome" help="Facoltativo, per riconoscerlo." />
            <Scelta id="ruolo" label="Ruolo" opzioni={RUOLI} defaultValue="operatore" />
            <Scelta id="negozio_id" label="Negozio" opzioni={opzioniNegozi} help="Solo per gli operatori." />
          </div>
          <div className="admin-azioni"><button type="submit" className="psc-btn psc-btn--primary">Aggiungi</button></div>
        </form>
      </section>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr><th>Persona</th><th>Ruolo e negozio</th><th>Dal</th><th></th></tr></thead>
          <tbody>
            {((staff.data ?? []) as Membro[]).map((m) => (
              <tr key={m.user_id}>
                <td>
                  {m.nome ?? m.email}{m.user_id === userId && " (tu)"}
                  {m.nome && <div className="t-caption">{m.email}</div>}
                </td>
                <td>
                  <form action={modificaStaff} className="admin-azioni">
                    <input type="hidden" name="user_id" value={m.user_id} />
                    <select name="ruolo" defaultValue={m.ruolo} className="psc-field__input" aria-label="Ruolo">
                      <option value="admin">Admin</option>
                      <option value="operatore">Operatore</option>
                    </select>
                    <select name="negozio_id" defaultValue={m.negozio_id ?? ""} className="psc-field__input" aria-label="Negozio">
                      {opzioniNegozi.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <button type="submit" className="psc-btn psc-btn--secondary admin-btn--small">Aggiorna</button>
                  </form>
                </td>
                <td className="min">{dataBreve(m.creato_il)}</td>
                <td>
                  {m.user_id !== userId && (
                    <form action={rimuoviStaff}>
                      <input type="hidden" name="user_id" value={m.user_id} />
                      <Conferma messaggio={`Togliere ${m.email} dallo staff?`} className="psc-btn psc-btn--secondary admin-btn--small admin-btn--danger">Togli</Conferma>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
