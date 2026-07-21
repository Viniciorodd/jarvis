# Jarvis backlog — the resurfacing register

**Why this exists.** Tasks kept getting logged in daily notes / the vault and then never resurfaced —
"we say we'll do things, lock them, move on, and they don't get done." This file is the fix: a single
tracked home for every `#jarvis` engineering commitment, triaged so nothing silently decays. Swept from
`Second Brain` on **2026-07-20**. Re-sweep at each session that touches the backlog; date every change.

Legend: ✅ done · 🔨 **mine** (I can build without you) · 🧑 **needs you** (input / your hands / credentials) · 🗄️ superseded.

---

## ✅ Done (2026-07-20)
- ✅ **Deal Calculator + wire into Jarvis** — `pods/real-estate/deal-calc.mjs` (deterministic underwriting:
  cap · cash-on-cash · DSCR · cashflow · 1% rule · GRM · max-offer), `/api/real-estate/deal-calc`, live
  calculator card on `/real-estate`. 13 evals. *(vault: [[Jarvis]] 2026-07-03)*
- ✅ **Obsidian journal template (front-matter + section skeleton)** — completed
  `00 - System/Templates/Journal.md` with a reflection skeleton. *(vault: [[Jarvis]])*
- ✅ **Board-first status reporting (WS2 #8)** + **KPI/AI-spend panel (WS3/WS6)** + **post-loss debrief core
  (WS6)** — see [audit-prd-reconciliation.md](audit-prd-reconciliation.md).

## 🔨 Mine — buildable next without blocking on you (priority order)
1. **Proactive sub database upgrade** (`Strategic Pivot - Proactive Sub Database.md`): make Stage-3 sourcing
   query the existing bench FIRST, cold-source only for gaps; add **pricing-benchmark** capture per sub
   (price/sqft, hourly rate, minimums) so future quotes are checked against our own history, not one quote
   in isolation. Extends the subs bench already on `/govcon`.
2. **Post-loss debrief wiring** — the core is built; needs your OK (new outbound class) to fire on "lost"
   and stage behind the gate. *(one yes away)*
3. **"Agents visibly confirm they're running (no silent clicks)"** (`[[Jarvis]]`): audit each pod's
   run/append-event so every scheduled action leaves a visible trace on the board/Home. Partly true already
   (event log) — the gap is surfacing it in the UI.
4. **Book → operations review step** (`[[Jarvis]]`): a light Absorb-pod step that turns a saved highlight
   into a concrete change to a business system, not just a filed note. Design + small wiring.
5. **Bid-winner research feature for Gideon/Patricia** (`[[Jarvis]]` / `[[Gov contracting]]`): given a lost
   or awarded notice, pull who won + why (USAspending) to feed the debrief + future pricing. Scope first.

## 🧑 Needs you — input, your hands, or credentials (I cannot do these; they stay visible here)
- **Rotate the OpenRouter key** (`2026-07-03`) + the exposed Bitwarden self-hosted install key (flagged
  unrotated since 2026-07-09). **Credentials = your hands, by rule.** Highest-priority security item.
- **Cold-outreach tool choice** (Instantly vs Smartlead) + a **dedicated sending domain** (Namecheap +
  Cloudflare email routing — `Setup Guide - Free Rodgate Professional Email.md`). Needs your accounts.
- **API keys for planned integrations**: Perplexity/Sonar (Market Intelligence Agent), Resend
  (delivery-confirmed outreach sends), Sentry (error tracking). I wire them once the keys exist in env/vault.
- **Decisions I shouldn't make for you**: Upwork pod scope; "professional inbox" concrete example to build
  toward; Alexa voice front door (future); monthly money-snapshot reminder (Money Dashboard).
- **Jarvis 360 PRD open questions** (`Jarvis 360 Integration PRD.md`): OpenClaw channel (WhatsApp vs
  Telegram), who else gets visibility, Baselane webhook capability, reserved-tier review cadence.

## 🗄️ Superseded (don't rebuild)
- **MacBook Always-On Worker setup** (`Jarvis - MacBook Always-On Worker (setup).md`) — replaced by the NAS
  control-plane + scheduler + telegram-bridge in Docker. The Mac email-reconstruction jobs are retired.
- **Supabase opportunity-store migration** (tech-stack inventory) — the control-plane event log is the
  current single source of truth; revisit only if scale demands it (architecture call → ask first).

*Update log: 2026-07-20 · initial sweep of all #jarvis vault tasks + the 6 Rodgate Ideas files.*
