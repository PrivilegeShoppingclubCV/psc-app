import { Area, Campo, Interruttore, Scelta } from "@/components/admin/Campi";
import { Conferma } from "@/components/admin/Conferma";
import { ImmagineInput } from "@/components/admin/ImmagineInput";
import { giorno, urlBucket } from "@/lib/admin/form";
import { eliminaOfferta, salvaOfferta } from "./azioni";

export interface OffertaDb {
  id: string;
  titolo: string;
  marca: string | null;
  descrizione: string | null;
  prezzo_soci: number | null;
  prezzo_listino: number | null;
  etichetta: string | null;
  immagine_path: string | null;
  valida_dal: string;
  valida_al: string | null;
  solo_tesserati: boolean;
  livello_minimo: string | null;
  pubblicata: boolean;
  in_evidenza: boolean;
  ordine: number;
}

const prezzo = (n: number | null) => (n === null ? "" : n.toFixed(2).replace(".", ","));

export function ModuloOfferta({ offerta, negozi, negoziScelti, livelli }: {
  offerta?: OffertaDb;
  negozi: { id: string; nome: string; attivo: boolean }[];
  negoziScelti: string[];
  livelli: { codice: string; nome: string }[];
}) {
  const o = offerta;
  return (
    <>
      <form action={salvaOfferta} className="admin-form">
        {o && <input type="hidden" name="id" value={o.id} />}

        <section className="admin-card">
          <h2 className="t-title">Prodotto</h2>
          <div className="admin-grid">
            <Campo id="titolo" label="Titolo" required defaultValue={o?.titolo} placeholder="Maglione girocollo in lana merino" />
            <Campo id="marca" label="Marca" defaultValue={o?.marca ?? ""} />
            <Area id="descrizione" label="Descrizione" defaultValue={o?.descrizione ?? ""} help="Facoltativa, per i dettagli dell'offerta." />
          </div>
          <ImmagineInput bucket="offerte" valore={o?.immagine_path ?? null} urlBase={urlBucket("offerte")} />
        </section>

        <section className="admin-card">
          <h2 className="t-title">Prezzo</h2>
          <div className="admin-grid">
            <Campo id="prezzo_soci" label="Prezzo soci (€)" inputMode="decimal" defaultValue={prezzo(o?.prezzo_soci ?? null)} placeholder="59,90" />
            <Campo id="prezzo_listino" label="Prezzo di listino (€)" inputMode="decimal" defaultValue={prezzo(o?.prezzo_listino ?? null)} help="Si mostra barrato." />
            <Campo id="etichetta" label="Etichetta" defaultValue={o?.etichetta ?? ""} placeholder="-30%, 2x1, Omaggio" help="Per le offerte senza prezzo, oppure in aggiunta." />
          </div>
        </section>

        <section className="admin-card">
          <h2 className="t-title">Quando e per chi</h2>
          <div className="admin-grid">
            <Campo id="valida_dal" label="Valida dal" type="date" defaultValue={giorno(o?.valida_dal ?? null)} help="Vuoto = da subito." />
            <Campo id="valida_al" label="Valida fino al" type="date" defaultValue={giorno(o?.valida_al ?? null, true)} help="Compreso. Vuoto = senza scadenza." />
            <Scelta
              id="livello_minimo"
              label="Livello minimo"
              defaultValue={o?.livello_minimo ?? ""}
              opzioni={[{ value: "", label: "Tutti i livelli" }, ...livelli.map((l) => ({ value: l.codice, label: l.nome }))]}
            />
            <Campo id="ordine" label="Ordine" inputMode="numeric" defaultValue={String(o?.ordine ?? 0)} help="Più basso = prima nella lista." />
          </div>
          <Interruttore id="solo_tesserati" label="Solo per i soci con l'app" help="Se tolto, la vede anche chi non ha fatto l'accesso." defaultChecked={o?.solo_tesserati ?? true} />
          <Interruttore id="in_evidenza" label="In evidenza" help="Compare per prima." defaultChecked={o?.in_evidenza ?? false} />
          <fieldset>
            <legend>Negozi in cui vale</legend>
            <p className="t-caption">Nessuno spuntato = vale in tutti i negozi.</p>
            <div className="admin-checks">
              {negozi.map((n) => (
                <label key={n.id} className="spunta">
                  <input type="checkbox" name="negozi" value={n.id} defaultChecked={negoziScelti.includes(n.id)} />
                  <span>{n.nome}{n.attivo ? "" : " (non attivo)"}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </section>

        <section className="admin-card">
          <Interruttore id="pubblicata" label="Pubblicata" help="Se tolto, l'offerta resta in bozza e i soci non la vedono." defaultChecked={o?.pubblicata ?? false} />
          <div className="admin-azioni">
            <button type="submit" className="psc-btn psc-btn--primary">{o ? "Salva" : "Crea offerta"}</button>
          </div>
        </section>
      </form>

      {o && (
        <form action={eliminaOfferta} className="admin-azioni">
          <input type="hidden" name="id" value={o.id} />
          <Conferma messaggio={`Eliminare l'offerta "${o.titolo}"? Non si può annullare.`}>Elimina offerta</Conferma>
          <span className="t-caption">Per toglierla dall&apos;app senza perderla, basta togliere «Pubblicata».</span>
        </form>
      )}
    </>
  );
}
