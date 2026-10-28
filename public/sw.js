// Service worker della PWA Privilege Shopping Club.
// - Pagine: prima la rete, poi la copia salvata (così la tessera si apre anche offline).
// - File statici (/_next/static, font, logo, icone): prima la cache.
// - Il pannello /admin non si salva mai: è solo online.
// - Le pagine del club dipendono da chi ha fatto l'accesso: si salvano solo dopo
//   averle visitate, e il bottone Esci svuota le cache.
// Cambia VERSIONE per svuotare le cache vecchie a ogni rilascio che lo richiede.

const VERSIONE = "v2";
const CACHE_PAGINE = `psc-pagine-${VERSIONE}`;
const CACHE_STATICI = `psc-statici-${VERSIONE}`;
const NON_SALVARE = ["/auth/", "/verifica", "/accedi", "/collega-tessera", "/iscriviti", "/admin"];

self.addEventListener("install", (event) => {
  // Nessuna pagina salvata in anticipo: "/" e "/home" cambiano a seconda di chi ha fatto l'accesso.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => ![CACHE_PAGINE, CACHE_STATICI].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const statico = (url) =>
  url.pathname.startsWith("/_next/static/") ||
  url.pathname.startsWith("/brand/") ||
  url.pathname.startsWith("/icons/") ||
  /\.(woff2|svg|png|ico)$/.test(url.pathname);

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    const daSalvare = !NON_SALVARE.some((p) => url.pathname.startsWith(p));
    event.respondWith(
      fetch(request)
        .then((res) => {
          // Una pagina arrivata dopo un redirect (es. /home → /accedi) non va salvata sotto il nome di partenza.
          if (daSalvare && res.ok && !res.redirected) {
            const copia = res.clone();
            caches.open(CACHE_PAGINE).then((cache) => cache.put(request, copia));
          }
          return res;
        })
        .catch(async () => (await caches.match(request, { ignoreSearch: true })) ?? (await caches.match("/home")) ?? Response.error())
    );
    return;
  }

  if (statico(url)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((res) => {
            if (res.ok) {
              const copia = res.clone();
              caches.open(CACHE_STATICI).then((cache) => cache.put(request, copia));
            }
            return res;
          })
      )
    );
  }
});
