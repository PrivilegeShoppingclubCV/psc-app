import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Campo, Interruttore } from "@/components/admin/Campi";
import { Esito } from "@/components/admin/Esito";
import { ImmagineInput } from "@/components/admin/ImmagineInput";
import { urlBucket } from "@/lib/admin/form";
import { richiediAdmin } from "@/lib/admin/sessione";
import { salvaNegozio } from "../azioni";

export const metadata: Metadata = { title: "Negozio" };

const coord = (n: number | null) => (n === null ? "" : String(n).replace(".", ","));

export default async function SchedaNegozio({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, q] = await Promise.all([params, searchParams]);
  const { supabase } = await richiediAdmin();
  const nuovo = id === "nuovo";
  const { data: n } = nuovo ? { data: null } : await supabase.from("negozi").select("*").eq("id", id).maybeSingle();
  if (!nuovo && !n) notFound();

  return (
    <>
      <div className="admin-head">
        <div>
          <Link href="/admin/negozi" className="admin-back">← Negozi</Link>
          <h1 className="t-display-l">{n?.nome ?? "Nuovo negozio"}</h1>
        </div>
      </div>
      <Esito q={q} />

      <form action={salvaNegozio} className="admin-form">
        {n && <input type="hidden" name="id" value={n.id} />}
        <section className="admin-card">
          <h2 className="t-title">Dati del negozio</h2>
          <div className="admin-grid">
            <Campo id="nome" label="Nome" required defaultValue={n?.nome ?? ""} />
            <Campo id="codice_gestionale" label="Codice nel gestionale" defaultValue={n?.codice_gestionale ?? ""} help="Lo stesso di ReadyPro: abbina scontrini e import." />
            <Campo id="indirizzo" label="Indirizzo" defaultValue={n?.indirizzo ?? ""} />
            <Campo id="cap" label="CAP" defaultValue={n?.cap ?? ""} />
            <Campo id="citta" label="Città" defaultValue={n?.citta ?? ""} />
            <Campo id="provincia" label="Provincia" maxLength={2} defaultValue={n?.provincia ?? ""} />
            <Campo id="telefono" label="Telefono" type="tel" defaultValue={n?.telefono ?? ""} />
            <Campo id="email" label="Email" type="email" defaultValue={n?.email ?? ""} />
            <Campo id="orari_testo" label="Orari" defaultValue={n?.orari_testo ?? ""} placeholder="Lun–Sab 9:30–19:30" help="Così come si mostrano nell'app." />
            <Campo id="latitudine" label="Latitudine" inputMode="decimal" defaultValue={coord(n?.latitudine ?? null)} help="Facoltativa, per la mappa." />
            <Campo id="longitudine" label="Longitudine" inputMode="decimal" defaultValue={coord(n?.longitudine ?? null)} />
            <Campo id="ordine" label="Ordine" inputMode="numeric" defaultValue={String(n?.ordine ?? 0)} help="Più basso = prima nella lista." />
          </div>
          <ImmagineInput bucket="negozi" valore={n?.immagine_path ?? null} urlBase={urlBucket("negozi")} />
          <Interruttore id="attivo" label="Visibile nell'app" help="Un negozio chiuso si nasconde invece di cancellarlo, così restano i punti e lo storico." defaultChecked={n?.attivo ?? true} />
          <div className="admin-azioni">
            <button type="submit" className="psc-btn psc-btn--primary">{n ? "Salva" : "Crea negozio"}</button>
          </div>
        </section>
      </form>
    </>
  );
}
