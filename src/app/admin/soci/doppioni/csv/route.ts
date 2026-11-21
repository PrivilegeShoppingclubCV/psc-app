import { richiediAdmin } from "@/lib/admin/sessione";

// CSV per Excel italiano: punto e virgola, BOM per gli accenti.
const cella = (v: string | number | null | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const data = (v: string | null) => (v ? v.slice(0, 10).split("-").reverse().join("/") : "");
const ORIGINI: Record<string, string> = { import: "Gestionale", app: "App", negozio: "Negozio" };
// Le schede si leggono a blocchi: l'elenco degli id va nell'indirizzo della richiesta.
const BLOCCO = 150;

type Doppione = { gruppo: string; motivo: string; socio_id: string };
type Scheda = {
  id: string; fisica: string | null; digitale: string | null; nome: string | null; cognome: string | null;
  email: string | null; telefono: string | null; origine: string; user_id: string | null; iscritto_il: string | null;
};

/** Tutti i possibili doppioni (non solo i primi 200 della pagina), una riga per scheda, a gruppi. */
export async function GET() {
  const { supabase } = await richiediAdmin();
  const { data: gruppi, error } = await supabase.rpc("admin_possibili_doppioni");
  if (error) return new Response(error.message, { status: 500 });
  const doppioni = (gruppi ?? []) as Doppione[];
  const ids = [...new Set(doppioni.map((d) => d.socio_id))];

  const schede = new Map<string, Scheda>();
  const idReadyPro = new Map<string, string>();
  const saldi = new Map<string, number>();
  for (let i = 0; i < ids.length; i += BLOCCO) {
    const parte = ids.slice(i, i + BLOCCO);
    const [s, g, p] = await Promise.all([
      supabase.from("soci_con_tessere").select("id, fisica, digitale, nome, cognome, email, telefono, origine, user_id, iscritto_il").in("id", parte),
      // L'ID del cliente in ReadyPro arriva con l'import, tra le colonne non mappate.
      supabase.from("soci").select("id, id_readypro:dati_gestionale->>ID").in("id", parte),
      supabase.from("saldi_punti").select("socio_id, saldo").in("socio_id", parte),
    ]);
    const errore = s.error ?? g.error ?? p.error;
    if (errore) return new Response(errore.message, { status: 500 });
    for (const r of (s.data ?? []) as Scheda[]) schede.set(r.id, r);
    for (const r of (g.data ?? []) as { id: string; id_readypro: string | null }[]) if (r.id_readypro) idReadyPro.set(r.id, r.id_readypro);
    for (const r of p.data ?? []) saldi.set(r.socio_id, r.saldo);
  }

  // Gruppi numerati nell'ordine in cui arrivano (stesso ordine della pagina).
  const numero = new Map<string, number>();
  const righe = [
    ["Gruppo", "Motivo", "In comune", "ID ReadyPro", "Tessera fisica", "Tessera digitale", "Cognome", "Nome", "Email",
      "Cellulare", "Origine", "App", "Iscritto il", "Punti"],
    ...doppioni.flatMap((d) => {
      const s = schede.get(d.socio_id);
      if (!s) return [];
      if (!numero.has(d.gruppo)) numero.set(d.gruppo, numero.size + 1);
      return [[numero.get(d.gruppo)!, d.motivo, d.gruppo.slice(d.gruppo.indexOf(":") + 1), idReadyPro.get(s.id), s.fisica,
        s.digitale, s.cognome, s.nome, s.email, s.telefono, ORIGINI[s.origine] ?? s.origine, s.user_id ? "Sì" : "No",
        data(s.iscritto_il), saldi.get(s.id) ?? 0]];
    }),
  ];
  const oggi = new Date().toISOString().slice(0, 10);
  return new Response("﻿" + righe.map((r) => r.map(cella).join(";")).join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="possibili-doppioni-${oggi}.csv"`,
    },
  });
}
