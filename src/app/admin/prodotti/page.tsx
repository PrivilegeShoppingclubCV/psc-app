import type { Metadata } from "next";
import Link from "next/link";
import { param } from "@/components/AuthPage";
import { Esito } from "@/components/admin/Esito";
import { dataBreve, urlBucket } from "@/lib/admin/form";
import { richiediAdmin } from "@/lib/admin/sessione";
import { formatEuro } from "@/lib/format";
import { cercaFotoSito, rigeneraVetrina } from "./azioni";
import { FOTO_SITO_BASE, urlImmagine } from "@/lib/foto-sito";

export const metadata: Metadata = { title: "Prodotti" };
// "Prendi foto dal sito" controlla una foto per ogni prodotto senza foto: può volerci un po'.
export const maxDuration = 300;

const PER_PAGINA = 50;
const FILTRI = [
  { value: "", label: "Disponibili" },
  { value: "offerta", label: "Possono andare in offerta" },
  { value: "senza_foto", label: "Senza foto" },
  { value: "nascosti", label: "Nascosti" },
  { value: "esauriti", label: "Esauriti" },
];

export default async function Prodotti({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const cerca = param(q.q);
  const filtro = param(q.filtro);
  const pagina = Math.max(1, Number(param(q.pagina)) || 1);
  const { supabase } = await richiediAdmin();

  let query = supabase
    .from(filtro === "offerta" ? "prodotti_in_offerta" : "prodotti")
    .select("id, ean, marca, descrizione, colore, taglia, disponibilita, prezzo_soci, valore_fermo, immagine_path, categoria", { count: "exact" })
    .order(filtro === "offerta" ? "punteggio" : "valore_fermo", { ascending: false })
    .order("ean")
    .range((pagina - 1) * PER_PAGINA, pagina * PER_PAGINA - 1);
  for (const parola of cerca.replace(/[,()*%\\]/g, " ").split(/\s+/).filter(Boolean)) {
    query = query.or(["ean", "marca", "descrizione", "categoria"].map((c) => `${c}.ilike.%${parola}%`).join(","));
  }
  if (filtro === "" ) query = query.gt("disponibilita", 0);
  if (filtro === "senza_foto") query = query.gt("disponibilita", 0).is("immagine_path", null);
  if (filtro === "nascosti") query = query.eq("nascosto", true);
  if (filtro === "esauriti") query = query.lte("disponibilita", 0);

  const [{ data: prodotti, count, error }, vetrina, staff, ultimo] = await Promise.all([
    query,
    supabase.rpc("vetrina_del_giorno"),
    supabase.from("offerte").select("id", { count: "exact", head: true })
      .eq("pubblicata", true).lte("valida_dal", new Date().toISOString()).or(`valida_al.is.null,valida_al.gt.${new Date().toISOString()}`),
    supabase.from("prodotti").select("importato_il").order("importato_il", { ascending: false, nullsFirst: false }).limit(1).maybeSingle(),
  ]);

  const link = (p: Record<string, string | number>) => {
    const u = new URLSearchParams(Object.entries({ q: cerca, filtro, ...p }).filter(([k, v]) => v !== "" && !(k === "pagina" && Number(v) === 1)).map(([k, v]) => [k, String(v)]));
    return `/admin/prodotti${u.size ? `?${u}` : ""}`;
  };
  const pagine = Math.max(1, Math.ceil((count ?? 0) / PER_PAGINA));
  const foto = urlBucket("prodotti");

  return (
    <>
      <div className="admin-head">
        <div>
          <p className="t-eyebrow">Magazzino</p>
          <h1 className="t-display-l">Prodotti</h1>
          <p className="t-caption">Ultimo import: {ultimo.data?.importato_il ? dataBreve(ultimo.data.importato_il) : "mai"}</p>
        </div>
        <div className="admin-azioni">
          <form action={cercaFotoSito}>
            <button className="psc-btn psc-btn--secondary" title={`Cerca le foto in ${FOTO_SITO_BASE}/verticali/`}>
              Prendi foto dal sito
            </button>
          </form>
          <Link href="/admin/prodotti/foto" className="psc-btn psc-btn--secondary">Carica foto</Link>
          <Link href="/admin/prodotti/importa" className="psc-btn psc-btn--primary">Importa da Excel</Link>
        </div>
      </div>
      <Esito q={error ? { errore: error.message } : q} />

      <section className="admin-card">
        <h2 className="t-title">Vetrina di oggi</h2>
        <p className="t-caption">
          Nella pagina Offerte dell&apos;app escono prima le {staff.count ?? 0} offerte dello staff in corso, poi questi prodotti:
          valore fermo più alto, spinto dalla scadenza vicina, solo con foto, senza ripetere quelli usciti nei 3 giorni prima.
          La scelta si fa al primo socio che apre le offerte nella giornata.
        </p>
        {vetrina.data?.length ? (
          <ol className="admin-vetrina">
            {(vetrina.data as { id: string; ean: string; descrizione: string; marca: string | null; prezzo_soci: number; immagine_path: string }[]).map((p) => (
              <li key={p.id}>
                <Link href={`/admin/prodotti/${p.id}`}>
                  <img src={urlImmagine(foto, p.immagine_path)} alt="" />
                  <span>{p.descrizione}</span>
                  <span className="t-caption">{formatEuro(p.prezzo_soci)}</span>
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <p className="admin-vuoto">
            {vetrina.error ? vetrina.error.message : "Nessun prodotto in vetrina oggi: servono prodotti disponibili, con prezzo e con foto (o le offerte dello staff bastano già a riempirla)."}
          </p>
        )}
        <form action={rigeneraVetrina}>
          <button type="submit" className="psc-btn psc-btn--secondary admin-btn--small">Rifai la scelta di oggi</button>
        </form>
      </section>

      <form className="admin-cerca" action="/admin/prodotti">
        <div className="psc-field">
          <label className="psc-field__label" htmlFor="q">Cerca</label>
          <input id="q" name="q" type="search" className="psc-field__input" defaultValue={cerca} placeholder="EAN, marca, descrizione o categoria" />
        </div>
        {filtro && <input type="hidden" name="filtro" value={filtro} />}
        <button type="submit" className="psc-btn psc-btn--primary">Cerca</button>
      </form>

      <nav className="admin-nav" aria-label="Filtra i prodotti">
        {FILTRI.map((f) => (
          <Link key={f.value} href={link({ filtro: f.value, pagina: 1 })} className={filtro === f.value ? "is-active" : undefined}>{f.label}</Link>
        ))}
      </nav>
      <p className="t-caption">
        {count ?? 0} prodotti, dal valore fermo più alto{filtro === "senza_foto" ? ": sono le foto più utili da fare per prime" : ""}.
      </p>

      {prodotti?.length ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th></th><th>Prodotto</th><th>EAN</th><th className="num">Pezzi</th><th className="num">Tesserati</th><th className="num">Valore fermo</th></tr>
            </thead>
            <tbody>
              {prodotti.map((p) => (
                <tr key={p.id}>
                  <td>{p.immagine_path ? <img className="thumb" src={urlImmagine(foto, p.immagine_path)} alt="" /> : <span className="thumb" style={{ display: "block" }} />}</td>
                  <td>
                    <Link href={`/admin/prodotti/${p.id}`}>{p.descrizione}</Link>
                    <div className="t-caption">{[p.marca, p.colore, p.taglia].filter(Boolean).join(" · ")}</div>
                  </td>
                  <td className="min">{p.ean}</td>
                  <td className="num">{p.disponibilita}</td>
                  <td className="num">{p.prezzo_soci !== null ? formatEuro(p.prezzo_soci) : "—"}</td>
                  <td className="num">{formatEuro(p.valore_fermo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="admin-vuoto">Nessun prodotto. <Link href="/admin/prodotti/importa">Importa il magazzino</Link>.</p>
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
