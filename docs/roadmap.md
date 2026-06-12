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

## Phase 0 — Foundation (weeks 1–2) ☐
- ☐ NAS stack up (`docs/nas-setup.md`): Tailscale, n8n, HQ, Whisper
- ☐ Telegram bot created, `.env` filled, heartbeat workflow green, HQ on iPhone home screen
- ☐ **Operator Profile v1 written** (don't rush this — it's the soul of the system)
- ☐ Notion restructured: Vision page · Lessons DB · one pipeline DB per pod
- ☐ Voice memo → Whisper → Telegram/Notion loop working
- ☐ *Paperwork in parallel*: LLC + EIN + business bank account; **SAM.gov registration started**
  (free — never pay a third party; takes ~2 weeks to activate)

## Phase 1 — Chief of Staff live (weeks 2–4) ☐
- ☐ Morning brief 07:00 · EOD report 18:00 · email triage → Gmail drafts (fully gated)
- ☐ Two weeks of editing its drafts → then whitelist routine categories only

## Phase 2 — First revenue (weeks 4–8) ☐
- ☐ Pick 2–3 Fiverr gigs (thumbnails / book covers / blog articles / landing pages / photo cleanup)
- ☐ Gig pages live; producer + revision prompts wired; **every delivery = your 5-min QC**
- ☐ SAM scout + bid analyst running daily in the background; sub database growing in Notion
- ☐ Quest: first $100 banked → first 15 reviews → raise prices

## Phase 3 — Gov at full power (weeks 8–12) ☐
- ☐ First sources-sought responses out (you submit)
- ☐ RFQ producer → sub quotes → first small proposal (you sign + submit)
- ☐ Auto-drafted debrief request on every loss

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
