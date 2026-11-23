"use client";

import { esci } from "@/app/accesso/azioni";
import { useTesti } from "@/lib/i18n/client";

/** Esce e svuota le pagine salvate dal service worker: sul telefono non resta la tessera di chi è uscito. */
export function EsciButton() {
  const t = useTesti();
  const svuotaCache = () => {
    if ("caches" in window) caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
  };
  return (
    <form action={esci} onSubmit={svuotaCache}>
      <button type="submit" className="psc-btn psc-btn--secondary psc-btn--block">{t.esci}</button>
    </form>
  );
}
