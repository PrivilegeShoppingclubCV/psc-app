import type { Metadata } from "next";
import Link from "next/link";
import { Fragment } from "react";
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
  { value: "senza-app", label: "Senza app" },
  { value: "attesa", label: "In attesa della cassa" },
  { value: "sospesi", label: "Sospesi o cessati" },
  { value: "doppioni", label: "Possibili doppioni" },
];

export default async function Soci({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const cerca = param(q.q);
  const filtro = param(q.filtro);
  const pagina = Math.max(1, Number(param(q.pagina)) || 1);
  const { supabase } = await richiediAdmin();

  // Possibili doppioni: schede con stessa email, stesso cellulare o stesso nome.
  const doppioni = filtro === "doppioni";
  const { data: gruppi, error: erroreDoppioni } = doppioni
    ? await supabase.rpc("admin_possibili_doppioni")
    : { data: null, error: null };
  // Al massimo 200 righe alla volta (l'elenco delle schede va nell'indirizzo della richiesta).
  const tuttiDoppioni = (gruppi ?? []) as { gruppo: string; motivo: string; socio_id: string }[];
  const righeDoppioni = tuttiDoppioni.slice(0, 200);

  let query = supabase
    .from("soci_con_tessere")
    .select("id, fisica, digitale, nome, cognome, email, telefono, livello, stato, in_attivazione, origine, user_id, iscritto_il", { count: "exact" })
    .order("cognome", { nullsFirst: false })
    .order("nome");
  if (!doppioni) query = query.range((pagina - 1) * PER_PAGINA, pagina * PER_PAGINA - 1);
  // Ogni parola deve comparire in una tessera, nome, cognome, email o telefono. Via i caratteri che hanno un senso nei filtri.
  for (const parola of cerca.replace(/[,()*%\\]/g, " ").split(/\s+/).filter(Boolean)) {
    query = query.or(["codici", "nome", "cognome", "email", "telefono"].map((c) => `${c}.ilike.%${parola}%`).join(","));
  }
  if (filtro === "app") query = query.not("user_id", "is", null);
  if (filtro === "senza-app") query = query.is("user_id", null);
  if (filtro === "attesa") query = query.eq("in_attivazione", true);
  if (filtro === "sospesi") query = query.neq("stato", "attivo");
  if (doppioni) query = query.in("id", [...new Set(righeDoppioni.map((r) => r.socio_id))]);
  const { data: soci, count, error } = await query;
  const perId = new Map((soci ?? []).map((s) => [s.id, s]));
  // Nella vista dei doppioni le schede si mostrano a gruppi (una scheda può stare in più gruppi).
  const righe = doppioni
    ? righeDoppioni.flatMap((r, i) => {
        const s = perId.get(r.socio_id);
        const nuovo = i === 0 || righeDoppioni[i - 1].gruppo !== r.gruppo;
        return s ? [{ s, gruppo: nuovo ? `${r.motivo}: ${r.gruppo.slice(r.gruppo.indexOf(":") + 1)}` : null, chiave: `${r.gruppo}-${r.socio_id}` }] : [];
      })
    : (soci ?? []).map((s) => ({ s, gruppo: null as string | null, chiave: s.id }));

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
        <div className="admin-azioni">
          <Link href="/admin/soci/da-completare" className="psc-btn psc-btn--secondary">Clienti da completare</Link>
          <Link href="/admin/soci/nuovo" className="psc-btn psc-btn--primary">Nuovo socio con tessera fisica</Link>
        </div>
      </div>
      <Esito q={error || erroreDoppioni ? { errore: (error ?? erroreDoppioni)!.message } : q} />

      <form className="admin-cerca" action="/admin/soci">
        <div className="psc-field">
          <label className="psc-field__label" htmlFor="q">Cerca</label>
          <input id="q" name="q" type="search" className="psc-field__input" defaultValue={cerca} placeholder="Tessera, nome, cognome, email o telefono" />
        </div>
        {filtro && <input type="hidden" name="filtro" value={filtro} />}
        <button type="submit" className="psc-btn psc-btn--primary">Cerca</button>
      </form>

      <nav className="admin-nav" aria-label="Filtra i soci">
        {FILTRI.map((f) => (
          <Link key={f.value} href={link({ filtro: f.value, pagina: 1 })} className={filtro === f.value ? "is-active" : undefined}>{f.label}</Link>
        ))}
      </nav>

      <p className="t-caption">
        {count ?? 0} soci{cerca ? ` per «${cerca}»` : ""}
        {doppioni && tuttiDoppioni.length > righeDoppioni.length && ` (mostrati i primi gruppi: unisci questi e ricarica per vedere gli altri)`}
        {doppioni && " che si somigliano: apri la scheda da tenere e usa «Unisci un doppione» con la tessera dell'altra."}
      </p>

      {soci?.length ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>Tessere</th><th>Socio</th><th>Livello</th><th>App</th><th>Iscritto</th><th className="num">Punti</th></tr>
            </thead>
            <tbody>
              {righe.map(({ s, gruppo, chiave }) => (
                <Fragment key={chiave}>
                {gruppo && <tr className="admin-gruppo"><th colSpan={6}>{gruppo}</th></tr>}
                <tr>
                  <td>
                    <Link href={`/admin/soci/${s.id}`}>{s.fisica ?? s.digitale ?? "Nessuna"}</Link>
                    {s.fisica && s.digitale && <div className="t-caption">{s.digitale}</div>}
                  </td>
                  <td>
                    {[s.nome, s.cognome].filter(Boolean).join(" ") || "—"}
                    <div className="t-caption">{s.email ?? s.telefono}</div>
                  </td>
                  <td>
                    {s.livello}
                    {s.stato !== "attivo" && <> <span className="psc-badge psc-badge--danger">{s.stato}</span></>}
                  </td>
                  <td>
                    {s.in_attivazione
                      ? <span className="psc-badge psc-badge--warning">In attivazione</span>
                      : s.user_id ? <span className="psc-badge psc-badge--success">Collegata</span> : <span className="min">No</span>}
                  </td>
                  <td className="min">{dataBreve(s.iscritto_il)}</td>
                  <td className="num">{formatPunti(saldo.get(s.id) ?? 0)}</td>
                </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="admin-vuoto">Nessun socio trovato.</p>
      )}

      {!doppioni && pagine > 1 && (
        <div className="admin-pagine">
          {pagina > 1 && <Link href={link({ pagina: pagina - 1 })} className="psc-btn psc-btn--secondary admin-btn--small">Precedenti</Link>}
          <span className="t-caption">Pagina {pagina} di {pagine}</span>
          {pagina < pagine && <Link href={link({ pagina: pagina + 1 })} className="psc-btn psc-btn--secondary admin-btn--small">Successivi</Link>}
        </div>
      )}
    </>
  );
}
