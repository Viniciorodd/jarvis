// sw.js — Jarvis service worker. The fix for "add to Home Screen → blank screen": iOS launches a
// home-screen PWA in standalone mode, and with NO service worker a momentary network hiccup on launch
// leaves it white. This caches the app shell so the app ALWAYS has something to render, then reloads
// live data over the network. Requires a secure context (HTTPS via Tailscale Serve, or localhost) — over
// plain http it never registers, which is fine (index.html only registers it on https/localhost).
//
// Strategy (2026-07-20 — fixed stale UI on the desktop app + installed PWA):
//   • navigations (the app shell) → network-first, fall back to the cached shell (never blank).
//   • /api/* (live data)          → network-only, never cached (tasks/calendar/approvals must be fresh).
//   • same-origin static assets   → NETWORK-FIRST (this PC serves them locally, so "online" is ~always
//     true): the live file always wins, the cache is only a fallback when the server is unreachable.
//     The old stale-while-revalidate served last-session's CSS/JS first, so shipped fixes never showed.
//   • cross-origin (fonts/icons)  → cache-first, best-effort.
const VERSION = 'jarvis-v4'; // bump on shell asset change (app.js silent-greeting) to push to installed PWAs
const SHELL = VERSION + '-shell';
const RUNTIME = VERSION + '-runtime';

// The minimum needed to paint the app offline/on a flaky launch. Everything else is runtime-cached.
const SHELL_URLS = [
  '/', '/index.html',
  '/style.css', '/today.css',
  '/app.js', '/nav.js', '/talkhome.js', '/today.js', '/home.js', '/brain.js',
  '/manifest.webmanifest', '/icon.png', '/icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    // best-effort: don't let one missing file abort the whole precache
    await Promise.all(SHELL_URLS.map((u) => c.add(u).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
    await self.clients.claim();
    // NOTE: intentionally do NOT auto-reload clients here — network-first (below) already serves fresh
    // assets on the next load, and force-navigating on activate risks a reload loop.
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return; // never cache POST/PUT (approvals, captures, etc.)
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // Live data — always network, never cached.
  if (sameOrigin && (url.pathname.startsWith('/api/') || url.pathname.startsWith('/tts'))) return;

  // App shell / navigations — network-first so you get the latest UI, cached shell if the network blips.
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const net = await fetch(req);
        const c = await caches.open(SHELL); c.put('/', net.clone()).catch(() => {});
        return net;
      } catch {
        return (await caches.match('/')) || (await caches.match('/index.html')) || Response.error();
      }
    })());
    return;
  }

  // Same-origin static assets — NETWORK-FIRST. The live file (from this PC's local server) always wins;
  // the cache is only a fallback for a genuinely offline launch. This is the fix for shipped CSS/JS not
  // showing up: the old stale-while-revalidate returned the previous session's file every time.
  if (sameOrigin) {
    e.respondWith((async () => {
      try {
        const net = await fetch(req);
        if (net && net.ok) caches.open(RUNTIME).then((c) => c.put(req, net.clone())).catch(() => {});
        return net;
      } catch {
        return (await caches.match(req)) || Response.error();
      }
    })());
    return;
  }

  // Cross-origin (fonts/icon CDNs) — cache-first, best-effort.
  e.respondWith((async () => {
    const cached = await caches.match(req);
    const fetching = fetch(req).then((net) => {
      if (net && net.ok) caches.open(RUNTIME).then((c) => c.put(req, net.clone())).catch(() => {});
      return net;
    }).catch(() => null);
    return cached || (await fetching) || Response.error();
  })());
});
