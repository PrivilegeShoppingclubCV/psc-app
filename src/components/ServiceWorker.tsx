"use client";

import { useEffect } from "react";

/** Registra public/sw.js. In sviluppo resta spento per non servire pagine vecchie dalla cache. */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);
  return null;
}
