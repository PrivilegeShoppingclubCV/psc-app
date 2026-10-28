import { param } from "@/components/AuthPage";

type Q = Record<string, string | string[] | undefined>;

/** Esito dell'ultima operazione, passato dalle azioni con ?ok= o ?errore=. */
export function Esito({ q }: { q: Q }) {
  const errore = param(q.errore);
  const ok = param(q.ok);
  if (errore) return <p className="notice notice--errore" role="alert">{errore}</p>;
  if (ok) return <p className="notice notice--ok" role="status">{ok}</p>;
  return null;
}
