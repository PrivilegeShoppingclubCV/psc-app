import { riceviCsv } from "@/lib/gestionale/api";

export const maxDuration = 60;

// Il server dei negozi manda qui il CSV delle righe delle ricevute di cassa
// (procedura ReadyPro "Documenti di magazzino - Righe"): i prodotti che il socio
// vede dentro i suoi scontrini.
//   POST /api/gestionale/righe
//   Authorization: Bearer <chiave>
//   X-Nome-File: righe.csv           (facoltativo)
//   corpo = il file così com'è
export function POST(request: Request) {
  return riceviCsv(request, "gestionale_ricevi_righe", "righe.csv");
}
