import { riceviCsv } from "@/lib/gestionale/api";

// Il file si elabora a pezzi, una chiamata al database dopo l'altra.
export const maxDuration = 60;

// Il server dei negozi manda qui il CSV delle vendite esportato da ReadyPro:
// ogni vendita con una tessera diventa un movimento punti.
//   POST /api/gestionale/vendite
//   Authorization: Bearer <chiave>
//   X-Nome-File: vendite.csv          (facoltativo)
//   corpo = il file così com'è
export function POST(request: Request) {
  return riceviCsv(request, "gestionale_ricevi_vendite", "vendite.csv");
}
