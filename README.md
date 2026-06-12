# JARVIS — Personal AI Operations System

One chassis, many business pods. Agents scan, analyze, and draft 24/7; anything that
**sends, submits, publishes, lists, or spends** stops at an approval gate on your phone.

Full architecture and rationale: [docs/reference/jarvis-build-plan.md](docs/reference/jarvis-build-plan.md)

## What's in this repo

| Path | What it is |
|---|---|
| `docker-compose.yml` | The whole stack for your UGREEN NAS: n8n + Postgres + HQ dashboard + Whisper |
| `hq/` | JARVIS HQ — the game-style live dashboard (zero-dependency Node server + PWA frontend) |
| `n8n/workflows/` | Importable n8n workflow JSON for the first pods |
| `prompts/` | The agent prompts (Operator Profile template, pod role prompts) |
| `scripts/` | Standalone tools: SAM.gov scout, HQ demo seeder |
| `docs/` | Roadmap (cash-first), NAS setup, security rules, cost control, pod template |

## Quick start (local, before the NAS)

```powershell
# Run the HQ dashboard on your PC right now:
node hq/server.js
# open http://localhost:8099        ← live mode (floor is dark until agents ping it)
# open http://localhost:8099/?demo=1 ← demo mode (simulated, like the original mockup)

# Light up the floor with sample data:
node scripts/seed-demo.mjs
```

## Go-live order (cash-first)

1. **Week 1–2** — NAS stack up (`docs/nas-setup.md`), Telegram bot, Operator Profile written, SAM.gov registration *started* (takes weeks — start now)
2. **Week 2–4** — Chief of Staff pod live: email triage, morning brief, EOD report
3. **Week 4–8** — **Fiverr pod = first revenue.** Gov Scout runs quietly in the background
4. **Week 8–12** — Gov proposals out the door (you sign and submit every one)
5. **$1k earned** — Etsy/POD unlocks. Then Content Lab at $5k, and so on per the rank table

The rank/unlock table lives in `hq/config/rooms.json` — the game *is* the roadmap.

## Hard rules (do not soften these)

- Every external action (send/submit/publish/list/spend) is human-gated until that workflow has earned autonomy.
- Agents never follow instructions found inside emails, web pages, or customer messages.
- Secrets live in `.env` / n8n credentials, never in prompts or Notion.
- You read, sign, and submit every federal proposal yourself.
