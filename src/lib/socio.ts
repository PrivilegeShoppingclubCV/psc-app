import { redirect } from "next/navigation";
import { getSessione } from "./dati";

/**
 * Il socio delle pagine del club. Chi non ha fatto l'accesso va ad /accedi,
 * chi non ha una tessera collegata a /collega-tessera.
 * Lo chiamano sia il layout sia le pagine: Next li esegue in parallelo.
 */
export async function getSocio() {
  const { configurato, email, socio } = await getSessione();
  if (configurato && !email) redirect("/accedi");
  if (!socio) redirect("/collega-tessera");
  return socio;
}
