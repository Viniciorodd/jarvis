# Where we are & what's next (handoff — read this first in a new chat)

_Updated 2026-07-06. Committed to `feat/core-infrastructure-v2` (NOT yet pushed — operator pushes when ready). Resume from here._

### 🆕 2026-07-06 (newest) — Tax & Wealth pod (Sage/TAX-01) Phase 2 shipped: bank-CSV importer
Built per `docs/superpowers/specs/2026-07-06-tax-pod-phase2-importer-design.md`, branch
`feat/tax-phase2-importer`, 6 TDD tasks:
- **`pods/tax/importer.mjs`** (parse + dedup + classify + fs drop-folder wrapper), **`accounts.mjs`**
  (account registry, header-hash column-map profiles), **`review.mjs`** (resolution of `needs_review`
  items) + the append-only void/supersede support added to `ledger.mjs`. Routes:
  `/api/tax/review` (list) and `/api/tax/review/resolve` (accept/recategorize/merge/keep-both/reject),
  plus a cockpit review screen.
- **Backfill CLI**: `node pods/tax/importer.mjs --backfill` drains `tax-inbox/` once, prints
  `N files · X filed · Y queued · Z quarantined · $D deductions found`, and flags any file still
  `needs-mapping` (register that account + confirm its column map first).
- **Fix carried from review**: `importInbox` now takes a `ledgerDir` override (passed through to
  `readLedger`/`appendEntry`) so tests/smokes can run against a temp ledger without ever touching the
  operator's real `tax-ledger/`. Verified via a synthetic end-to-end smoke (temp inbox + temp ledger):
  a clean row filed, a cross-source duplicate queued as `suspected-dup`, a >20%-garbage file
  quarantined to `failed/`, and the real ledger confirmed byte-for-byte unchanged before/after.
- **Eval harness green: 348/348** (`node evals/run.mjs`).
- **Known limitations:** the in-UI column-map confirm (first-import wizard) is deferred — for now the
  operator registers accounts + column maps via `accounts.local.json` / `saveProfile()`; per-row
  property attribution is entity-level only (no per-row property inference from CSV text); the review
  routes read the current tax year's ledger only.
- **Operator homework (do this to make Phase 2 real):**
  1. Register each bank/card account once — an `id`, a `label`, and its `defaultEntity`
     (`rodgate` | `sidehustles` | `brickave-llc`) in `pods/tax/accounts.local.json` (copies from the
     `accounts.json` template on first run) — then confirm its column map on the first CSV import for
     that account (Claude proposes the map from the header; you confirm before anything files).
  2. Export Jan–Jun 2026 CSVs from each account into `tax-inbox/`, then run
     `node pods/tax/importer.mjs --backfill`. Anything it can't confidently classify lands in
     `needs_review` for the cockpit review screen, not silently guessed.
  3. The standing items carried from Phase 1: set the local EIT rate (`pods/tax/entities.json`), enter
     SBA loan terms + the 3 Chase payment-plan amounts/due days (`debts.json`), property basis +
     in-service dates for depreciation (from the Z:\Real Estate HUD + rehab receipts), and confirm
     whether Form 1065 partnership returns were ever filed for 2135 Brick Ave, LLC (2024/2025).
- ⏭ **Next build ideas:** scheduler jobs for payment reminders + a weekly bucket-nudge digest;
  **Phase 3** (docs indexer linking Z:\Real Estate + gov/Fiverr docs to ledger entries,
  FreeTaxUSA-interview-ordered filing pack, deadline wiring for 1040-ES/1099-NEC/1065).

### 2026-07-06 — Tax & Wealth pod (Sage/TAX-01) Phase 1 shipped, 10 TDD tasks
Built per `docs/superpowers/specs/2026-07-05-tax-pod-design.md`, reports to Victor/LEDGER-01:
- **`pods/tax/`**: TY2026 constants (each param verified-flagged; unverified ⚠ warn at runtime), pure
  eval-pinned tax engine (SE tax, federal brackets, QBI, PA 3.07% + local EIT, 27.5y mid-month depreciation,
  19%/81% K-1 split for 2135 Brick Ave, LLC with K-1 **losses excluded + flagged** — never silently
  subtracted, safe-harbor quarterlies), append-only ledger (`tax-ledger/<year>.jsonl`, fixed form-line
  taxonomy so the LLM can never invent a category, hash dedupe), capture (code-parsed amounts + keyword
  rules + LLM fallback gated to the taxonomy, `needs_review` queue), savings splitter (exact-sum
  largest-remainder, tax% auto from the estimator, debt/emergency/invest buckets), debt desk
  (`pods/tax/debts.seed.json` from the 2026-04-27 myFICO report — 3 Chase + SBA paying, 4 charge-offs,
  2 disputed collections — payment reminders, avalanche/snowball payoff plans, 1099-C cancellation-of-debt
  income anticipation), status assembler (headline + warnings). Routes `/api/tax/status|capture|paid`;
  cockpit Home glance gained a 💰 line. **Eval harness green: 316/316** (tax-wealth suite added).
- **Operator setup homework (not yet done):** set the local EIT rate in `pods/tax/entities.json`; enter
  SBA loan terms + the 3 Chase payment-plan amounts/due days (`debts.seed.json` → `debts.json` on first
  run, then edit `debts.json`); property basis + in-service dates for depreciation (from the Z:\Real Estate
  HUD + rehab receipts); export Jan–Jun 2026 bank CSVs ahead of the Phase 2 backfill. **Top judgment call:**
  confirm whether Form 1065 partnership returns were ever filed for 2135 Brick Ave, LLC (2024/2025).
- ⏭ **Phase 2 (outlined, not built):** `pods/tax/importer.mjs` CSV drop-folder + saved bank-column
  profiles, `claudeBatch()` classification + weekly review gate, Jan–Jun backfill, scheduler reminders.
  **Phase 3 (outlined, not built):** docs indexer (link Z:\Real Estate + gov/Fiverr docs to ledger
  entries), FreeTaxUSA-interview-ordered filing pack, deadline wiring (1040-ES/1099-NEC/1065), 1099-NEC
  contractor tracking.

### 🆕 2026-06-30 — closed the 5 open infra gaps + the "anyone can run it" GOV SUBMIT WIZARD
A full pass through the doctrine's remaining gaps, in priority order, each eval-pinned (193 → 218 green):
- **Gap #2 — vault least-privilege now ENFORCED at the point of use.** The ACL was eval-tested but only
  the Anthropic key flowed through it; SAM/Places/Hunter/FAL read `process.env` directly. New
  `pods/lib.mjs secret(agent,name)` broker; gov scout/discover/enrich + `scripts/studio-lib.mjs` route
  through it; `CONNECT-01` granted SAM/Places/Hunter (its real job), still denied money/image keys.
  `control-plane /vault/audit` (who-can-read-what, never values). Smoke-verified: the bid analyst is
  denied the SAM key (returns '' + logs a security event), the scout gets it.
- **Gap #3 — the autonomy ladder L0–L4 + promotion rule is REAL** (`control-plane/autonomy.mjs`). Per-
  workflow level store; `canPromote()` = evals green AND human-edit-rate < threshold AND enough samples
  (pure, eval-pinned); `humanEditRate()` derives the §10 Layer-2 metric from the event log. HARD floor:
  send/submit/spend/pay/wire/deliver gate at EVERY level — the ladder can never auto-fire money or an
  out-the-door action. Wired into the CoS router as a SAFE override (can only relax a promoted recoverable
  workflow or tighten to Manual; levels never auto-raise). `/autonomy` + `/autonomy/level` + CLI report.
- **Gap #4 — Research & Risk desk built** (`pods/research-risk/desk.mjs`, Dana). MONITOR + JOURNAL only,
  ZERO execution: `assertMonitorOnly()` refuses every trade/buy/sell/order/wire verb in code; market data
  treated as untrusted (directive #4). Wired into the router on a reversible "monitor" intent;
  `/api/research/{watch,journal}`.
- **Gap #5 — Langfuse visual-tracing shim** (`control-plane/tracing.mjs`) wired into `store.appendEvent`;
  no-op unless `LANGFUSE_*` set (the JSONL log stays source of truth). `docs/langfuse.md` + a commented
  compose service make turning it on a 3-env-var change. Container deploy = operator's call (new infra).
- **Gap #1 — pod workers** were already substantially wired (router spawns gov/fiverr/saas/finance); the
  R&R desk (above) was the one genuinely-missing worker.
- **★ THE CAPSTONE — the Gov Submission Wizard** (`companion/public/submit-wizard.js`): a calm, one-screen-
  at-a-time walkthrough that takes ONE opportunity all the way to a submitted proposal, simple enough for
  a non-expert. 6 steps: fit verdict → Jarvis writes it → read/change in plain words → compliance "safety
  check" (fix-it loop) → exactly where it goes (email w/ copy buttons, or SAM.gov w/ numbered steps +
  copy/download) → record proof → 🎉 done. The irreversible submit stays with the human (§2 + "Vinicio
  signs & submits"); nothing auto-sends. Backend: `GET /api/gov/wizard` (one-shot state + plain fit),
  `POST /api/gov/submit/record` (saves proof, closes the open submit gate WITHOUT firing any executor,
  advances the board); `pipeline.mjs` threads `submissions` so recorded proof forces the Submitted column.
  Launches from the cockpit board cards + the Home "your next move" banner + the GovCon OS drawer.
  **Verified LIVE in-browser on the iPhone viewport** against real NAS data: opened a real "Janitorial and
  Carpet Cleaning Services" opp → fit verdict → loaded the real 6KB proposal, formatted; no horizontal
  scroll, 52px tap targets, zero console errors. Plain-English operator guide:
  [`docs/how-to-submit-a-gov-contract.md`](how-to-submit-a-gov-contract.md).
- ⏭ **Open / next:** (a) operator does a real end-to-end submit through the wizard on a live opportunity;
  (b) deploy Langfuse when ready (3 env vars); (c) consider promoting `gov.draft` once the human-edit-rate
  on real proposals proves low; (d) Hermes + its full capabilities (parked by the operator for next time).

### 🆕 2026-06-29 (newest) — FREE compute layer: the model router ("Jarvis never goes dark")
Directly fixes the pain "when I hit the Claude limit I'm not productive" + the absorb gotcha below (Pro ≠ API).
- **`pods/model-router.mjs` (NEW):** every LLM call now routes through one chokepoint that falls down a
  chain **local Ollama → OpenRouter (free) → Claude**. On any Claude error (429/401/no-credit/network) it
  auto-falls to a free brain; when a free model is unsure it can escalate up. Pure `pickChain()` is
  eval-pinned (`evals/router.eval.mjs`, 10 cases). **Privacy flag forces LOCAL-ONLY** (#ana/finance never
  leave the PC). Manual override via `LLM_PREFER` or the UI chip (`control-plane/brain-mode.json`).
- **`pods/lib.mjs` `claude()` now delegates to the router** — all pods inherit fallback, zero call-site
  changes; return shape unchanged (+`provider`/`model`).
- **Companion front door routed too** (`companion/server.js`): triage / brain-dump / agent helpers + the
  main chat loop fall back to a free brain when Claude is down (tool-less plain answer, tells you so). New
  `GET/POST /api/brain` + a top-bar **brain chip** (`companion/public/brain.js`: Auto/Local/Claude/OpenRouter).
- **Config** in `.env.example` (Free compute layer block): `OLLAMA_URL`, `OLLAMA_AUTOSTART=1`, `LOCAL_MODEL`
  (qwen3.6), `LOCAL_MODEL_FAST` (gemma4), `OPENROUTER_API_KEY`, `OPENROUTER_MODEL_FREE`, `LLM_PREFER`. Ollama
  auto-starts via `companion/start-jarvis.cmd` + `ensureOllama()`.
- **Verified live:** router answers via Ollama (glm-ocr "IT WORKS"); brain=Local + big model OOM → auto
  fell back to Claude (`attempts:["local:local 500","claude:ok"]`); privacy stays local; 170/170 evals green.
- ⚠️ **Local 8B/36B (gemma4/qwen3.6) hit a memory OOM at test time** (host-buffer alloc) — they ran before,
  so it's transient RAM/VRAM pressure; free other GPU apps. Tiny glm-ocr loads fine. Fallback covers it.
- ✅ **Phase 2 — OpenClaw LIVE (free local hands).** Was installed but its gateway was dead (missing
  service unit). Fixed: `doctor --fix`, command-owner set to the operator's Telegram id (only he approves
  dangerous actions), gateway token generated, **gateway service reinstalled + running** (`runtime.status:
  running`). Runs on free local **gemma4** (Ollama) — zero Claude tokens. Setup doc: `docs/openclaw.md`.
  ⏳ Operator's one step: DM the Telegram bot → `openclaw pairing approve telegram <code>`; free RAM so
  gemma4 loads. Lane: OpenClaw = free dev/ops hands; irreversibles (send/spend) gate to the owner.
- ✅ **Phase 4 — GovCon OS preview (parallel, non-destructive).** New surface at **`/govcon`**
  (`companion/public/govcon.{html,css,js}`), reachable from **More → GovCon OS (preview)**; the normal
  cockpit is untouched (delete the 3 files to remove). "Palantir-for-GovCon" look (Midnight Navy / Royal
  Blue / Emerald / Inter, dark, calm). Reads **live** data only — `/api/gov-board`, `/api/cockpit`,
  `/api/business?id=finance`: CEO briefing + health ring, KPI cards, pipeline funnel, whose-move Kanban,
  Opportunity Genome + transparent win-estimate. **Verified in-browser** (54 tracked, real board/genome,
  no console errors). Server route: one line in `companion/server.js` maps `/govcon`→`govcon.html`.
- ✅ **Phase 3 — proactive vault idea-miner.** `pods/vault/idea-miner.mjs` scans the vault (To Absorb +
  recent notes + Goals) on the **FREE LOCAL model with privacy=true** (vault never leaves the PC), and
  proposes a ranked, deduped **"Ideas to approve"** list → writes `05 - Knowledge/💡 Ideas to Approve.md`
  + `pods/vault/ideas.json` (gitignored runtime). Companion: `GET /api/ideas`, `POST /api/ideas/{run,
  approve,dismiss}`; **Approve → a vault task** (reversible; nothing irreversible auto-runs), **Dismiss →
  never nags again** (dedupe cache). New page **`/ideas`** + **More → "Ideas to approve"** + a "Mine now"
  button. Pure logic eval-pinned (`evals/idea-miner.eval.mjs`, 6 cases). **Verified:** pipeline runs
  (gather→local→parse→dedupe→write); inbox + approve→task + dismiss proven on a temp vault; `/ideas`
  renders, no console errors. ⚠️ Quality ideas need gemma4/qwen3.6 **loaded** (free the RAM — they OOM'd
  at test time; tiny glm-ocr runs but is too weak to synthesize). Scheduling = "Mine now" / CLI
  (`node pods/vault/idea-miner.mjs`) for now.
- ✅ **Phase 5 — LLM council** (karpathy's pattern, FOLDED INTO Jarvis instead of cloning the external
  app — committable, no uv/extra servers). `pods/council.mjs`: a panel of brains (local + OpenRouter +
  Claude) answer a hard question via the model-router (free-first; unavailable seats skipped), answers
  are anonymized A/B/C, and a chairman (strongest available) synthesizes Recommendation / Why /
  Disagreements / Confidence — judging on merit, not averaging. CLI (`node pods/council.mjs "..."`) +
  `POST /api/council`. Pure logic eval-pinned (`evals/council.eval.mjs`, 6). **Verified live:** with a
  weak local model + a 429'd OpenRouter, the Opus chairman explicitly DISCARDED the incoherent local
  answer and delivered a strong teamed-bid recommendation. (Council consults cloud brains by design —
  not for #ana/finance secrets.)
- ✅ **Rodgate website → 3D** (`site/index.html`, single self-contained file; deploys to
  rodgate-llc.netlify.app). Tasteful pro 3D: a slow wireframe-globe hero (Three.js via CDN, progressive
  enhancement) with glowing PA/NJ/FL service-area points + starfield; card tilt-on-hover, scroll-reveal,
  Inter, richer shadows. Respects reduced-motion, pauses when hidden, and FALLS BACK to the polished
  gradient hero if CDN/WebGL fail. All capability data preserved (UEI/CAGE/NAICS/PSC/contact). Verified
  loads with no console errors + globe initializes. NOT deployed — operator reviews, then deploy.

- ✅ **GovCon OS — built out to the ChatGPT vision** (`/govcon`, `companion/public/govcon.*`):
  **full-screen 3-column** layout (left: briefing/coach/mission/team/bid-simulator · mid: pipeline+board ·
  right: map/genome/journal) + full-width **relationship graph**. Features: CEO briefing + health ring,
  Mission Today, agent team, KPI strip, pipeline funnel, whose-move board, **living US map**, Opportunity
  Genome + win-estimate, **Simulation Mode** (red-team, `/api/gov/simulate`), **$ figures** (operator
  estimates → Pipeline $/Est. revenue, `/api/gov-board/estimate`), **bid simulator** (margin sliders),
  **AI Coach** (board-derived nudges), **Decision journal** (`/api/gov/journal` from the event store),
  **relationship graph** (RODGATE→agencies→opps), and **⌘K command palette**. All read live data, no
  fabrication. Still data-blocked: **agency-spending heatmap** (needs a USASpending/FPDS feed).
- ✅ **App-wide light/"white" theme** (`[data-theme=light]` in style.css + Settings swatch + applyTheme
  allow-list); GovCon shares the same `jarvis-theme` (its ☾/☀ toggle drives the whole app).

### ✅ Everything above committed + pushed (main + feat). The free-compute build, 5 phases, the 3D site,
### and the full GovCon OS (3-column, themed) are all live. Next ideas: agency-spending heatmap (needs a
### USASpending data feed); win-rate trend once enough won/lost history accrues.
- ⚠️ **Security to-dos (operator):** rotate the OpenRouter key pasted in chat; vault the plaintext Telegram
  bot token in `openclaw.json` (`openclaw secrets configure`).

### 🆕 2026-06-26 (newest) — absorb pipeline + calendar views + CRM + agent SOP files
- **Absorb pipeline** (`scripts/absorb.mjs`): YouTube → skimmable Obsidian note (key-points summary on top,
  why-it-matters, tags, related links, full polished transcript at bottom). Transcript via **yt-dlp** auto-
  captions (YouTube blocks the simple fetch; `pip install yt-dlp` required). Summary via Claude Haiku
  (~$0.008/video). `--keep` batch mode absorbs only the valuable buckets w/ a hard `--budget` $ stop.
  Notes → `05 - Knowledge/Absorbed/`. **Gotcha learned: Claude Pro ≠ API** — the autonomous engine needs
  API credit; only in-session Claude Code work uses the subscription. Going-forward = an **unlisted YouTube
  playlist** (yt-dlp reads it w/o auth) on a local-scheduled Claude-Code run (subscription, no API cost).
- **Calendar day/week/month** (`companion/public/calendar.js`, `google.calendarRange`, `/api/calendar`):
  real navigable grid in the Today tab (replaces the flat 7-day list); add/delete events.
- **CRM in the hub** (`projects.mjs` parseCrm/readCrm/addCrmRow, `/api/business/crm`): gov subs + RE tenants
  show as a table w/ an add-contact form, written to `Contacts (CRM).md`. Gov detail now has activity + CRM
  + an "Open the Gov Pipeline board →" button.
- **Agent SOP/identity files** (`scripts/scaffold-agents.mjs`): each business folder got `_Operating.md`
  (mission/vision/how-we-operate/how-the-operator-thinks) + per-agent `agents/<Name>.md` seeded from the org
  roster (pods/org.mjs), with ✍️ spots for the operator's SOPs + parameters. So any new Claude session on a
  project reads the doctrine + agent SOPs + Log + CRM and operates consistently.
- ⏭ Open: fill in the agent SOP `✍️` sections (operator); wire the playlist + the scheduled absorb run once
  there's a playlist; per-pod agents writing outputs into their `agents/` folders.

### 🆕 2026-06-26 (latest) — per-business vault folders + activity log + Takeout at scale
- **Watch-later at scale:** `scripts/youtube-triage.mjs` now reads Google Takeout playlist CSVs (IDs only)
  and resolves titles via YouTube oEmbed (cached `scripts/.yt-titles.json`). Full backlog = **1,078 videos**
  → ~593 bucketed + 274 skipped + 485 long-tail (collapsed). Note → `05 - Knowledge/📺 To Absorb.md`.
- **Per-business vault folders + activity log (the "report"):** `control-plane/projects.mjs` gives each
  business a folder under `04 - Projects/<name>/` with `Log.md` (done/to-do/idea/blocker — native Markdown),
  `agents/` (where each agent drops files), and a seeded `Contacts (CRM).md` for gov (subs) + real estate
  (tenants). The log is read/written by Jarvis AND lives in Obsidian — **one source, both places.** +5 evals.
  Server: `/api/projects/scaffold` (creates all folders, idempotent), `/api/business/log` (append),
  activity in `/api/business?id=`. Hub detail now shows the activity feed + a "log it" box (Done/To-do/Idea/
  Blocker chips). Registry (`pods/businesses.mjs`) gained `folder` + `crm` fields.
- ⏭ **Open (sequenced):** (a) **calendar week/month/day views** in Today (currently a 7-day list — operator
  wants a real grid); (b) **interactive CRM UI** in the hub (the files are seeded; surface + edit in-app);
  (c) **wire each pod agent to write its outputs into `04 - Projects/<biz>/agents/`** (scaffold exists).

### 🆕 2026-06-26 (later) — Businesses hub + UX cohesion + calendar live + vault-reorg fixes
- **Calendar is editable + LIVE** (re-auth done): scope bumped to `calendar.events`; add/delete events from
  the Today tab, verified create→delete. `scripts/google-auth.mjs` redirect port moved to 8723 (53682 was
  in a Windows reserved range) + `GOOGLE_AUTH_PORT` override.
- **UX cohesion (the "maze" fix):** the bottom nav now stays visible ON TOP of every overlay (overlays stop
  54px above it; `closeAllOverlays()` in `nav.js`), so a tab is always an exit; Escape closes any overlay.
  Dead **Dashboard** item removed (its #dash lived in the hidden ghost container). Ops cards de-boxed.
- **Businesses hub (the new Ops default):** `pods/businesses.mjs` is a REGISTRY of all 8 businesses
  (Gov · Fiverr · Web Studio · Real estate · Finance · Music · ZeroTick(SaaS) · Lifeline). Each summarizes
  to status + your-next-move + whose-move from live data (gov board, RE portfolio, web-studio/orders/music
  JSON, Stripe). Hub UI (`businesses.js` + `bizView` overlay) lists them; tap → Gov opens its dedicated
  board, others render a generic board reusing the gov-card classes, unwired ones (ZeroTick/Lifeline) show
  a "give Jarvis the files" setup path. **Add a business = one entry in `pods/businesses.mjs`.** Old Ops
  reachable via "old Ops ↗" in the hub header. Routes `/api/businesses` + `/api/business?id=`. +7 evals.
- **Vault reorg-proofing:** vault moved to 01 - To-Do / 04 - Projects / 05 - Knowledge / 09 - Archive.
  `tasks.mjs` now finds ⚡ Quick Capture by basename anywhere (+ skips 09 - Archive); `youtube-triage`
  writes to 05 - Knowledge. (Stray earlier 📺 To Absorb note still in old 07 - Knowledge — regenerate to move.)
- ⏭ Open: the mockup-driven full business boards are generic for now (real data where it exists; most
  businesses are early-stage/empty). Wire each pod's real workflow as they grow.


### 🆕 2026-06-26 — shipped: the COCKPIT + the GOV PIPELINE BOARD (operator clarity pass)
The operator's #1 need was clarity — "I don't know what I need to be doing / how to run my business."
Built the calm cockpit **inside Jarvis** (not a separate page) + one plain gov board. Read
[`docs/operator-guide.md`](operator-guide.md) for the operator-facing "how to run it".
- **Vault task engine** (`control-plane/tasks.mjs`, +17 evals): reads/adds/completes the Obsidian
  "Second Brain" Markdown checkboxes (Tasks-plugin format). Excludes holding-pen files + a section-aware
  "curated active" set so "today" stays calm (was flooding with 5k stale tasks). `VAULT_DIR` env.
- **Cockpit folded into the Companion** (themed via shared CSS vars — follows `data-theme`): a **Today**
  tab (tasks + Google week + capture) and on **Home** the 🎯 one thing + a rolling approvals ticker +
  today's tasks. Routes `/api/cockpit` + `/api/cockpit/{task/add,task/complete,capture}`. The old
  standalone `/cockpit.html` was removed.
- **Gov Pipeline board** (`pods/gov/pipeline.mjs`, +11 evals; `/api/gov-board` + `/disposition`): one
  board (Found→Reviewing→Responding→Submitted→Won/Lost) derived from the LIVE truth (scout scores +
  drafted proposals + open gates + awards + manual dispositions). Every card shows **whose move is next
  (👤 You vs 🤖 Jarvis)** + fit 1–5; flags out-of-lane set-asides (8(a)/SDVOSB/WOSB/HUBZone). UI = themed
  overlay (More → Gov Pipeline / Home "open board →") with the straight-line model + a YOUR NEXT MOVE
  banner. `govBoardData()` is the single source for "your next gov move", shared with the cockpit one-thing
  so Home + board never disagree.
- **Game UIs demoted**: HQ / Floor / Command / Dashboard moved under a "Behind the scenes — optional"
  divider in More. Nothing deleted. CLAUDE.md architecture updated to "cockpit is the front door".
- **Watch-later backlog**: `scripts/youtube-triage.mjs` → `07 - Knowledge/📺 To Absorb.md` in the vault
  (199 videos → 113 keep / 86 skip, grouped + starred). The full summarizer pod is **deferred** (one fire
  at a time). Operator getting the full ~2000-video export.
- ⏭ **Still open:** (a) **calendar EDITABLE** (increment 3) — needs the Google scope bumped to
  `calendar.events` + the operator to re-run `node scripts/google-auth.mjs` once (currently read-only by
  design). (b) Fold the Notion Company Brain Opportunities into the board if manual ones aren't in the
  scout stream. (c) the watch-later pod when ready.

### 🆕 2026-06-19 — shipped: Fiverr Studio is LIVE (real clickable thumbnails)

### 🆕 2026-06-19 — shipped: Fiverr Studio is LIVE (real clickable thumbnails)
- **Hybrid thumbnail engine** (`scripts/make-thumbnail.mjs`): Claude designs a spec → FLUX paints the
  photoreal SUBJECT (free, Cloudflare) → CODE composites the bold legible headline + accent badge → one
  self-contained 1280×720 SVG (embedded raster + system-font text). This is how real designers work, and it
  fixes the old gap (Claude-SVG drew crude silhouettes + truncated; FLUX mangles text). Never a silhouette,
  never truncated. The deterministic composition lives in code (doctrine #1).
- **Live Studio surface** in the ONE app: Companion → **Operations → 🎨 Fiverr Studio → 🎨 Studio**. Type a
  client scenario → it renders in a faithful **YouTube in-feed card** (so you see it as a viewer would) →
  **Download PNG (1280×720)** via a client-side canvas (untainted because the subject is embedded as a data
  URI). New route `POST /api/studio/thumbnail` in `companion/server.js`; UI in `companion/public/ops.js`
  (+ `style.css`). Verified end-to-end in-browser across finance/fitness/tutorial/gaming.
- **Worker wired**: `pods/fiverr/worker.mjs` routes `thumbnail` briefs through the hybrid engine (vault-scoped
  to STUDIO-01), still behind the HITL deliver gate. Voice/chat works: *"have Remy make a thumbnail for X."*
- **Full Studio — 4 deliverable types.** Shared `scripts/studio-lib.mjs` + `make-thumbnail.mjs` (now
  **MrBeast-style**: extreme expression, hyper-saturated color grade, huge minimal text), `make-cover.mjs`
  (hybrid book/eBook cover, KDP 1600×2400, genre-aware type), `make-logo.mjs` (clean **vector** monogram +
  wordmark — no FLUX, always crisp), `edit-product.mjs` (fal.ai BiRefNet bg-removal → clean studio backdrop +
  shadow). Studio UI has a type switcher + per-type previews + natural-size PNG export. Worker routes
  cover/logo too. Routes `/api/studio/{thumbnail,cover,logo}` + `/api/studio/product`.
- **Portfolio = master gallery `fiverr/portfolio/index.html`** (real PNGs + Download buttons that work from a
  plain file open), niche spread (real estate / business / trading / crypto / finance / fitness / …):
  8 thumbnails, 5 covers, 6 logos, 1 product. Folders: `thumbnails/ covers/ logos/ products/`.
- **Order watcher — 24/7 (NO Fiverr API exists).** `pods/fiverr/inbox.mjs`: reads the RodGate agent mailbox
  (the email Fiverr notifies) via IMAP, detects new orders, extracts the buyer brief, auto-drafts with the
  Studio, and alerts (HQ + Telegram). NEVER delivers — delivery stays HITL (gig rule). Idempotent ledger
  `fiverr-assets/.orders.json`. Pure parsers eval-pinned (`evals/fiverr-orders.eval.mjs`, 113/113 green).
  Wired into the CoS router (poll/"check orders" → watcher, not the literal sentence; "order" no longer
  gates the poll) + the conservative scheduler (`fiverr-order-poll`, every 4h, working hours).
  → **SETUP THE OPERATOR STILL OWES:** point Fiverr's notification email at **RodGateGroup@gmail.com**
    (Fiverr → Settings → change account/notification email, or forward Fiverr mail there) — Fiverr currently
    emails his personal inbox, so the watcher sees 0 until that's switched. Then orders flow in automatically.
- ⏭ Next for Fiverr: switch the Fiverr notification email; publish the gigs; land the first paid order.

### 🆕 2026-06-16 — shipped
- **Email-finder enrichment** (`pods/gov/enrich.mjs`): discovery gave subs a website but no email; this
  scrapes the site + its contact/about pages (mailto + text), picks the best on-domain role inbox, and writes
  `contact_email` back to the CRM. Free + read-only; optional Hunter.io fallback if `HUNTER_API_KEY` is set.
  Wired into `discover.mjs` (auto-enriches new rows) + the CoS router ("find emails for the subs" / "enrich").
  Pure extract/pick logic is eval-pinned (`evals/enrich.eval.mjs`).
- **Gov email sending WIRED** (`pods/gov/sender.mjs` + control-plane executor): approvals used to be logged
  but never executed. Now approving a gov **send/email** approval (HQ/Slack/companion) fires the sender on the
  referenced draft. The human approval IS the gate (doctrine §9 rule 2); auto-send is **opt-in via
  `GOV_AUTO_SEND=1`** — with it off the executor dry-runs + posts a Slack preview so you see what would go out.
  `scripts/gov-send.mjs` is now a thin CLI over the same module. Connector writes a sendable `To:/Subject:`
  header when the top sub has an (enriched) email, so the outreach loop actually closes. A **proposal `submit`
  never auto-emails** (it goes out a portal). Pure parser + executor gate eval-pinned (`evals/gov-send.eval.mjs`).
- **Stripe invoicing / payment links WIRED** (`pods/finance/invoice.mjs`, Victor / LEDGER-01): "invoice a
  client for $X" → Victor validates the amount **in code** (integer cents, deterministic idempotency key),
  drafts it, and raises ONE money gate. On approval the control-plane executor creates a Stripe **payment
  link** (REST, no npm dep) and writes a ready-to-send email carrying the link. **Test mode first** — the key
  is vault-scoped to LEDGER-01 only, a `sk_live_` key is refused unless `STRIPE_ALLOW_LIVE=1`, and auto-create
  is opt-in via `FINANCE_AUTO_INVOICE=1` (off = dry-run/preview). Pure money core + gate eval-pinned
  (`evals/finance.eval.mjs`) + a vault ACL eval. **Evals: 95/95 green.**
  → **To go live (test mode):** add `STRIPE_API_KEY=sk_test_…` to `.env` (Stripe Dashboard → Developers → API
    keys, in Test mode), set `FINANCE_AUTO_INVOICE=1`, then
    `node pods/finance/invoice.mjs 500 client@email.com "Office cleaning"` → approve in HQ/companion → a real
    **test-mode** payment link is created. Flip to `sk_live_` + `STRIPE_ALLOW_LIVE=1` when ready for real money.

### 🆕 2026-06-14 (PM session) — shipped
- **Rodgate site LIVE → https://rodgate-llc.netlify.app** (Netlify free; redeploy: `netlify deploy --dir=site --prod --site 2c860be1-48f8-497b-a1c1-46d1772d2973`).
- **Inbox cleanup executed** (reversible): Rodgate inbox → ~623 (archived 967 / trashed 420);
  Personal viniciorodd@ scanned all 35,818 → inbox ~13,322 (archived 5,832 / trashed 16,664).
  Deal-flow (biz-for-sale + RE listings) preserved; junk unsubscribe list = `reports/unsubscribe-personal-2026-06-14.md` (user actions it).
- **Jarvis Companion v2**: open files/apps/URLs on the PC (`open_path`), drag-drop docs to read,
  show maps/images/web (`show_visual`), live dashboard rail (income/spend/tokens/net + urgent/emails/tasks/pods),
  Deepgram-based wake (fixes Electron's missing browser speech API). See `project-jarvis-companion` memory.
- **Fiverr gig gallery**: `fiverr/portfolio/index.html` — 8 screenshot-ready samples across the gig types.
- ⏭ Pending: Porcupine always-on wake word; auto-sync `.dashboard.json`; respond to the 3 open SAM leads.

## ✅ DONE & LIVE
- **NAS stack 24/7:** n8n, Postgres, HQ (`192.168.6.121:8099`), Whisper (port 9100). HQ heartbeat active.
- **Gov pod LIVE:** SAM scout (daily 6:10am, profile-aware ranking) + EOD report + approval-executor —
  activated & tested (Telegram digest + SAM-SCOUT on HQ floor both confirmed working).
- **Companion ("her"):** orb UI, Claude brain, file + organize tools (plan→approve→reversible quarantine),
  full NAS access, Notion read, HQ read, browser voice. **Loads the Operator Profile** (she knows him).
  Open: `node companion\server.js` → http://localhost:8095  (or companion\start-jarvis.cmd).
- **Operator Profile — FINALIZED & live** (`prompts/operator-profile.md`, gitignored): merged from 232
  notes/voice/journals + his confirmed facts. Key: gov #1, $10 spend gate, trading off 6mo, RE passive,
  $10k/mo net goal, "be hard on me," family-driven why.
- **Data ingested (full archive, searchable):** 65 Notability .note · 166 voice transcripts ·
  12 Day One journals (520-entry main) · **280/284 handwritten PDFs OCR'd** (4 large ones failed —
  retry with split: "Getting to $1M by 2027", "Main Street Millionaire", "ICT Mentorship", one 413).
- **Voice + comms LIVE (keys in .env, verified):** ElevenLabs (she speaks) · Deepgram (she hears) ·
  **Slack bridge** (DM her / approvals with buttons, Socket Mode). Launch both: `companion\start-jarvis.cmd`.
- **Operator Profile v3** built from 512 sources; live profile enriched (no-equity rule, gov margin).
  Private mental-health content kept OUT of the agent-injected profile by design.
- **Tooling:** ingest.mjs (always-scan, all types) · transcribe-audio · read-notability · build-operator-profile
  · sam-scout (profile-aware) · Fiverr gig pack · gov capability boilerplate + a drafted sources-sought response.

## 🔜 NEXT (in priority order)
1. ✅ **DONE 2026-06-14 — FIRST GOV PROPOSAL SENT.** West Point sources-sought **W911SD06102026**
   (Army MICC West Point, janitorial BPA) emailed to CO **Leslie Duron** via the new gated emailer
   `scripts/gov-send.mjs` (RodGateGroup@gmail.com, app-password SMTP; dry-run → approve → `--send`).
   Final text: `prompts/gov/boilerplate/READY-westpoint-W911SD06102026-sources-sought.md`.
   → NEXT gov action: respond to the other live sources-sought leads from the scout (VA Hampton,
     Navy Norfolk, Forest Service) the same way.
2. **Slack command center** (he chose this as the unifier): create workspace + bot token → wire pods + Jarvis
   + approval buttons; replaces Telegram.
3. **Gmail pods:** morning brief + email triage need a Gmail OAuth credential in n8n (fiddly — its own step).
4. **Jarvis always-on:** containerize Companion + schedule ingestion on the NAS (so she's 24/7 + auto-updated).
5. **HQ rebuild** for new rooms (`docker compose up -d --build hq`) + have pods ping HQ.
6. **Device→NAS auto-backup** (Notability WebDAV, Just Press Record, Day One, photos) so the data-lake self-fills.
7. **Recon Tweaks launch kit** — needs his goals/affiliates folder; pre-revenue → Gumroad listing + content.

## 🔧 Housekeeping / security (do soon)
- Rotate the Claude API key + Telegram bot token (both were pasted in chat).
- Change the temporary NAS password (`Jarvis2026deploy`).
- First encrypted offsite backup (volumes/hq, volumes/n8n, operator-profile.md).

## Decisions on the table
- **Notability 284 PDFs (320MB):** NOT bulk-OCR'd (cost vs marginal gain — profile already rich). OCR
  high-value ones on demand later if wanted.

## How to resume in a new chat
Open Claude Code **in `C:\Users\vinic\Desktop\jarvis`** and say:
> "Read docs/whats-next.md and the memory. We left off with the gov pod live and my Operator Profile done.
>  Let's [send the gov proposal / set up Slack / do the Gmail pods]."
