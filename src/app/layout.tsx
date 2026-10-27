import type { Metadata, Viewport } from "next";
import { butler, jost, sansumi } from "./fonts";
import { ServiceWorker } from "@/components/ServiceWorker";
import "@/styles/tokens.css";
import "@/styles/psc.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Privilege Shopping Club", template: "%s · Privilege Shopping Club" },
  description: "La tessera, i punti e le offerte riservate ai soci Privilege Shopping Club.",
  applicationName: "Privilege",
  appleWebApp: { capable: true, title: "Privilege", statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#091d10" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" className={`${butler.variable} ${sansumi.variable} ${jost.variable}`}>
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
