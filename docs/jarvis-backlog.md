# Jarvis backlog — the resurfacing register

**Why this exists.** Tasks kept getting logged in daily notes / the vault and then never resurfaced —
"we say we'll do things, lock them, move on, and they don't get done." This file is the fix: a single
tracked home for every `#jarvis` engineering commitment, triaged so nothing silently decays. Swept from
`Second Brain` on **2026-07-20**. Re-sweep at each session that touches the backlog; date every change.

Legend: ✅ done · 🔨 **mine** (I can build without you) · 🧑 **needs you** (input / your hands / credentials) · 🗄️ superseded.

---

## 🏛 GovCon capability build — 8-phase plan (2026-07-24)
From a review of GovDash / GovGPT / the GovCon AI-tool landscape vs. what Jarvis already has. We build the
gaps ourselves (no $500/yr HigherGov). Order = win-rate leverage first, then dependency. Each phase = its own
spec → plan → build cycle. (Phases 7–8 added 2026-07-24 at operator request: 7 = REDOS bid-engine ports,
8 = the tonight PRD, kept LAST per operator.)
- ✅ **Phase 1 — RFP Shredder → Compliance Matrix** (done 2026-07-24). `pods/gov/attachments.mjs` (PDF via
  `unpdf` / DOCX via `adm-zip`, cached to `gov-drafts/att/`) + section-aware `pods/gov/matrix.mjs` (Section
  L/M/C + required-forms checklist; grounded AI reader that can't hallucinate a requirement; deterministic
  coverage). Live-proven: 4 attachment PDFs read → 63-gap matrix on a real notice. +20 evals (725→745).
  Spec `docs/superpowers/specs/2026-07-24-gov-rfp-shredder-phase1-design.md`, plan `…/plans/2026-07-24-gov-rfp-shredder-phase1.md`.
- 🔨 **Phase 2 — Amendment & Deadline Radar** — diff the attachment cache/manifest across scans → alert on
  amendments + shifted deadlines. Extends the deadline radar + Watcher-Health.
- 🔨 **Phase 3 — Past-Performance & Snippet Library** — reusable records + boilerplate that auto-insert into drafts.
- 🔨 **Phase 4 — Matrix-Grounded Drafting** — draft each section to answer the Phase-1 matrix rows, grounded
  in the Phase-3 library; existing `checkCompliance` verifies coverage. (Also lifts the AI reader's L/M recall.)
- 🔨 **Phase 5 — Incumbent & Extended Discovery** — who holds this / recompete timing / SLED beyond SAM (the
  build-it-ourselves HigherGov replacement).
- 🔨 **Phase 6 — SCA-Wage Bid-Price Builder** — parse the cached SCLS wage determination → labor-loaded bid price.
- 🔨 **Phase 7 — REDOS → Rodgate transferable patterns** (vault `🔁 REDOS → Rodgate — Transferable Patterns.md`).
  Three ports onto the existing bid engine — all code, eval-pinnable, PC-doable, independent of Phases 2–6:
  - **① Bid Coach** — extend `pods/gov/bid-fit.mjs` output from one "next action" to a ranked, severity-tagged
    mitigation set (🚨 Dealbreaker → ⚠️ Fix → 💡 Tip → 💡 Price move → ✅ Strength); every line a *move*, not an
    observation. Deterministic (from the same signals + disqualifiers + gates + price). Surfaces on the board card + brief.
  - **② Projected-vs-Actual win-rate engine** (the doc's "real gem", highest value) — a per-bid ledger row
    (Bid Fit score/verdict, win-prob, price-to-win, LOE, margin) captured at bid, filled at award; grade forecast
    accuracy (were PURSUEs winning? price-to-win biased? LOE under-estimated?) → a recalibration signal for the Bid
    Fit weights. Ties into `pods/gov/capture.mjs` (win/loss) + the [[🧠 Lessons Ledger]]. Fully independent — could
    be pulled earlier if the operator wants the win-rate loop sooner.
  - **③ Bid Brief one-pager** — branded capture/bid brief (opportunity + Bid Fit + verdict + price-to-win +
    teaming + top risks/mitigations), reusing `pods/gov/pdf.mjs`. Markets Rodgate as bigger than a solo shop to teaming partners.
- 🔨 **Phase 8 (LAST) — Tonight PRD follow-ups** (`docs/prd-2026-07-24-followups.md`). Cross-cutting infra/UX,
  NOT gov-pod — different domain, gated on live infra for 2 of 3 items:
  - **Item 1 — on-demand Gmail drafting** (doc marks URGENT; small + PC-doable): extract `appendGmailDraft` out of
    `stageDrafts` (shared helper, no dup) + add a `draft_gmail_reply` tool to `/api/chat` TOOLS so "draft a reply to
    X" writes a real `[Gmail]/Drafts` message. DRAFT-ONLY, never sends (truth-contract). **Could be pulled forward.**
  - **Item 2 — Telegram per-agent topics**: verify + fix the Cowork-built `companion/telegram-topics.mjs` +
    `telegram-bridge.mjs` (currently UNCOMMITTED in the tree) — needs a real phone + a forum group + the NAS bridge
    running; check the `createForumTopic` flat-chat fallback + that `narrate-rollup`/`narrate-truth` evals stay green.
  - **Item 3 — converge the two Jarvises**: execute `docs/one-source-of-truth.md`'s migration (point Morning Brief /
    Gov Inbox Watch at `/api/gov-board`, emit events not vault-note status guesses). Touches Mac-worker job prompts +
    n8n on the NAS — the PRD says this is its OWN session, run from the Mac (Tailscale access). I can't reach it from the PC.

## ✅ Done (2026-07-20)
- ✅ **Bid Fit Index** (PRD L-013) — `pods/gov/bid-fit.mjs` + `POST /api/gov/bid-fit`: disqualifier-aware
  weighted 0–100 bid scorer with bands, portal-gate/bond flags, no-shame output. All 6 PRD backtests pass.
  12 evals. SOP: vault `🎯 Bid Fit Index (scoring SOP).md`.
- ✅ **Watcher Health Contract** (PRD L-013) — `control-plane/watcher-health.mjs` + seed +
  `GET /api/gov/watcher-health`: three-state, BLIND-by-default; fiverr-order-watch reports BLIND. 13 evals.
  SOP: vault `Watcher Health Contract.md`.
- ✅ **Mobile/desktop nav + scroll fixes** — standalone pages scroll again (Deal Calculator reachable);
  one flat left drawer with all 10 destinations; network-first service worker so shipped UI actually reaches
  the desktop app (was serving stale files).
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
1. ✅ **Wire `recordRun()` into the live watchers** (2026-07-24) — new `lib.noteWatch()` (watcher-health.mjs
   kept pure); `gmail-triage` (runTriage) + `gov-scout` (runScan) self-update the ledger each run and push
   only sensor-health problems (BLIND/SUSPECT, transition-aware). *Still open:* `fiverr-order-poll` is an
   LLM-command job with no deterministic scanner to hook — its seed already reports BLIND correctly; wire it
   when a real fiverr pod exists. *(control-plane side goes live on next NAS redeploy.)*
2. ✅ **Bid Fit Index on board cards** (2026-07-24) — `buildBoard` attaches a per-card `bidFit` badge
   (PURSUE/REVIEW/THIN/NO-BID + score, band-colored, reasons/gates tooltip); verified 87/87 live cards.
   *Later add:* the "score this bid" drawer panel (operator inputs doc-takers / drive-hours / evaluation
   type → verdict) — the `/api/gov/bid-fit` endpoint already exists to power it.

*(The 7/12-audit and vault-sweep 🔨 items are all shipped — see ✅.)*

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
