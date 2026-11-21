import { riceviCsv } from "@/lib/gestionale/api";

// Il file si elabora a pezzi, una chiamata al database dopo l'altra.
export const maxDuration = 60;

// Il server dei negozi manda qui il CSV dei clienti esportato da ReadyPro:
//   POST /api/gestionale/clienti
//   Authorization: Bearer <chiave>
//   X-Nome-File: clienti.csv          (facoltativo)
//   corpo = il file così com'è
export function POST(request: Request) {
  return riceviCsv(request, "gestionale_ricevi_soci", "clienti.csv");
}
