# Jarvis backlog — the resurfacing register

**Why this exists.** Tasks kept getting logged in daily notes / the vault and then never resurfaced —
"we say we'll do things, lock them, move on, and they don't get done." This file is the fix: a single
tracked home for every `#jarvis` engineering commitment, triaged so nothing silently decays. Swept from
`Second Brain` on **2026-07-20**. Re-sweep at each session that touches the backlog; date every change.

Legend: ✅ done · 🔨 **mine** (I can build without you) · 🧑 **needs you** (input / your hands / credentials) · 🗄️ superseded.

---

## 🏛 GovCon capability build — 9-phase plan (2026-07-24, +Phase 9 2026-07-27)
From a review of GovDash / GovGPT / the GovCon AI-tool landscape vs. what Jarvis already has. We build the
gaps ourselves (no $500/yr HigherGov). Order = win-rate leverage first, then dependency. Each phase = its own
spec → plan → build cycle. (Phases 7–8 added 2026-07-24 at operator request: 7 = REDOS bid-engine ports,
8 = the tonight PRD, kept LAST per operator.)
- ✅ **Phase 1 — RFP Shredder → Compliance Matrix** (done 2026-07-24). `pods/gov/attachments.mjs` (PDF via
  `unpdf` / DOCX via `adm-zip`, cached to `gov-drafts/att/`) + section-aware `pods/gov/matrix.mjs` (Section
  L/M/C + required-forms checklist; grounded AI reader that can't hallucinate a requirement; deterministic
  coverage). Live-proven: 4 attachment PDFs read → 63-gap matrix on a real notice. +20 evals (725→745).
  Spec `docs/superpowers/specs/2026-07-24-gov-rfp-shredder-phase1-design.md`, plan `…/plans/2026-07-24-gov-rfp-shredder-phase1.md`.
- ✅ **Phase 2 — Amendment & Deadline-Change Radar** (done 2026-07-24). `pods/gov/amendments.mjs` (mirrors
  `deadlines.mjs`): `runScan` emits a per-bid `gov.snapshot` (deadline + attachment-hash-set signature +
  Amendment-N); `detectAmendments` (PURE, eval-pinned) flags a moved deadline / changed attachment set /
  bumped amendment on **pursued** bids only, idempotent via `gov.amendment.flagged`; `runAmendmentRadar`
  alerts once (Telegram+HQ) and invalidates the stale attachment cache so the matrix rebuilds fresh. New
  `/maintenance/amendment-check` + `amendment-radar` schedule job. 11 evals (747→758). Final opus review
  caught + fixed a byte-noise false-alert Critical. Spec `docs/superpowers/specs/2026-07-24-gov-amendment-radar-phase2-design.md`.
- ✅ **Phase 3 — Past-Performance & Snippet Library** (done 2026-07-24). `pods/gov/library.mjs`: deterministic
  tag/trade/NAICS retrieval (`matchScore`/`pastPerformanceFor`/`snippetsFor`/`libraryFor`) over a git-tracked
  seed of 7 Rodgate janitorial snippet templates (QC/staffing/transition/safety/overview + carpet/grounds) +
  gitignored runtime (real past-perf + edits). NEVER fabricates a citation (empty store → []). Marking a bid
  **won** adds a `needsReview` past-perf stub (id-keyed upsert). `/api/gov/library(/for)` + POST. 9 evals
  (758→767). Final review: Ready to merge. Phase 4 consumes `libraryFor`; must skip `needsReview` stubs.
  Spec `docs/superpowers/specs/2026-07-24-gov-library-phase3-design.md`.
- ✅ **Phase 4 — Matrix-Grounded Drafting** (done 2026-07-24, capstone). `pods/gov/grounding.mjs` `groundingBlock`
  (PURE): lists every matrix requirement (grouped, gaps-first) + library snippets + REAL past-performance only
  (filters `needsReview`; empty→explicit no-fabricate). `draft()` (worker.mjs) self-resolves the SAM key, folds
  in the block, strengthens the system prompt (answer every requirement; cite only provided past-perf;
  fabrication prohibited), trims the raw-SOW dump. Both call sites (scan + pursue) grounded; still fully gated,
  nothing auto-sends; existing facts-guard + compliance self-heal still run. 7 evals (767→774). Verified live
  (real notice → grounding block w/ requirements + 5 sections + no-fab). **Deferred:** coverage-% on the submit
  gate (viewable via `/api/gov/matrix`). Spec `docs/superpowers/specs/2026-07-24-gov-grounded-drafting-phase4-design.md`.
- ✅ **Phase 5 — Incumbent Intelligence & Recompete Timing** (done 2026-07-24). `pods/gov/incumbent.mjs`:
  `pickIncumbent` (latest-POP-end award, best-signal, empty→null no fabrication) + `recompeteTiming`
  (unknown/stale/recompeting-now/window/locked) + `incumbentFor` (reuses the cached USASpending sample — no new
  API load — + lane concentration from bid-winners). `price-to-win` award query now pulls `End Date`.
  `/api/gov/incumbent`. Live-verified: janitorial/PA → 275 awards, incumbent Penn-York (POP 2029, locked 30mo).
  9 evals (774→783). **SLED-beyond-SAM discovery DEFERRED** (per-portal scrapers = own effort) — future add.
  Spec `docs/superpowers/specs/2026-07-24-gov-incumbent-phase5-design.md`.
- ✅ **Phase 6 — SCA-Wage Bid-Price Builder** (done 2026-07-24 — completes the gov pipeline). `pods/gov/wage-det.mjs`:
  `parseWageDetermination` (rates + Health & Welfare from the cached SCLS attachment; garbage→empty, no fabricated
  wage), `janitorialRates` (title-matched), `laborLoadedPrice` (self-perform SCA-compliant bid; clamped
  burden/overhead/profit knobs; **never below the wage floor — structural invariant, not a check**),
  `readCachedWd`. `/api/gov/wage-price?noticeId=&hours=`. Sample: Janitor $22.21/hr × 2080 → $68,192.81. 8 evals
  (783→790). Final review: Ready to merge, no fixes. Spec `docs/superpowers/specs/2026-07-24-gov-sca-wage-price-phase6-design.md`.
- 🔨 **Phase 7 — REDOS → Rodgate transferable patterns** (vault `🔁 REDOS → Rodgate — Transferable Patterns.md`).
  Three ports onto the existing bid engine — all code, eval-pinnable, PC-doable, independent of Phases 2–6:
  - ✅ **① Bid Coach** (done 2026-07-25) — `bidCoach(opp)` in `pods/gov/bid-fit.mjs`: ranked, severity-tagged
    MOVES (🚨 dealbreaker → ⚠️ fix → 💡 tip → ✅ strength), deterministic from the same signals/gates/disqualifiers.
    On `/api/gov/bid-fit`. 3 evals (795→798). _Surfacing on the board card/drawer UI still TODO._
  - **② Projected-vs-Actual win-rate engine** (the doc's "real gem", highest value) — a per-bid ledger row
    (Bid Fit score/verdict, win-prob, price-to-win, LOE, margin) captured at bid, filled at award; grade forecast
    accuracy (were PURSUEs winning? price-to-win biased? LOE under-estimated?) → a recalibration signal for the Bid
    Fit weights. Ties into `pods/gov/capture.mjs` (win/loss) + the [[🧠 Lessons Ledger]]. Fully independent — could
    be pulled earlier if the operator wants the win-rate loop sooner.
  - **③ Bid Brief one-pager** — branded capture/bid brief (opportunity + Bid Fit + verdict + price-to-win +
    teaming + top risks/mitigations), reusing `pods/gov/pdf.mjs`. Markets Rodgate as bigger than a solo shop to teaming partners.
- 🔨 **Phase 8 (LAST) — Tonight PRD follow-ups** (`docs/prd-2026-07-24-followups.md`). Cross-cutting infra/UX,
  NOT gov-pod — different domain, gated on live infra for 2 of 3 items:
  - ✅ **Item 1 — on-demand Gmail drafting** (done 2026-07-24, pulled forward per operator). `pods/inbox/compose.mjs`
    owns the ONE draft mechanism (`replySubject` + `appendGmailDraft` → IMAP append to `[Gmail]/Drafts`, `\Draft`,
    NEVER sends); `stageDrafts` refactored onto it (dedup); new `draft_gmail_reply` tool + handler in `/api/chat`
    with a truthful "drafted, never sent" reply. Verified live end-to-end vs Gmail. 747 evals green.
  - **Item 2 — Telegram per-agent topics**: verify + fix the Cowork-built `companion/telegram-topics.mjs` +
    `telegram-bridge.mjs` (currently UNCOMMITTED in the tree) — needs a real phone + a forum group + the NAS bridge
    running; check the `createForumTopic` flat-chat fallback + that `narrate-rollup`/`narrate-truth` evals stay green.
  - **Item 3 — converge the two Jarvises**: execute `docs/one-source-of-truth.md`'s migration (point Morning Brief /
    Gov Inbox Watch at `/api/gov-board`, emit events not vault-note status guesses). Touches Mac-worker job prompts +
    n8n on the NAS — the PRD says this is its OWN session, run from the Mac (Tailscale access). I can't reach it from the PC.
- 🔨 **Phase 9 (LAST) — GovCon Autonomous Outreach** (`00 - System/Jarvis/PRD — GovCon Autonomous Outreach…md`, added
  2026-07-27 at operator request). ⚠️ **CHANGES A STANDING HARD RULE**: agents may AUTO-SEND a defined class of
  low-stakes outreach (sub-quote requests, follow-ups → Tier 1; prime intros → Tier 2; sources-sought → Tier 3),
  while **proposals/bids/pricing/commitments/CO submissions stay human-sent forever** (§2 hard line). Guardrails are
  CODE not prompts (§4): approved templates only · Canonical-Facts injection (L-005) · **verified-recipient allowlist**
  (`verified:true` per CRM contact, L-009) · rate limits/caps · three-place logging (L-003) · verified-send (L-014) ·
  inbound-is-untrusted injection defense · **scoped least-privilege send credential** · kill switch · daily digest.
  Autonomy ladder (§5): Tier 0→1→2→3, promote on a clean record, one bad send = demote. Also 5 vault rule changes (§6:
  CLAUDE.md permissions, Architecture directive #2, board `🤖 auto`/`👤 sent` marker, Lessons Ledger, CRM `verified` field).
  🧑 **HARD PREREQUISITES before ANY auto-send (operator's hands):** (1) resolve the **2026-07-21 credential flag**
  (unexplained app-password + passkey on rodgategroup) — cannot run autonomous email on a credential of unknown origin;
  (2) confirm the approved templates; (3) seed the verified-contact allowlist; (4) confirm the scoped sending account.
  Runs on the Mac worker + gov pod. This is the autonomy-ladder the architecture always said was "missing."

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
