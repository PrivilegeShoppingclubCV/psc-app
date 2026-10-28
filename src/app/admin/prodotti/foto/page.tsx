import type { Metadata } from "next";
import Link from "next/link";
import { richiediAdmin } from "@/lib/admin/sessione";
import { FotoInBlocco } from "./FotoInBlocco";

export const metadata: Metadata = { title: "Foto dei prodotti" };

export default async function FotoProdotti() {
  await richiediAdmin();
  return (
    <>
      <div className="admin-head">
        <div>
          <Link href="/admin/prodotti" className="admin-back">← Prodotti</Link>
          <h1 className="t-display-l">Foto dei prodotti</h1>
        </div>
      </div>
      <FotoInBlocco />
    </>
  );
}
