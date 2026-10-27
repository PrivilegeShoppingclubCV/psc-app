"use client";

import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

/**
 * Codice a barre del numero tessera.
 * Formato provvisorio: CODE128. Va allineato a quello letto dalle casse del gestionale.
 */
export function Barcode({ value, label }: { value: string; label: string }) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    JsBarcode(ref.current, value, {
      format: "CODE128",
      displayValue: false,
      margin: 0,
      height: 96,
      width: 2,
      background: "transparent",
      lineColor: "#000000",
    });
    // JsBarcode fissa larghezza e altezza: le togliamo per farlo scalare col contenitore.
    ref.current.removeAttribute("width");
    ref.current.removeAttribute("height");
    ref.current.setAttribute("preserveAspectRatio", "none");
  }, [value]);

  return <svg ref={ref} className="psc-barcode" role="img" aria-label={label} />;
}
