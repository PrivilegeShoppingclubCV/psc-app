import Link from "next/link";
import { dataOra } from "@/lib/admin/form";
import { richiediAdmin } from "@/lib/admin/sessione";

export default async function Panoramica() {
  const { supabase } = await richiediAdmin();
  const adesso = new Date().toISOString();

  const [soci, conApp, offerteInCorso, bozze, attesa, importi] = await Promise.all([
    supabase.from("soci").select("id", { count: "exact", head: true }).eq("stato", "attivo"),
    supabase.from("soci").select("id", { count: "exact", head: true }).eq("stato", "attivo").not("user_id", "is", null),
    supabase.from("offerte").select("id", { count: "exact", head: true })
      .eq("pubblicata", true).lte("valida_dal", adesso).or(`valida_al.is.null,valida_al.gt.${adesso}`),
    supabase.from("offerte").select("id", { count: "exact", head: true }).eq("pubblicata", false),
    supabase.from("soci_in_attesa_cassa").select("id, numero_tessera, nome, cognome, email, ore_di_attesa, inviata_il").limit(10),
    supabase.from("import_batch").select("id, nome_file, stato, righe_totali, righe_ok, righe_errore, creato_il").order("creato_il", { ascending: false }).limit(5),
  ]);

  const stat = [
    { label: "Soci attivi", valore: soci.count, href: "/admin/soci" },
    { label: "Con l'app", valore: conApp.count, href: "/admin/soci?filtro=app" },
    { label: "Offerte in corso", valore: offerteInCorso.count, href: "/admin/offerte" },
    { label: "Offerte in bozza", valore: bozze.count, href: "/admin/offerte?filtro=bozze" },
  ];

  return (
    <>
      <div className="admin-head">
        <div>
          <p className="t-eyebrow">Pannello admin</p>
          <h1 className="t-display-l">Panoramica</h1>
        </div>
        <Link href="/admin/offerte/nuova" className="psc-btn psc-btn--primary">Nuova offerta</Link>
      </div>

      <div className="admin-stats">
        {stat.map((s) => (
          <Link key={s.label} href={s.href} className="admin-stat">
            <span className="t-eyebrow">{s.label}</span>
            <span className="admin-stat__valore">{s.valore ?? "—"}</span>
          </Link>
        ))}
      </div>

      <div className="admin-cols">
        <section className="admin-card">
          <h2 className="t-title">Tessere in attesa della cassa</h2>
          <p className="t-caption">
            Iscritti dall&apos;app che ReadyPro non ha ancora ricevuto: finché non compaiono in un import, l&apos;app nasconde il loro codice a barre.
          </p>
          {attesa.data?.length ? (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead><tr><th>Tessera</th><th>Socio</th><th>Inviata</th><th className="num">Ore</th></tr></thead>
                <tbody>
                  {attesa.data.map((s) => (
                    <tr key={s.id}>
                      <td><Link href={`/admin/soci/${s.id}`}>{s.numero_tessera}</Link></td>
                      <td>{[s.nome, s.cognome].filter(Boolean).join(" ") || s.email}</td>
                      <td className="min">{s.inviata_il ? dataOra(s.inviata_il) : "Non ancora"}</td>
                      <td className="num">{Number(s.ore_di_attesa).toLocaleString("it-IT")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="admin-vuoto">Nessuna tessera in attesa.</p>
          )}
        </section>

        <section className="admin-card">
          <h2 className="t-title">Ultimi import</h2>
          {importi.data?.length ? (
            <ul className="list">
              {importi.data.map((b) => (
                <li key={b.id}>
                  <span className="list__main">
                    <span>{b.nome_file}</span>
                    <span className="t-caption">{dataOra(b.creato_il)} · {b.stato}</span>
                  </span>
                  <span className="list__value">
                    {b.righe_ok}/{b.righe_totali}{b.righe_errore ? ` · ${b.righe_errore} errori` : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="admin-vuoto">Ancora nessun import dal gestionale.</p>
          )}
          <Link href="/admin/gestionale" className="psc-btn psc-btn--secondary">Gestionale</Link>
        </section>
      </div>
    </>
  );
}
