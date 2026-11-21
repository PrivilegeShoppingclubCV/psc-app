"use client";

import { useEffect, useState } from "react";
import JsBarcode from "jsbarcode";

/**
 * Codice a barre del numero tessera (CODE128).
 *
 * Lo disegniamo come immagine con lo sfondo bianco "dentro" l'immagine stessa
 * e un margine bianco attorno (la zona di silenzio che serve agli scanner).
 * Così resta nero su bianco anche quando il browser scurisce da solo le pagine
 * (modalità scura forzata di Samsung Internet, Chrome e simili): quei sistemi
 * invertono i colori di testi, sfondi e disegni SVG nella pagina, ma lasciano
 * stare le immagini.
 */
export function Barcode({ value, label }: { value: string; label: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    JsBarcode(svg, value, {
      format: "CODE128",
      displayValue: false,
      margin: 20, // 10 moduli di bianco per lato
      height: 96,
      width: 2,
      background: "#ffffff",
      lineColor: "#000000",
    });
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    // JsBarcode fissa larghezza e altezza: le togliamo per farlo scalare col contenitore.
    svg.removeAttribute("width");
    svg.removeAttribute("height");
    svg.removeAttribute("style");
    svg.setAttribute("preserveAspectRatio", "none");
    setSrc(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.outerHTML)}`);
  }, [value]);

  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} className="psc-barcode" alt={label} /> : <div className="psc-barcode" role="img" aria-label={label} />;
}
