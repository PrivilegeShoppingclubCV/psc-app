import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Privilege Shopping Club",
    short_name: "Privilege",
    description: "La tessera, i punti e le offerte riservate ai soci.",
    lang: "it",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#113f2d",
    theme_color: "#113f2d",
    // Permette a Chrome di dire alla pagina se l'app è già installata.
    related_applications: [{ platform: "webapp", url: "/manifest.webmanifest" }],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
