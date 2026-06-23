// DealForge service worker — minimal app-shell cache for offline launch + installability.
// Data (deals/lenders/expenses) always goes to the network so cloud sync stays authoritative;
// only static shell assets are cached.
const CACHE = "dealforge-shell-v1";
const SHELL = ["/", "/index.html", "/style.css", "/app.js", "/icon.svg", "/manifest.webmanifest",
  "/engine/index.js", "/engine/flip-brrrr.js", "/engine/rental.js", "/engine/wholesale.js",
  "/engine/rehab.js", "/engine/defaults.js"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.pathname.startsWith("/api/")) return; // never cache API/data
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok && url.origin === location.origin) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match("/index.html")))
  );
});
