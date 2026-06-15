# Jarvis World

A live, game-like window **into** the running Jarvis system — not a replacement for it. Every AI agent
shows up as an NPC at its pod's desk: it bobs while working, shows a speech bubble of its current task,
turns coral and pings when it **needs you**, and shakes red on error. It's how you *watch the AI perform
work* from your Windows PC, MacBook, iPhone, or iPad.

It is a read-mostly client of two services (doctrine §4 — every surface is a client of the control plane):
- **HQ** (`/hq`) — the floor: operators, rooms, approvals, activity feed, banked $ / XP.
- **Control-plane** (`/cp`) — system KPIs (autonomy ratio, human-edit rate) + the `/command` router.

The only things it *writes*: one-tap **approve/pass** on a pending approval, and the **command bar**
(which routes through the Chief-of-Staff — the agent classifies + gates it, never auto-acts on the irreversible).

## Run in dev (Windows / Mac)
```bash
# 1) start the backends (separate terminals, from the repo root)
node hq/server.js
node control-plane/server.js
# 2) start the world
cd jarvis-world
npm install
npm run dev        # http://localhost:5173  (vite proxies /hq and /cp to the backends)
```

## Deploy on the UGREEN NAS (Docker + Tailscale)
It's wired into the repo `docker-compose.yml` alongside `hq` and `control-plane`:
```bash
docker compose up -d --build hq control-plane jarvis-world
```
Then install it as a PWA: open `http://<nas-tailscale-name>:8095` on the iPhone/iPad → **Share → Add to
Home Screen**. nginx serves the static build and proxies `/hq` + `/cp` to the other containers by service
name, so there's no CORS to configure and nothing is exposed to the public internet (Tailscale-only).

## Notes
- The app polls HQ every 3s and the control-plane every 7s; it degrades gracefully if either is down
  (the live/offline dot in the header reflects HQ reachability).
- Agents appear when something logs them onto the floor (n8n workflows or the CoS router's HQ mirror,
  via `POST /api/event { agent, pod, state, text }`). Rooms come from `hq/config/rooms.json`.
- iOS home-screen icon uses `icon.svg`. For a pixel-perfect icon, drop `icon-192.png` / `icon-512.png`
  into `public/` and add them to the manifest in `vite.config.js`.
