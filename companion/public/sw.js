// sw.js — SELF-DESTRUCT (2026-07-20). The service worker was removed: this app is served from localhost
// (always online), so a SW bought nothing and repeatedly served stale home.js/today.js -> blank screens.
// index.html no longer registers a worker; this script only exists so any device that STILL has an old
// worker installed will unregister it and drop every cache on the next activate, then load fresh from net.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    try { const keys = await caches.keys(); await Promise.all(keys.map((k) => caches.delete(k))); } catch {}
    try { await self.registration.unregister(); } catch {}
    // no clients.navigate() here — the page's own kill-switch clears things on load; navigating post-
    // unregister risks nothing but we avoid it to prevent any reload churn.
  })());
});
// No fetch handler at all -> the browser goes straight to the network for everything.
