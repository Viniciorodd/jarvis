# Roadmap — cash-first ordering

> Status: **Phase 0**. Update this file as phases complete.

The single rule: **prioritize what can bank money in month 1–2, run the slow pipelines
(gov) in the background from day 1, and gate everything else behind earned ranks.**

## Where the early money actually is

| Source | First dollar | Month-3 realistic | Notes |
|---|---|---|---|
| **Fiverr pod** | Week 2–4 | $500–1,500/mo | New accounts need reviews to rank. Price low, deliver fast, raise after 15–20 reviews. This is the $1k/month engine. |
| **Chief of Staff** | — | — | Banks *time*, not dollars — but the hours it returns are what you spend QC'ing Fiverr orders. |
| **Gov contracting** | Day 60–120+ | first small award | Federal sales cycle is slow by nature. Scout from day 1 so the pipeline is full when you're ready. |
| Etsy/POD | after $1k rank | thin margins, volume game | Locked until Fiverr proves the pipeline. |
| Everything else | per rank table | — | Content $5k · music/kids $10k · real estate desk $25k · trading-monitor/supplements $50k. |

## Phase 0 — Foundation (weeks 1–2)
**Paperwork: DONE ✅** — Rodgate, LLC is formed (PA), EIN issued, US Bank account open,
SAM.gov registered (UEI Z1SWBFEK7EM4, CAGE assigned), SDB/minority/Hispanic-owned +
small/micro self-certs in place, and registered as a PA COSTARS / Commonwealth vendor.
This means the **Gov pod can start producing in Phase 2, not Phase 3.** Entity details live
in `prompts/gov/entity-profile.md` (gitignored).
- ☐ Confirm sam.gov shows **"Active"** (not "Submitted") and the CAGE code — fill it into entity-profile.md
- ☐ Calendar the **SAM renewal: ~Jan 3, 2027** (expires Feb 2, 2027)
- ☐ NAS stack up (`docs/nas-setup.md`): Tailscale, n8n, HQ, Whisper
- ☐ Telegram bot created, `.env` filled, heartbeat workflow green, HQ on iPhone home screen
- ☐ **Operator Profile v1 written** (don't rush this — it's the soul of the system)
- ☐ Notion restructured: Vision page · Lessons DB · Gov pipeline DB · Fiverr DB
- ☐ Voice memo → Whisper → Telegram/Notion loop working
- ☐ Build the boilerplate library for proposals: capabilities statement (janitorial/grounds
  focus, lead with SDB/minority/Hispanic-owned), past-performance sheet (note: new entity —
  use the owner's relevant experience), pricing template

## Phase 1 — Chief of Staff live (weeks 2–4) ☐
- ☐ Morning brief 07:00 · EOD report 18:00 · email triage → Gmail drafts (fully gated)
- ☐ Two weeks of editing its drafts → then whitelist routine categories only

## Phase 2 — First revenue (weeks 4–8) ☐
- ☐ Pick 2–3 Fiverr gigs (thumbnails / book covers / blog articles / landing pages / photo cleanup)
- ☐ Gig pages live; producer + revision prompts wired; **every delivery = your 5-min QC**
- ☐ SAM scout (NAICS 561210/561720/561990) + bid analyst running daily; sub database in Notion
- ☐ **Gov pod accelerated** (paperwork already done): respond to first sources-sought notices
  and small janitorial/grounds set-asides — federal AND PA COSTARS/eMarketplace
- ☐ Quest: first $100 banked → first 15 reviews → raise prices

## Phase 3 — Gov at full power (weeks 8–12) ☐
- ☐ RFQ producer → sub quotes → first small proposal (you sign + submit)
- ☐ Auto-drafted debrief request on every loss
- ☐ Add PA COSTARS / eMarketplace scout as a second source alongside SAM.gov
- ☐ Roadmap item: pursue **SBA 8(a) certification** (you're already SDB/minority-owned —
  8(a) is the highest-value upgrade for winnable sole-source + set-aside work)

## Phase 4 — Expansion (month 4+, rank-gated) ☐
- Etsy/POD at $1k · Content Lab at $5k · Music or Kids bay at $10k (pick ONE first) ·
  Real Estate desk at $25k · Trading watchtower (monitor-only) + supplements (with counsel) at $50k
- Standing rule: **never add a pod while another one is on fire.**

## Your first 7 days
1. NAS: enable Docker, get Tailscale connected to iPhone/iPad
2. `@BotFather` → bot token; `@userinfobot` → chat id; fill `.env`; `docker compose up -d`
3. Import `00-hq-heartbeat` → watch the HQ floor light up; add HQ to home screen
4. Write Operator Profile v1 (2–3 honest pages)
5. Restructure Notion; connect the Notion credential in n8n
6. Import morning-brief + EOD + voice-memo workflows
7. Start LLC/EIN + SAM.gov; pick your 2–3 Fiverr gig categories
