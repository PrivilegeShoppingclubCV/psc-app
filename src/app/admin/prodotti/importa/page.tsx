import type { Metadata } from "next";
import Link from "next/link";
import { richiediAdmin } from "@/lib/admin/sessione";
import { Importa } from "./Importa";

export const metadata: Metadata = { title: "Importa prodotti" };

export default async function ImportaProdotti() {
  await richiediAdmin();
  return (
    <>
      <div className="admin-head">
        <div>
          <Link href="/admin/prodotti" className="admin-back">← Prodotti</Link>
          <h1 className="t-display-l">Importa da Excel</h1>
        </div>
      </div>
      <Importa />
    </>
  );
}
