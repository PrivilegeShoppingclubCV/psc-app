import type { Offerta } from "@/lib/tipi";
import { forma, getFormati, getTestiClub } from "@/lib/i18n";
import { SchedaOfferta } from "./SchedaOfferta";

/** Card di un'offerta (dello staff o un prodotto del magazzino) che apre la scheda del prodotto. */
export async function OffertaCard({ o }: { o: Offerta }) {
  const f = await getFormati();
  const t = (await getTestiClub()).offerte;
  const conSconto = o.prezzoSoci !== null && o.prezzoListino !== null && o.prezzoListino > o.prezzoSoci;
  const sconto = conSconto ? Math.round((1 - o.prezzoSoci! / o.prezzoListino!) * 100) : 0;
  return (
    <SchedaOfferta
      o={o}
      v={{
        soci: o.prezzoSoci !== null ? f.euro(o.prezzoSoci) : null,
        listino: o.prezzoListino !== null ? f.euro(o.prezzoListino) : null,
        sconto,
        fino: o.scadenza ? forma(t.finoAl, { data: f.data(o.scadenza) }) : null,
      }}
      t={{
        soloTesserati: t.soloTesserati,
        apri: forma(t.apriScheda, { nome: o.nome }),
        chiudi: t.chiudiScheda,
        prezzoTesserati: t.prezzoTesserati,
        prezzoCartellino: t.prezzoCartellino,
        sconto: t.sconto,
        risparmi: conSconto && sconto > 0 ? forma(t.risparmi, { euro: f.euro(o.prezzoListino! - o.prezzoSoci!) }) : null,
        extraTitolo: t.extraTitolo,
        puntiExtra: o.puntiExtra ? forma(t.puntiExtra, { punti: f.punti(o.puntiExtra) }) : null,
        inCassa: t.inCassa,
      }}
    />
  );
}
