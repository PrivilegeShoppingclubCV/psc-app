import type { NextRequest } from "next/server";
import { clientiDaCompletare, dataInizio } from "@/lib/admin/clienti-da-completare";
import { richiediAdmin } from "@/lib/admin/sessione";

// CSV per Excel italiano: punto e virgola, BOM per gli accenti.
const cella = (v: string | null) => `"${(v ?? "").replace(/"/g, '""')}"`;

export async function GET(request: NextRequest) {
  const { supabase } = await richiediAdmin();
  const dal = dataInizio(request.nextUrl.searchParams.get("dal") ?? "");
  const { clienti, error } = await clientiDaCompletare(supabase, dal);
  if (error) return new Response(error.message, { status: 500 });
  const righe = [
    ["ID ReadyPro", "Cognome", "Nome", "Email", "Cellulare", "Tessera", "Iscritto il", "Manca", "Cellulare in app"],
    ...clienti.map((c) => [c.id_readypro, c.cognome, c.nome, c.email, c.cellulare, c.tessera,
      c.iscritto_il.split("-").reverse().join("/"), c.manca, c.telefono_app]),
  ];
  return new Response("﻿" + righe.map((r) => r.map(cella).join(";")).join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="clienti-da-completare-dal-${dal}.csv"`,
    },
  });
}
