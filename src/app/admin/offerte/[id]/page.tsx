import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Esito } from "@/components/admin/Esito";
import { richiediAdmin } from "@/lib/admin/sessione";
import { ModuloOfferta, type OffertaDb } from "../ModuloOfferta";

export const metadata: Metadata = { title: "Offerta" };

export default async function ModificaOfferta({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, q] = await Promise.all([params, searchParams]);
  const { supabase } = await richiediAdmin();
  const [offerta, scelti, negozi, livelli] = await Promise.all([
    supabase.from("offerte").select("*").eq("id", id).maybeSingle(),
    supabase.from("offerte_negozi").select("negozio_id").eq("offerta_id", id),
    supabase.from("negozi").select("id, nome, attivo").order("ordine").order("nome"),
    supabase.from("livelli").select("codice, nome").order("ordine"),
  ]);
  if (!offerta.data) notFound();

  return (
    <>
      <div className="admin-head">
        <div>
          <Link href="/admin/offerte" className="admin-back">← Offerte</Link>
          <h1 className="t-display-l">{offerta.data.titolo}</h1>
        </div>
      </div>
      <Esito q={q} />
      <ModuloOfferta
        offerta={offerta.data as OffertaDb}
        negozi={negozi.data ?? []}
        negoziScelti={(scelti.data ?? []).map((r) => r.negozio_id)}
        livelli={livelli.data ?? []}
      />
    </>
  );
}
