// Lingua e testi lato server: pagine, metadati e azioni dei moduli.
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { COOKIE_LINGUA, scegliLingua, type Lingua } from "./lingue";
import { TESTI, TESTI_CLUB } from "./testi";
import { formati } from "./formati";

export { direzione, LINGUE, type Lingua } from "./lingue";
export { forma, ricco } from "./forma";
export { testiClient } from "./testi";

/** La lingua di questa richiesta: scelta a mano, poi quella del browser, poi italiano. */
export const getLingua = cache(async (): Promise<Lingua> => {
  const [c, h] = await Promise.all([cookies(), headers()]);
  return scegliLingua(c.get(COOKIE_LINGUA)?.value, h.get("accept-language"));
});

export const getTesti = cache(async () => TESTI[await getLingua()]);
/** Testi delle pagine dei soci. */
export const getTestiClub = cache(async () => TESTI_CLUB[await getLingua()]);
/** Prezzi, numeri e date nel formato della lingua. */
export const getFormati = cache(async () => formati(await getLingua()));
