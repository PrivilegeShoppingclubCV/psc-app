import type { Metadata } from "next";
import Link from "next/link";
import { param } from "@/components/AuthPage";
import { Esito } from "@/components/admin/Esito";
import { dataBreve } from "@/lib/admin/form";
import { clientiDaCompletare, dataInizio } from "@/lib/admin/clienti-da-completare";
import { richiediAdmin } from "@/lib/admin/sessione";

export const metadata: Metadata = { title: "Clienti da completare" };

const MOSTRATI = 500;

export default async function DaCompletare({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const dal = dataInizio(param(q.dal));
  const { supabase } = await richiediAdmin();
  const { clienti, error } = await clientiDaCompletare(supabase, dal);
  const senzaTessera = clienti.filter((c) => !c.tessera).length;

  return (
    <>
      <div className="admin-head">
        <div>
          <Link href="/admin/soci" className="admin-back">← Soci</Link>
          <h1 className="t-display-l">Clienti da completare</h1>
        </div>
        <Link href={`/admin/soci/da-completare/csv?dal=${dal}`} className="psc-btn psc-btn--secondary">Scarica CSV</Link>
      </div>
      <Esito q={error ? { errore: error.message } : q} />
      <p className="t-body">
        Clienti di ReadyPro con nome, cognome ed email ma senza cellulare e/o senza codice tessera, iscritti dal giorno scelto.
        Vengono dagli ultimi file clienti ricevuti (gli ordini Amazon ed eBay sono esclusi). Si completano in ReadyPro: cerca il
        cliente per ID e aggiungi cellulare e tessera. Se il socio ha già scritto il cellulare nell&apos;app, lo trovi nell&apos;ultima colonna.
      </p>

      <form className="admin-cerca" action="/admin/soci/da-completare">
        <div className="psc-field">
          <label className="psc-field__label" htmlFor="dal">Iscritti dal</label>
          <input id="dal" name="dal" type="date" className="psc-field__input" defaultValue={dal} />
        </div>
        <button type="submit" className="psc-btn psc-btn--primary">Aggiorna</button>
      </form>

      <p className="t-caption">
        {clienti.length} clienti, di cui {senzaTessera} senza tessera.
        {clienti.length > MOSTRATI && ` Qui ne vedi ${MOSTRATI}: scarica il CSV per l'elenco completo.`}
      </p>

      {clienti.length ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>ID ReadyPro</th><th>Cliente</th><th>Manca</th><th>Tessera</th><th>Iscritto</th><th>Cellulare in app</th></tr>
            </thead>
            <tbody>
              {clienti.slice(0, MOSTRATI).map((c, i) => (
                <tr key={`${c.id_readypro ?? ""}-${i}`}>
                  <td className="min">{c.id_readypro ?? "—"}</td>
                  <td>
                    {c.nome} {c.cognome}
                    <div className="t-caption">{c.email}{c.cellulare ? ` · ${c.cellulare}` : ""}</div>
                  </td>
                  <td>{c.manca}</td>
                  <td className="min">{c.tessera ?? "—"}</td>
                  <td className="min">{dataBreve(c.iscritto_il)}</td>
                  <td className="min">{c.telefono_app ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="admin-vuoto">Nessun cliente da completare.</p>
      )}
    </>
  );
}
