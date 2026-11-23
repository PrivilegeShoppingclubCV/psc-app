// Lingua e testi lato server: pagine, metadati e azioni dei moduli.
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { COOKIE_LINGUA, scegliLingua, type Lingua } from "./lingue";
import { TESTI } from "./testi";

export { direzione, LINGUE, type Lingua } from "./lingue";
export { forma, ricco } from "./forma";

/** La lingua di questa richiesta: scelta a mano, poi quella del browser, poi italiano. */
export const getLingua = cache(async (): Promise<Lingua> => {
  const [c, h] = await Promise.all([cookies(), headers()]);
  return scegliLingua(c.get(COOKIE_LINGUA)?.value, h.get("accept-language"));
});

export const getTesti = cache(async () => TESTI[await getLingua()]);
