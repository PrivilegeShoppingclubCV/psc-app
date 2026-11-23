"use client";

// Testi per i componenti che girano nel browser (campo codice, data, tessera,
// banner "Installa"). Le pagine tradotte li passano con <TestiProvider>; fuori
// (pagine del club, pannello) restano in italiano.
import { createContext, useContext } from "react";
import { it } from "./testi/it";
import type { TestiClient } from "./testi";

const Contesto = createContext<TestiClient>(it.client);

export function TestiProvider({ testi, children }: { testi: TestiClient; children: React.ReactNode }) {
  return <Contesto.Provider value={testi}>{children}</Contesto.Provider>;
}

export const useTesti = () => useContext(Contesto);
export { forma, ricco } from "./forma";
