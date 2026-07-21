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
- ✅ **Sub pricing intelligence** — `pods/gov/sub-pricing.mjs` (capture per-sub rates, per-trade network
  benchmarks, price-check a quote vs your own comps, bench-first sourcing) + `/api/gov/sub-pricing` + a
  "Pricing intelligence" panel & capture form on the subs bench. 12 evals. *(Strategic Pivot doc)*
- ✅ **Agents visibly confirm they're running (no silent clicks)** — `control-plane/heartbeats.mjs`
  (last run per agent, rests included) → `/api/activity` `heartbeats` → a 🫀 heartbeat strip in the
  activity view. 5 evals. *(vault: [[Jarvis]])*
- ✅ **Book → operations review step** — `pods/vault/book-to-ops.mjs`: parse Apple-Books highlights, map
  each to the business system it could improve, emit a "make a concrete change" card (2,642 actionable
  across your 254 books, gov-first). `/api/vault/book-ops` (read + mark-reviewed) → a 📚 Book → Ops section
  on `/ideas`. READ-ONLY on the vault. 8 evals. *(vault: [[Jarvis]])*
- ✅ **Post-loss debrief WIRING** (operator OK'd 2026-07-20) — marking a bid **lost** now stages a courteous
  CO debrief-request behind the normal approval gate: `connector.stageLossDebrief` writes the sendable draft
  on the executor's filesystem + raises the gate ONLY if a CO email resolves (else a needs-contact task,
  never a blank gate); `control-plane /maintenance/stage-debrief` (deduped on `gov.debrief.staged`); the
  companion disposition handler fires it on the lost *transition*, resolving the CO email from SAM. Nothing
  auto-sends. Functionally verified both paths (email → gated & sendable; no email → needs-contact).
  *(activates on the NAS redeploy)*
- ✅ **Bench-first sourcing** — `discoverSubs()` now checks the warm bench (`benchFirstMatch`) BEFORE the
  Google Places + SAM cold-source: if ≥3 ready subs cover the trade+area, it uses them and skips the cold
  search (a `force` flag overrides; thin benches still cold-source). Completes the query side of the
  Strategic Pivot (capture side already shipped). Verified on the real bench (20 warm / 5 ready janitorial
  → gate fires). *(activates where the gov worker runs — NAS redeploy)*
- ⚙️ **Bid-winner research — core done, one part not buildable** — `pods/gov/bid-winners.mjs`: aggregate
  the comparable-award sample (same one price-to-win fetches) by recipient → who wins this lane, win/dollar
  share, incumbent-vs-open read. `/api/gov/bid-winners` → a "Who wins this work" panel in the opp drawer.
  Feeds pricing + the debrief. 8 evals. Verified live (CHIMES 22.6% of 270 janitorial awards). **Still open**:
  per-award *scope* text (needs the award-detail API, a later add); "see their winning proposals" is **not
  public** — FOIA request only, so not API-buildable. *(vault: [[Jarvis]] / [[Gov contracting]])*

## 🔨 Mine — buildable next without blocking on you (priority order)
*(empty — the whole 🔨 list is shipped. Post-loss debrief wiring was the last item; done 2026-07-20 with
the operator's OK — see ✅ below. Next work comes from the vault sweep or new asks.)*

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
