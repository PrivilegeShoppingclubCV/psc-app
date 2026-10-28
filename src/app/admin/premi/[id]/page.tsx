import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Area, Campo, Interruttore } from "@/components/admin/Campi";
import { Esito } from "@/components/admin/Esito";
import { ImmagineInput } from "@/components/admin/ImmagineInput";
import { urlBucket } from "@/lib/admin/form";
import { richiediAdmin } from "@/lib/admin/sessione";
import { salvaPremio } from "../azioni";

export const metadata: Metadata = { title: "Premio" };

export default async function SchedaPremio({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, q] = await Promise.all([params, searchParams]);
  const { supabase } = await richiediAdmin();
  const nuovo = id === "nuovo";
  const { data: p } = nuovo ? { data: null } : await supabase.from("premi").select("*").eq("id", id).maybeSingle();
  if (!nuovo && !p) notFound();

  return (
    <>
      <div className="admin-head">
        <div>
          <Link href="/admin/premi" className="admin-back">← Premi</Link>
          <h1 className="t-display-l">{p?.nome ?? "Nuovo premio"}</h1>
        </div>
      </div>
      <Esito q={q} />

      <form action={salvaPremio} className="admin-form">
        {p && <input type="hidden" name="id" value={p.id} />}
        <section className="admin-card">
          <div className="admin-grid">
            <Campo id="nome" label="Nome" required defaultValue={p?.nome ?? ""} placeholder="Buono da 10 €" />
            <Campo id="soglia_punti" label="Punti necessari" inputMode="numeric" required defaultValue={p ? String(p.soglia_punti) : ""} />
            <Campo id="valore_euro" label="Valore (€)" inputMode="decimal" defaultValue={p?.valore_euro !== null && p?.valore_euro !== undefined ? String(p.valore_euro).replace(".", ",") : ""} />
            <Campo id="ordine" label="Ordine" inputMode="numeric" defaultValue={String(p?.ordine ?? 0)} />
            <Area id="descrizione" label="Descrizione" defaultValue={p?.descrizione ?? ""} />
          </div>
          <ImmagineInput bucket="premi" valore={p?.immagine_path ?? null} urlBase={urlBucket("premi")} />
          <Interruttore id="attivo" label="Visibile nell'app" help="Un premio tolto si nasconde: i riscatti già fatti restano nello storico." defaultChecked={p?.attivo ?? true} />
          <div className="admin-azioni">
            <button type="submit" className="psc-btn psc-btn--primary">{p ? "Salva" : "Crea premio"}</button>
          </div>
        </section>
      </form>
    </>
  );
}
