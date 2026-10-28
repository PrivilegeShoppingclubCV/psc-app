import type { Metadata } from "next";
import Link from "next/link";
import { param } from "@/components/AuthPage";
import { Esito } from "@/components/admin/Esito";
import { dataBreve } from "@/lib/admin/form";
import { richiediAdmin } from "@/lib/admin/sessione";
import { formatPunti } from "@/lib/format";

export const metadata: Metadata = { title: "Soci" };

const PER_PAGINA = 50;
const FILTRI = [
  { value: "", label: "Tutti" },
  { value: "app", label: "Con l'app" },
  { value: "attesa", label: "In attesa della cassa" },
  { value: "sospesi", label: "Sospesi o cessati" },
];

export default async function Soci({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const cerca = param(q.q);
  const filtro = param(q.filtro);
  const pagina = Math.max(1, Number(param(q.pagina)) || 1);
  const { supabase } = await richiediAdmin();

  let query = supabase
    .from("soci")
    .select("id, numero_tessera, nome, cognome, email, livello, stato, stato_cassa, origine, user_id, iscritto_il", { count: "exact" })
    .order("cognome", { nullsFirst: false })
    .order("nome")
    .range((pagina - 1) * PER_PAGINA, pagina * PER_PAGINA - 1);
  // Ogni parola deve comparire in tessera, nome, cognome o email. Via i caratteri che hanno un senso nei filtri.
  for (const parola of cerca.replace(/[,()*%\\]/g, " ").split(/\s+/).filter(Boolean)) {
    query = query.or(["numero_tessera", "nome", "cognome", "email"].map((c) => `${c}.ilike.%${parola}%`).join(","));
  }
  if (filtro === "app") query = query.not("user_id", "is", null);
  if (filtro === "attesa") query = query.eq("stato_cassa", "in_attivazione");
  if (filtro === "sospesi") query = query.neq("stato", "attivo");
  const { data: soci, count, error } = await query;

  const ids = (soci ?? []).map((s) => s.id);
  const { data: saldi } = ids.length
    ? await supabase.from("saldi_punti").select("socio_id, saldo").in("socio_id", ids)
    : { data: [] };
  const saldo = new Map((saldi ?? []).map((s) => [s.socio_id, s.saldo]));

  const link = (p: Record<string, string | number>) => {
    const u = new URLSearchParams(Object.entries({ q: cerca, filtro, ...p }).filter(([k, v]) => v !== "" && !(k === "pagina" && Number(v) === 1)).map(([k, v]) => [k, String(v)]));
    return `/admin/soci${u.size ? `?${u}` : ""}`;
  };
  const pagine = Math.max(1, Math.ceil((count ?? 0) / PER_PAGINA));

  return (
    <>
      <div className="admin-head">
        <div>
          <p className="t-eyebrow">Club</p>
          <h1 className="t-display-l">Soci</h1>
        </div>
      </div>
      <Esito q={error ? { errore: error.message } : q} />

      <form className="admin-cerca" action="/admin/soci">
        <div className="psc-field">
          <label className="psc-field__label" htmlFor="q">Cerca</label>
          <input id="q" name="q" type="search" className="psc-field__input" defaultValue={cerca} placeholder="Tessera, nome, cognome o email" />
        </div>
        {filtro && <input type="hidden" name="filtro" value={filtro} />}
        <button type="submit" className="psc-btn psc-btn--primary">Cerca</button>
      </form>

      <nav className="admin-nav" aria-label="Filtra i soci">
        {FILTRI.map((f) => (
          <Link key={f.value} href={link({ filtro: f.value, pagina: 1 })} className={filtro === f.value ? "is-active" : undefined}>{f.label}</Link>
        ))}
      </nav>

      <p className="t-caption">{count ?? 0} soci{cerca ? ` per «${cerca}»` : ""}</p>

      {soci?.length ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>Tessera</th><th>Socio</th><th>Livello</th><th>App</th><th>Iscritto</th><th className="num">Punti</th></tr>
            </thead>
            <tbody>
              {soci.map((s) => (
                <tr key={s.id}>
                  <td><Link href={`/admin/soci/${s.id}`}>{s.numero_tessera}</Link></td>
                  <td>
                    {[s.nome, s.cognome].filter(Boolean).join(" ") || "—"}
                    <div className="t-caption">{s.email}</div>
                  </td>
                  <td>
                    {s.livello}
                    {s.stato !== "attivo" && <> <span className="psc-badge psc-badge--danger">{s.stato}</span></>}
                  </td>
                  <td>
                    {s.stato_cassa === "in_attivazione"
                      ? <span className="psc-badge psc-badge--warning">In attivazione</span>
                      : s.user_id ? <span className="psc-badge psc-badge--success">Collegata</span> : <span className="min">No</span>}
                  </td>
                  <td className="min">{dataBreve(s.iscritto_il)}</td>
                  <td className="num">{formatPunti(saldo.get(s.id) ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="admin-vuoto">Nessun socio trovato.</p>
      )}

      {pagine > 1 && (
        <div className="admin-pagine">
          {pagina > 1 && <Link href={link({ pagina: pagina - 1 })} className="psc-btn psc-btn--secondary admin-btn--small">Precedenti</Link>}
          <span className="t-caption">Pagina {pagina} di {pagine}</span>
          {pagina < pagine && <Link href={link({ pagina: pagina + 1 })} className="psc-btn psc-btn--secondary admin-btn--small">Successivi</Link>}
        </div>
      )}
    </>
  );
}
