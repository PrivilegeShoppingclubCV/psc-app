"use client";

// Testi per i componenti che girano nel browser (campi dei moduli, tessera,
// banner "Installa", barra in basso...). Le pagine li passano con <TestiProvider>;
// dove non c'è (pannello admin) restano in italiano.
import { createContext, useContext } from "react";
import { it } from "./testi/it";
import { club } from "./testi/club/it";
import type { TestiClient } from "./testi";

const Contesto = createContext<TestiClient>({ ...it.client, ...club.client });

export function TestiProvider({ testi, children }: { testi: TestiClient; children: React.ReactNode }) {
  return <Contesto.Provider value={testi}>{children}</Contesto.Provider>;
}

export const useTesti = () => useContext(Contesto);
export { forma, ricco } from "./forma";
