# Jarvis — desktop app

A clickable, native window onto the whole system: switch between **Jarvis World** and **HQ**, pointed at
your NAS over Tailscale (or localhost in dev). Stays in the tray; summon from anywhere with
**Ctrl/Cmd + Shift + J**. External links (real sam.gov, etc.) open in your system browser.

## The cross-platform story
| Device | How to "click into Jarvis" |
|---|---|
| **iPhone / iPad** | Open `http://<nas>:8095` (World) or `:8099` (HQ) in Safari → **Share → Add to Home Screen**. Both are PWAs, so you get real standalone app icons — no app store, no build. |
| **Windows / Mac** | This Electron app (native window + tray + hotkey). Or, if you prefer no install: open the URL in Chrome/Edge → **⋮ → Install app**. |

## Run in dev
```bash
cd desktop
npm install
npm start          # opens the window; set the host field to "localhost" while the NAS is off
```
Make sure the services are up (World on :8095, HQ on :8099) — locally via `npm run dev` in `jarvis-world/`
+ `node hq/server.js`, or on the NAS via `docker compose up -d`.

## Build installers (run on each target OS)
```bash
npm run dist:win   # → dist/Jarvis Setup x.y.z.exe   (run on Windows)
npm run dist:mac   # → dist/Jarvis-x.y.z.dmg          (run on macOS; signing needs an Apple cert)
```
electron-builder can't cross-compile a macOS `.dmg` from Windows — build each on its own OS (or in CI).

## Configure
The **host** field in the top bar (saved locally) points the app at your NAS Tailscale name
(e.g. `jarvis-nas`) or `localhost`. Ports are fixed: World `8095`, HQ `8099`.

For a polished icon, drop `icon.png` (512×512) + `icon.ico` here; electron-builder picks them up.
