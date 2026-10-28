import type { Metadata } from "next";
import Link from "next/link";
import { param } from "@/components/AuthPage";
import { Esito } from "@/components/admin/Esito";
import { formatEuro } from "@/lib/format";
import { dataBreve, urlBucket } from "@/lib/admin/form";
import { richiediAdmin } from "@/lib/admin/sessione";
import { pubblicaOfferta } from "./azioni";

export const metadata: Metadata = { title: "Offerte" };

const FILTRI = [
  { value: "", label: "Tutte" },
  { value: "in_corso", label: "In corso" },
  { value: "bozze", label: "Bozze" },
  { value: "scadute", label: "Scadute" },
];

export default async function Offerte({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const filtro = param(q.filtro);
  const { supabase } = await richiediAdmin();
  const adesso = new Date().toISOString();

  let query = supabase
    .from("offerte")
    .select("id, titolo, marca, prezzo_soci, etichetta, immagine_path, valida_dal, valida_al, pubblicata, in_evidenza, solo_tesserati")
    .order("pubblicata", { ascending: false })
    .order("in_evidenza", { ascending: false })
    .order("ordine")
    .order("creato_il", { ascending: false });
  if (filtro === "in_corso") query = query.eq("pubblicata", true).lte("valida_dal", adesso).or(`valida_al.is.null,valida_al.gt.${adesso}`);
  if (filtro === "bozze") query = query.eq("pubblicata", false);
  if (filtro === "scadute") query = query.lte("valida_al", adesso);
  const { data: offerte, error } = await query;
  const torna = `/admin/offerte${filtro ? `?filtro=${filtro}` : ""}`;

  const stato = (o: NonNullable<typeof offerte>[number]) => {
    if (!o.pubblicata) return <span className="psc-badge psc-badge--info">Bozza</span>;
    if (o.valida_al && o.valida_al <= adesso) return <span className="psc-badge psc-badge--danger">Scaduta</span>;
    if (o.valida_dal > adesso) return <span className="psc-badge psc-badge--warning">Programmata</span>;
    return <span className="psc-badge psc-badge--success">In corso</span>;
  };

  return (
    <>
      <div className="admin-head">
        <div>
          <p className="t-eyebrow">Catalogo</p>
          <h1 className="t-display-l">Offerte</h1>
        </div>
        <Link href="/admin/offerte/nuova" className="psc-btn psc-btn--primary">Nuova offerta</Link>
      </div>
      <Esito q={error ? { errore: error.message } : q} />

      <nav className="admin-nav" aria-label="Filtra le offerte">
        {FILTRI.map((f) => (
          <Link key={f.value} href={f.value ? `/admin/offerte?filtro=${f.value}` : "/admin/offerte"} className={filtro === f.value ? "is-active" : undefined}>
            {f.label}
          </Link>
        ))}
      </nav>

      {offerte?.length ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th></th><th>Offerta</th><th className="num">Prezzo</th><th>Periodo</th><th>Stato</th><th></th></tr>
            </thead>
            <tbody>
              {offerte.map((o) => (
                <tr key={o.id}>
                  <td>{o.immagine_path ? <img className="thumb" src={`${urlBucket("offerte")}/${o.immagine_path}`} alt="" /> : <span className="thumb" style={{ display: "block" }} />}</td>
                  <td>
                    <Link href={`/admin/offerte/${o.id}`}>{o.titolo}</Link>
                    <div className="t-caption">
                      {[o.marca, o.in_evidenza && "In evidenza", !o.solo_tesserati && "Visibile a tutti"].filter(Boolean).join(" · ")}
                    </div>
                  </td>
                  <td className="num">{o.prezzo_soci !== null ? formatEuro(o.prezzo_soci) : o.etichetta}</td>
                  <td className="min">{dataBreve(o.valida_dal)} – {o.valida_al ? dataBreve(new Date(new Date(o.valida_al).getTime() - 1).toISOString()) : "senza scadenza"}</td>
                  <td>{stato(o)}</td>
                  <td>
                    <form action={pubblicaOfferta}>
                      <input type="hidden" name="id" value={o.id} />
                      <input type="hidden" name="pubblicata" value={String(!o.pubblicata)} />
                      <input type="hidden" name="torna" value={torna} />
                      <button type="submit" className="psc-btn psc-btn--secondary admin-btn--small">{o.pubblicata ? "Togli" : "Pubblica"}</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="admin-vuoto">Nessuna offerta{filtro ? " con questo filtro" : ""}. <Link href="/admin/offerte/nuova">Creane una</Link>.</p>
      )}
    </>
  );
}
