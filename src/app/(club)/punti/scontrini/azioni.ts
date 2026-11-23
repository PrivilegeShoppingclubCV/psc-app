"use server";

import { getScontrini, getSessione } from "@/lib/dati";

/** I 10 scontrini successivi all'ultimo mostrato, solo del socio che sta usando l'app. */
export async function altriScontrini(dopoData: string, dopoId: string) {
  const { socio } = await getSessione();
  if (!socio) return { scontrini: [], altri: false };
  return getScontrini(socio.id, { data: dopoData, id: dopoId });
}
