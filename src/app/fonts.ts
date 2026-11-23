import localFont from "next/font/local";
import { Jost } from "next/font/google";

// Butler: titoli, prezzi e saldo punti. CC BY-SA 4.0, Fabian De Smet (Dirtyline Studio).
export const butler = localFont({
  src: [
    { path: "../fonts/Butler-Light.woff2", weight: "300", style: "normal" },
    { path: "../fonts/Butler-Regular.woff2", weight: "400", style: "normal" },
    { path: "../fonts/Butler-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-butler",
  display: "swap",
});

// Sansumi: solo etichette maiuscole spaziate. Licenza per l'uso web da verificare prima del lancio.
export const sansumi = localFont({
  src: [
    { path: "../fonts/Sansumi-UltraLight.woff2", weight: "200", style: "normal" },
    { path: "../fonts/Sansumi-Regular.woff2", weight: "400", style: "normal" },
    { path: "../fonts/Sansumi-DemiBold.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-sansumi",
  display: "swap",
});

// Jost: testo corrente.
export const jost = Jost({
  // latin-ext per rumeno e polacco, cyrillic per il russo. Arabo e cinese usano i font del telefono.
  subsets: ["latin", "latin-ext", "cyrillic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-jost",
  display: "swap",
});
