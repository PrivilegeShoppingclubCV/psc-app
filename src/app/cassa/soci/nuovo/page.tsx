import type { Metadata } from "next";
import { param } from "@/components/AuthPage";
import { Campo, Interruttore, Scelta } from "@/components/admin/Campi";
import { Esito } from "@/components/admin/Esito";
import { CampoData } from "@/components/CampoData";
import { nuovoSocioCassa } from "../../azioni";
import { richiediStaff } from "../../sessione";
import { TestaCassa } from "../../Testa";
import "../../../admin/admin.css";

export const metadata: Metadata = { title: "Cassa: nuovo socio", robots: { index: false, follow: false } };

/** Cliente che si iscrive in negozio con la tessera di plastica, anche senza app né email. */
export default async function NuovoSocioCassa({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const accesso = await richiediStaff();
  const { data: negozi } = await accesso.supabase.from("negozi").select("id, nome").eq("attivo", true).order("ordine").order("nome");

  return (
    <main className="cassa cassa--larga">
      <TestaCassa nome={accesso.nome ?? accesso.email} admin={accesso.admin} attiva="nuovo" />
      <div className="page-head">
        <p className="t-eyebrow">Negozio</p>
        <h1 className="t-display-l">Nuovo socio con tessera fisica</h1>
        <p className="t-body-l">Non serve l&apos;app: i punti si accumulano sulla tessera e il socio può collegare l&apos;app quando vuole.</p>
      </div>
      <Esito q={q} />

      <form action={nuovoSocioCassa} className="admin-card admin-form">
        <div className="admin-grid">
          <Campo id="codice" label="Codice della tessera" autoComplete="off" required autoFocus inputMode="numeric" defaultValue={param(q.codice)}
            help="Scansiona il codice a barre o scrivilo con gli zeri iniziali." />
          <Campo id="nome" label="Nome" required defaultValue={param(q.nome)} />
          <Campo id="cognome" label="Cognome" required defaultValue={param(q.cognome)} />
          <Campo id="telefono" label="Telefono" type="tel" defaultValue={param(q.telefono)} />
          <Campo id="email" label="Email" type="email" defaultValue={param(q.email)} help="Facoltativa. Se c'è, il socio collega l'app da solo." />
          <CampoData id="data_nascita" label="Data di nascita" defaultValue={param(q.data_nascita)} />
          <Scelta id="negozio_id" label="Negozio" defaultValue={param(q.negozio_id) || accesso.negozioId || ""}
            opzioni={[{ value: "", label: "—" }, ...(negozi ?? []).map((n) => ({ value: n.id, label: n.nome }))]} />
        </div>
        <Interruttore id="privacy" label="Il cliente ha firmato il modulo privacy" required
          help="Obbligatorio: conserva il modulo cartaceo in negozio." />
        <Interruttore id="marketing" label="Ha dato il consenso alle offerte (marketing)" help="Solo se l'ha barrato sul modulo." />
        <div className="admin-azioni">
          <button type="submit" className="psc-btn psc-btn--primary">Crea il socio</button>
        </div>
      </form>
    </main>
  );
}
