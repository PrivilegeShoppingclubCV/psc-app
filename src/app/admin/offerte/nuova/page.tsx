import type { Metadata } from "next";
import Link from "next/link";
import { Esito } from "@/components/admin/Esito";
import { richiediAdmin } from "@/lib/admin/sessione";
import { ModuloOfferta } from "../ModuloOfferta";

export const metadata: Metadata = { title: "Nuova offerta" };

export default async function NuovaOfferta({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const { supabase } = await richiediAdmin();
  const [negozi, livelli] = await Promise.all([
    supabase.from("negozi").select("id, nome, attivo").order("ordine").order("nome"),
    supabase.from("livelli").select("codice, nome").order("ordine"),
  ]);

  return (
    <>
      <div className="admin-head">
        <div>
          <Link href="/admin/offerte" className="admin-back">← Offerte</Link>
          <h1 className="t-display-l">Nuova offerta</h1>
        </div>
      </div>
      <Esito q={q} />
      <ModuloOfferta negozi={negozi.data ?? []} negoziScelti={[]} livelli={livelli.data ?? []} />
    </>
  );
}
