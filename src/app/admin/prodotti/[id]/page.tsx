import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Interruttore } from "@/components/admin/Campi";
import { Esito } from "@/components/admin/Esito";
import { ImmagineInput } from "@/components/admin/ImmagineInput";
import { dataBreve, dataOra, urlBucket } from "@/lib/admin/form";
import { richiediAdmin } from "@/lib/admin/sessione";
import { formatEuro } from "@/lib/format";
import { salvaProdotto } from "../azioni";

export const metadata: Metadata = { title: "Prodotto" };

export default async function SchedaProdotto({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, q] = await Promise.all([params, searchParams]);
  const { supabase } = await richiediAdmin();
  const [{ data: p }, offerta, uscite] = await Promise.all([
    supabase.from("prodotti").select("*").eq("id", id).maybeSingle(),
    supabase.from("prodotti_in_offerta").select("punteggio").eq("id", id).maybeSingle(),
    supabase.from("vetrina").select("giorno").eq("prodotto_id", id).order("giorno", { ascending: false }).limit(5),
  ]);
  if (!p) notFound();

  const data = (d: string | null) => (d ? dataBreve(`${d}T12:00:00Z`) : null);
  const perche = [
    p.disponibilita <= 0 && "esaurito",
    !(p.prezzo_soci > 0) && "senza prezzo tesserati",
    !p.immagine_path && "senza foto",
    p.nascosto && "nascosto",
  ].filter(Boolean);

  return (
    <>
      <div className="admin-head">
        <div>
          <Link href="/admin/prodotti" className="admin-back">← Prodotti</Link>
          <h1 className="t-display-l">{p.descrizione}</h1>
          <p className="t-caption">{[p.marca, p.colore, p.taglia].filter(Boolean).join(" · ")}</p>
        </div>
      </div>
      <Esito q={q} />

      <div className="admin-cols">
        <section className="admin-card">
          <h2 className="t-title">Dal gestionale</h2>
          <dl className="admin-dl">
            <dt>EAN</dt><dd>{p.ean}</dd>
            <dt>SKU</dt><dd>{p.sku ?? "—"}</dd>
            <dt>Pezzi</dt><dd>{p.disponibilita}</dd>
            <dt>Listino</dt><dd>{p.prezzo_listino !== null ? formatEuro(p.prezzo_listino) : "—"}</dd>
            <dt>Tesserati</dt><dd>{p.prezzo_soci !== null ? formatEuro(p.prezzo_soci) : "—"}</dd>
            <dt>Valore fermo</dt><dd>{formatEuro(p.valore_fermo)}</dd>
            <dt>Scadenza</dt><dd>{[data(p.scadenza), data(p.scadenza_2), p.note_scadenza].filter(Boolean).join(" · ") || "—"}</dd>
            <dt>Categoria</dt><dd>{p.categoria ?? "—"}</dd>
            <dt>Aggiornato</dt><dd>{dataOra(p.importato_il)}</dd>
          </dl>
          <p className="t-caption">Questi dati cambiano solo reimportando il magazzino.</p>
        </section>

        <section className="admin-card">
          <h2 className="t-title">In offerta</h2>
          <p>
            {offerta.data
              ? <>Può andare in vetrina, con punteggio <strong>{Number(offerta.data.punteggio).toLocaleString("it-IT")}</strong>.</>
              : <>Non può andare in offerta: {perche.join(", ") || "scaduto"}.</>}
          </p>
          <p className="t-caption">
            Ultime uscite in vetrina: {uscite.data?.length ? uscite.data.map((u) => data(u.giorno)).join(", ") : "mai"}.
          </p>
        </section>
      </div>

      <form action={salvaProdotto} className="admin-form">
        <input type="hidden" name="id" value={p.id} />
        <section className="admin-card">
          <h2 className="t-title">Foto e visibilità</h2>
          <ImmagineInput bucket="prodotti" valore={p.immagine_path} urlBase={urlBucket("prodotti")} cartella={p.ean} />
          <Interruttore id="nascosto" label="Non mostrarlo nelle offerte" help="Resta nel catalogo e la foto si conserva." defaultChecked={p.nascosto} />
          <div className="admin-azioni"><button type="submit" className="psc-btn psc-btn--primary">Salva</button></div>
        </section>
      </form>
    </>
  );
}
