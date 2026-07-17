# Always-on host (Phase 2, Option B: bulletproof the PC)

Goal: Jarvis is reachable from your phone/Mac/iPad **even after a reboot, a crash, or a power blip** —
without you having to open anything. We host on the PC (not the NAS) and make the PC bring Jarvis back by
itself. Voice has a separate workaround (parked).

## What runs (one task, self-healing)

A single Scheduled Task — **"Jarvis Server"** — runs [`scripts/start-jarvis.cmd`](../scripts/start-jarvis.cmd)
at logon. It launches each piece under [`run-loop.cmd`](../scripts/run-loop.cmd), which **restarts any piece
5s after it exits** (crash-proof) and logs to `logs/`:

| Piece | What it is | Restart on crash | Restart on **hang** |
|---|---|---|---|
| `companion/server.js` | the cockpit UI on :8095 | ✅ run-loop | ✅ **watchdog** |
| `companion/telegram-bridge.mjs` | Telegram command/approval channel | ✅ run-loop | — |
| `pods/gov/inbox-watch.mjs` | gov inbox watcher | ✅ run-loop | — |
| `scripts/jarvis-watchdog.mjs` | **NEW** health watchdog | ✅ run-loop | n/a |

### The watchdog (the Phase-2a add)
[`scripts/jarvis-watchdog.mjs`](../scripts/jarvis-watchdog.mjs) closes the two gaps run-loop can't see:
- **Hang recovery** — polls `http://127.0.0.1:8095/api/health` every 30s. After 3 straight failures (~90s
  down) it kills the wedged listener on :8095 so run-loop respawns a fresh one. **Safety:** it only ever
  kills a PID it has confirmed is `node.exe` *and* is the actual listener on :8095, and only after sustained
  failure — never a healthy process, never a non-node process.
- **Tunnel recovery** — re-asserts `tailscale serve` for :8095 at boot and periodically, so if the HTTPS
  tunnel ever drops, your phone/Mac get Jarvis back without you touching the PC.

## The HTTPS front door
`tailscale serve` maps **https://shisui.tailf46d22.ts.net → http://127.0.0.1:8095** (tailnet-only, real
cert, no public exposure). This is the URL you install as a PWA on every device. Verify it's up:
```
tailscale serve status        # should show:  |-- / proxy http://127.0.0.1:8095
```

## ⛏ Two one-time manual steps (yours — I can't do these safely)
These are what make the logon-task fire **unattended** after a reboot and after a power loss:

1. **Auto-login** so Windows reaches the desktop by itself (the "Jarvis Server" task runs *at logon*):
   - Press `Win+R` → type `netplwiz` → Enter.
   - Uncheck **"Users must enter a user name and password to use this computer"** → Apply → enter your
     password twice → OK. (If the checkbox is missing: it's a known Win11 toggle — tell me and I'll give you
     the registry alternative.)
2. **Power-on after an outage** (so a blackout doesn't leave the PC off):
   - Reboot → enter BIOS/UEFI (usually `Del` or `F2` at boot).
   - Find **"Restore on AC Power Loss"** (a.k.a. "AC Power Recovery" / "After Power Failure") → set to
     **Power On** (or "Last State"). Save & exit.

## Install / verify / undo
```
# install (run ONCE — double-click is fine; "Run as administrator" if it says access denied):
scripts\install-autostart.cmd

# verify the task is registered:
schtasks /query /tn "Jarvis Server"

# verify it's actually serving (local + tunnel):
curl http://127.0.0.1:8095/api/health         # {"companion":true,"controlPlane":true,...}
tailscale serve status                          # maps :8095

# watchdog activity:
type logs\jarvis-watchdog.log

# undo autostart:
schtasks /delete /tn "Jarvis Server" /f
```

## The launchers, consolidated (Phase 2b)
There is now ONE always-on mechanism and one manual full-stack launcher — no more overlapping duplicates:

| Script | Role | When it runs |
|---|---|---|
| [`scripts/start-jarvis.cmd`](../scripts/start-jarvis.cmd) | **the always-on task** — companion + telegram + gov-watch + **watchdog**, each under run-loop | auto, at logon (the "Jarvis Server" task) |
| [`companion/start-jarvis.cmd`](../companion/start-jarvis.cmd) | **full local stack** — also starts Ollama + control-plane + scheduler + Slack locally (dev, or a NAS-down fallback) | manual double-click only |

Retired 2026-07-16 (deleted — they only duplicated the companion line above): `companion/jarvis-forever.cmd`
and `companion/jarvis-autostart.ps1`.

### Retire any older duplicate *tasks* (one-time)
Earlier iterations may have registered tasks under other names. **"Jarvis Server"** is now the single source
of truth. Remove any leftovers so you never run two companions:
```
schtasks /query | findstr /i jarvis            # list any jarvis tasks
schtasks /delete /tn "JarvisCompanion" /f       2>nul
schtasks /delete /tn "JARVIS Companion" /f      2>nul
Unregister-ScheduledTask -TaskName "JARVIS Companion" -Confirm:$false   # (PowerShell form, if present)
```
The companion refuses to start a second copy if :8095 is busy, so a lingering duplicate is harmless but
wasteful — worth clearing.

_Status: watchdog + tunnel-recovery + launcher consolidation shipped 2026-07-16. Auto-login set (AutoAdminLogon=1).
Remaining operator homework: reboot to test + BIOS "Restore on AC Power Loss → Power On"._
