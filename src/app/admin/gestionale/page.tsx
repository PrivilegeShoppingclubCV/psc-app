import type { Metadata } from "next";
import Link from "next/link";
import { Conferma } from "@/components/admin/Conferma";
import { Esito } from "@/components/admin/Esito";
import { dataOra } from "@/lib/admin/form";
import { richiediAdmin } from "@/lib/admin/sessione";
import { elaboraImport, revocaChiave, salvaMappatura } from "./azioni";
import { CreaChiave } from "./CreaChiave";

export const metadata: Metadata = { title: "Gestionale" };

export default async function Gestionale({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const { supabase } = await richiediAdmin();
  const [chiavi, mappatura, importi, attesa] = await Promise.all([
    supabase.from("gestionale_chiavi").select("id, nome, prefisso, creata_il, ultimo_uso, revocata_il").order("creata_il", { ascending: false }),
    supabase.from("impostazioni").select("valore").eq("chiave", "gestionale_mappatura_soci").maybeSingle(),
    supabase.from("import_batch").select("id, tipo, nome_file, stato, righe_totali, righe_ok, righe_saltate, righe_errore, note, creato_il").order("creato_il", { ascending: false }).limit(20),
    supabase.from("tessere_in_attesa_cassa").select("id", { count: "exact", head: true }),
  ]);

  // Il file più recente ancora da elaborare: se ne mostrano le colonne per scrivere la mappatura.
  const daElaborare = importi.data?.find((b) => b.stato === "caricato" && b.tipo === "soci");
  const { data: primaRiga } = daElaborare
    ? await supabase.from("import_righe").select("dati").eq("batch_id", daElaborare.id).order("numero_riga").limit(1).maybeSingle()
    : { data: null };
  const colonne = primaRiga ? Object.keys(primaRiga.dati as Record<string, unknown>) : [];

  return (
    <>
      <div className="admin-head">
        <div>
          <p className="t-eyebrow">ReadyPro</p>
          <h1 className="t-display-l">Gestionale</h1>
        </div>
      </div>
      <Esito q={q} />

      <div className="admin-stats">
        <Link href="/admin/soci?filtro=attesa" className="admin-stat">
          <span className="t-eyebrow">Tessere in attesa della cassa</span>
          <span className="admin-stat__valore">{attesa.count ?? "—"}</span>
        </Link>
      </div>

      <section className="admin-card">
        <h2 className="t-title">Chiavi del server dei negozi</h2>
        <p className="t-caption">Lo script di sincronizzazione (tools/readypro) usa una chiave per inviare i clienti e ritirare le tessere nuove.</p>
        <CreaChiave />
        {chiavi.data?.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Nome</th><th>Inizia con</th><th>Creata</th><th>Ultimo uso</th><th></th></tr></thead>
              <tbody>
                {chiavi.data.map((c) => (
                  <tr key={c.id}>
                    <td>{c.nome}</td>
                    <td className="min"><code>{c.prefisso}…</code></td>
                    <td className="min">{dataOra(c.creata_il)}</td>
                    <td className="min">{dataOra(c.ultimo_uso)}</td>
                    <td>
                      {c.revocata_il ? (
                        <span className="psc-badge psc-badge--danger">Revocata</span>
                      ) : (
                        <form action={revocaChiave}>
                          <input type="hidden" name="id" value={c.id} />
                          <Conferma messaggio={`Revocare la chiave "${c.nome}"? Lo script che la usa smetterà subito di funzionare.`} className="psc-btn psc-btn--secondary admin-btn--small admin-btn--danger">Revoca</Conferma>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className="admin-card">
        <h2 className="t-title">Colonne del CSV clienti</h2>
        <p className="t-caption">
          Per ogni campo dell&apos;app, il nome esatto della colonna nel file di ReadyPro. Campi possibili: numero_tessera (obbligatorio),
          altra_tessera (un vecchio codice dello stesso cliente, usato solo per riconoscerlo), nome, cognome, email, telefono, data_nascita, cap, citta, livello, punti, negozio, iscritto_il, consenso_privacy, consenso_marketing, consenso_profilazione.
          Finché è vuota, i file arrivano ma restano da elaborare.
        </p>
        {daElaborare && (
          <div className="notice">
            <p style={{ margin: 0 }}>
              <strong>{daElaborare.nome_file}</strong> ({dataOra(daElaborare.creato_il)}) aspetta di essere elaborato. Le sue colonne sono:{" "}
              {colonne.length ? colonne.map((c) => <code key={c}>{c}</code>).reduce<React.ReactNode[]>((a, c) => (a.length ? [...a, ", ", c] : [c]), []) : "nessuna riga"}.
            </p>
          </div>
        )}
        <form action={salvaMappatura} className="admin-form">
          <textarea
            name="mappatura"
            aria-label="Mappatura delle colonne (JSON)"
            className="psc-field__input admin-textarea admin-chiave"
            rows={8}
            defaultValue={JSON.stringify(mappatura.data?.valore ?? {}, null, 2)}
          />
          <div className="admin-azioni"><button type="submit" className="psc-btn psc-btn--primary">Salva mappatura</button></div>
        </form>
        {daElaborare && (
          <form action={elaboraImport}>
            <input type="hidden" name="id" value={daElaborare.id} />
            <button type="submit" className="psc-btn psc-btn--secondary">Elabora {daElaborare.nome_file} con la mappatura salvata</button>
          </form>
        )}
      </section>

      <section className="admin-card">
        <h2 className="t-title">Ultimi import</h2>
        {importi.data?.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>File</th><th>Ricevuto</th><th>Stato</th><th className="num">Righe</th><th className="num">Ok</th><th className="num">Saltate</th><th className="num">Errori</th></tr></thead>
              <tbody>
                {importi.data.map((b) => (
                  <tr key={b.id}>
                    <td>{b.nome_file}<div className="t-caption">{b.tipo === "soci" ? "Clienti" : "Movimenti punti"}{b.note ? ` · ${b.note}` : ""}</div></td>
                    <td className="min">{dataOra(b.creato_il)}</td>
                    <td>{b.stato}</td>
                    <td className="num">{b.righe_totali}</td>
                    <td className="num">{b.righe_ok}</td>
                    <td className="num">{b.righe_saltate}</td>
                    <td className="num">{b.righe_errore}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="admin-vuoto">Ancora nessun import.</p>}
      </section>
    </>
  );
}
