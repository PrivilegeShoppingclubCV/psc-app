import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CartaScontrino } from "@/components/CartaScontrino";
import { richiediAdmin } from "@/lib/admin/sessione";
import { COLONNE_SCONTRINO, conRighe } from "@/lib/dati";
import { formati } from "@/lib/i18n/formati";
import { TESTI_CLUB } from "@/lib/i18n/testi";
import type { Scontrino } from "@/lib/tipi";

type Socio = { id: string; nome: string | null; cognome: string | null };

export const metadata: Metadata = { title: "Anteprima scontrino" };

// Scontrino finto per vedere l'impaginazione senza aspettare un acquisto vero.
const ESEMPIO: Scontrino = {
  id: "esempio",
  numero: "48213",
  data: new Date().toISOString(),
  totale: 43.9,
  negozio: "Negozio di esempio",
  punti: 8,
  righe: [
    { descrizione: "Crema viso idratante 50 ml", quantita: 1, importo: 18.9 },
    { descrizione: "Shampoo nutriente 250 ml", quantita: 2, importo: 15.0 },
    { descrizione: "Lima per unghie", quantita: 1, importo: 10.0 },
  ],
};

/**
 * Lo scontrino com'è nell'app del socio (in italiano), con lo stesso componente
 * della pagina "I tuoi scontrini". Aperto già, come quando il socio lo tocca.
 */
export default async function AnteprimaScontrino({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await richiediAdmin();
  let s: Scontrino | undefined;
  let socio = null as Socio | null;
  if (id === "esempio") {
    s = ESEMPIO;
  } else {
    if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
    const { data } = await supabase.from("scontrini").select(`${COLONNE_SCONTRINO}, soci(id, nome, cognome)`).eq("id", id).maybeSingle();
    if (!data) notFound();
    [s] = await conRighe(supabase, [data]);
    socio = data.soci as unknown as Socio | null;
  }
  const t = TESTI_CLUB.it.scontrini;

  return (
    <>
      <div className="admin-head">
        <div>
          <Link href="/admin/scontrini" className="admin-back">← Scontrini</Link>
          <h1 className="t-display-l">{id === "esempio" ? "Scontrino di esempio" : `Scontrino ${s.numero}`}</h1>
          <p className="t-caption">
            {id === "esempio"
              ? "Dati finti: serve solo a vedere come appare uno scontrino con i prodotti."
              : <>Così lo vede {socio ? <Link href={`/admin/soci/${socio.id}`}>{[socio.nome, socio.cognome].filter(Boolean).join(" ") || "il socio"}</Link> : "il socio"} in app, in Punti → I tuoi scontrini.</>}
          </p>
        </div>
      </div>
      {id !== "esempio" && s.righe.length === 0 && (
        <p className="notice">
          Per questo scontrino non sono ancora arrivati i prodotti: il socio vede solo totale e punti. I prodotti arrivano con il file righe.csv dello script sul server.
        </p>
      )}
      <div className="anteprima-scontrino">
        <CartaScontrino s={s} f={formati("it")} t={t} />
      </div>
    </>
  );
}
