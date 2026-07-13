# Where we are & what's next (handoff — read this first in a new chat)

_Updated 2026-07-12. Committed + pushed (`main` and `feat/core-infrastructure-v2` kept identical). Resume from here._

### 🆕 2026-07-13 (latest) — SELF-IMPROVEMENT: failure/audit ledger + compliance self-heal (never fabricates)
Operator: "mark down all errors/failed audits so we know how to fix them" + "self-improve on Compliance:
FAIL — diagnose, fix, loop until passing." Evals **463 → 495 green**. 2 parallel Agent builds, verified.
- **Failure & Audit Ledger** (`pods/audit-log.mjs`): every failure (send-failed, compliance FAIL/RISK,
  facts-violation, executor-error, compliance-escalated) → a durable record with a concrete FIX HINT.
  `classifyFailure` (pure) maps control-plane events → failures; append-only `audit-log/failures.jsonl`
  (gitignored); vault note `00 - System/⚠️ Failure & Audit Log.md`; routes `GET /api/audit` +
  `POST /api/audit/resolve`. **LIVE on PC companion — first hit surfaced 10 real failures**: gov-send ×3
  ("no To:/Subject: header — draft had no enriched recipient email" — a SECOND send bug beyond the creds),
  compliance ×6, executor ×1.
- **Compliance self-heal** (`pods/gov/{compliance,remediate}.mjs` + worker wiring): `checkCompliance` now
  returns structured `gaps`; `improveUntilPass` diagnoses → honestly fixes (strip false certs via
  facts-check; LLM rewrite for scope/clause/formatting) → re-checks → loops to PASS, editing the STAGED
  draft only (reversible, behind the human gate). **ANTI-FABRICATION GUARANTEE (verified in code + 2
  adversarial evals):** `GAP_POLICY` pins set-aside-ineligible / missing-past-performance / passed-deadline
  as hard/not-fixable; `improveUntilPass` escalates a hard gap at line 118 BEFORE remediate is reached;
  facts safety net reverts any smuggled claim. It will NEVER invent past performance or eligibility to fake
  a pass — those escalate to the operator (no-bid / teaming / real past performance).
  ⏭ The worker self-heal activates wherever the gov worker runs — **on the NAS after the next redeploy**;
  `/api/audit` is live on the PC companion now.

### 🆕 2026-07-13 — approve-to-send ARMED on the NAS (redeploy done)
Redeploy verified: container `date` = **EDT** (4am-messages bug dead), `GOV_AUTO_SEND=1` +
`RODGATE_GMAIL_USER=rodgategroup@gmail.com` confirmed in the control-plane container. Fixed a real gap:
compose only injects listed vars, so `GOV_AUTO_SEND` had to be added to the control-plane + telegram-bridge
`environment:` blocks (committed) — `.env` alone wasn't enough. Approve-to-send is now fully live: tapping
✅ on a send gate really emails via Gmail SMTP. The "sub reach-out FAILED ×2" was the missing creds +
missing recipient-email enrichment (now both visible in the audit ledger).

### 🆕 2026-07-12 — BUSINESS-HOURS JARVIS: TZ fix · batched messages · Pursue buttons · APPROVE-TO-SEND
Operator QoL feedback, all shipped (evals **477 green**). ⚠ **Everything here activates on the NEXT NAS
redeploy** (bridge/scheduler/CP run there) + set `GOV_AUTO_SEND=1` in the **NAS .env** during it:
- **4-5 AM messages root-caused**: NAS containers run UTC → `at_hour: 8` fired at 4 AM ET. Fixed:
  `TZ=${TZ:-America/New_York}` on control-plane/scheduler/telegram-bridge + tzdata in the Dockerfile.
- **Business-hours decision nudges**: `/maintenance/approvals-nudge` + 2 schedule jobs (12pm + 4pm
  weekdays, max 2/day deduped via `approvals.nudged` events, silent when no gates wait).
- **Batched narration**: `rollupNarrations()` (pure, eval-pinned) — ONE Telegram per 90s cycle,
  grouped "Team update — pulled the SOW for 4 opportunities: A, B, C +1 more". Truth contract intact.
- **Per-opportunity Pursue/Pass buttons** replace "reply 1/2/3" — approve any or ALL. Taps → CP
  `/maintenance/pursue` (idempotent; also fixed pursueOpportunity to hydrate bare {noticeId} from the
  deal ledger — buttons would have failed without it).
- **APPROVE-TO-SEND GRANTED (operator, 2026-07-12)**: approval pushes inline the draft email (To/Subject
  + ~900 chars); tapping ✅ on a send gate REALLY SENDS (`GOV_AUTO_SEND=1`, set on PC .env; **NAS .env at
  redeploy**). "Approve = SENDS" wording only appears on genuine send gates with auto-send actually on.
  The gate remains the control — nothing sends without a human tap. Idea Vault entry marked done.
- **Docs index scoped to signal**: 106,695 → **18,827 real docs** (48.3 → 8.2 MB, 52ms parse). Excluded
  RECOVERY/5TB Recovery (80k), Media, Gaming, recycle bins; `#recycle/@eaDir/$RECYCLE.BIN` skipped in code;
  the old `Z:\Real Estate` root removed (Z: maps to BusinessVault — was double-indexed).

### 🆕 2026-07-12 (later) — the STANDING DEBRIEF RULE (wins too) + NAS shares indexed
- **"If we ask for the debrief, no loss is a real loss — everything is a win"** (operator). Marking an
  opportunity **won OR lost** on the board (`/api/gov-board/disposition`) now AUTOMATICALLY: records the
  outcome in the capture ledger (`gov-capture/outcomes.jsonl`) + drafts the FAR debrief request +
  writes it to `gov-drafts/debrief-<noticeId>.md` + returns it in the response. Wins use the
  **FAR 15.506 successful-offeror** debrief (learn WHY we won + open the performance relationship);
  losses use the existing 15.505/15.506 request. Nothing auto-sends — operator sends. Eval-pinned
  (463 green). Verified end-to-end with test dispositions (then cleaned up).
- **NAS docs indexed**: added `\\192.168.6.121\PersonalVault` + `\\192.168.6.121\BusinessVault` to
  `pods/tax/entities.json` docRoots (read-only walk — names+stat only, never opens files). Reindex run
  kicked off; recommendation to operator stands: docs LIVE on the NAS, Jarvis indexes them — only
  actively-edited notes belong in the vault.

### 🆕 2026-07-12 — the LEARNING MACHINE: Idea Vault · capture playbook · truthful narration · daily digest
Built from the operator's own vault research (GovCon Tier Ladder, Telegram Discrepancy Log, "don't
request a debrief", the forgotten business-credit idea). Evals **462 green** (was 432). 5-agent workflow.
- **💡 Idea Vault** (`pods/idea-vault.mjs`) — "no idea worth doing gets left behind, even if I go in a
  coma." Append-only ledger `ideas-vault/ideas.jsonl` (gitignored); statuses new/active/waiting/parked/
  done/dropped with resurface clocks (7/7/14/30d — parked resurfaces FOREVER until done/dropped);
  **SEEDED with 16 recovered ideas** (Rodgate business-credit journey #1, financing+SCORE, LinkedIn,
  debrief agent, Brother Crew sub, risk-engine bid scorer, bad-reviews product, Alexa, Hermes…). Renders
  `00 - System/💡 Idea Vault.md` in the Second Brain (LIVE, 16 ideas). Routes `/api/ideas-vault(/add|/touch)`;
  Home shows a **"💡 Revived idea" card** (Keep alive/Park/Done) when one goes stale — first card ~7 days
  after seeding by design. CLI: `node pods/idea-vault.mjs [list|due|seed|touch|add]`.
- **GovCon capture & learning desk** (`pods/gov/capture.mjs`) — the tier-ladder procedures as code:
  pure **bid/no-bid gate** (in-lane sources-sought → always RESPOND_SS; traps → NO_BID: certs we lack,
  >$250k, <3d w/o draft; BID threshold 60/100 — tune as outcomes accrue), **win/loss ledger**
  (`gov-capture/outcomes.jsonl`), **FAR 15.505/15.506 debrief-request drafter** (gracious, zero cert
  claims, NEVER auto-sent — operator sends), `lessonsSummary` (win rate, top loss reasons, debrief rate,
  price-gap avg), `relationshipsDue` cadence (CO 30d, small-biz-specialist 45d, prime 30d, sub 60d,
  mentor 90d). Routes `/api/gov/capture(/outcome|/debrief)`. ⏭ surface in the GovCon OS UI next.
- **✅ TRUTHFUL NARRATION — the Telegram false-completion RESOLVED** (vault log root-caused exactly as
  hypothesized): `connector.mjs` emits `sub.outreach.draft` when Hector merely WRITES the outreach file
  (gated, auto-send off), and the old narration regex turned that into "🤝 Reached out to a subcontractor".
  Fix: gates narrate "✏️ Drafted — waiting on YOUR approval (nothing sent)"; dry-runs "🧪 NOT sent
  (auto-send is off)"; **"Sent/Reached out" now REQUIRES SMTP evidence** (messageId/accepted/sent:true);
  `sender.mjs` emits status/dryRun/sentAt ground truth; telegram-bridge un-masks failed sends ("Approved —
  but the send FAILED"); same lie-class fixed in the Action Log (`pods/actions.mjs`: draft ≠ reached out).
  Eval-pinned incl. the exact historical Hector event (`evals/narrate-truth.eval.mjs`). Old ledger events
  narrate truthfully too (read-time fix). Update the vault discrepancy log → RESOLVED.
- **Daily gov growth digest** (`pods/gov/digest.mjs` + control-plane route + `schedule.json` job):
  weekday 8:00 ONE Telegram — top 3 quick wins + top 3 teaming primes, deduped via `gov.digest.sent`
  events. **Activates on the next NAS control-plane redeploy** (with the narration + dedup fixes).
- **✅ NAS gate cleanup DONE (operator approved "clear the dupes"):** passed 8/8 duplicate outreach gates
  (pass never executes anything). Queue: 24 → **16 real gates, zero dupes** — the two ALF Bradford submit
  gates are different noticeIds (reposted notice), both real. gateKey idempotency activates on NAS redeploy.
- **✅ SBA EIDL verified with real MySBA figures (recorded in `pods/tax/debts.json`):** principal STILL
  exactly $20,000.00 — all $2,140 paid so far went to interest (deferment accrual). $340.25 interest
  backlog remains; at $150/mo it clears in ~4 months, then principal drops ~$87.65/mo. ⏭ optional: an
  amortization view in the tax pod so Home shows real principal progress month over month.

### 🆕 2026-07-10 (newest) — ONE design system across every surface + GovCon OS integration
Follow-up to the design overhaul: the operator wanted the themes truly everywhere (not one look per
tab/OS/overlay) and the new gov modules folded into GovCon OS. Done via a 5-agent parallel Workflow
sweep over disjoint files (583k tokens, 0 errors):
- **Overlay theme-sweep** (`style.css` + `tax-review.css`): ~100 hardcoded colors in the overlays
  (ops/businesses/floor/command/activity/settings/personal/hq/dock/chat/studio/weather/tax) → theme vars;
  dropped Silkscreen/Space Grotesk/Georgia/Courier → `var(--font)`; unified radii. **Verified: command/ops/
  floor/activity now render white-on-True-White** (were dark-hardcoded).
- **GovCon OS rethemed + integrated** (`govcon.{css,html,js}`): was a standalone navy/royal-blue palette →
  now the Jarvis palette (Jet Black/True White, teal, Inter); its ☾ toggle writes the app-wide
  `jarvis-theme` (black/white) so it carries everywhere. **Integrated ⚡ Quick wins (middle col) + 🤝 Teaming
  radar (right col, gated intro drafting)** — verified live in both themes (Amentum $611M in the teaming card).
- **JS-injected styles** (16 files: submit-wizard/agents/hud/skills/wall/brain/health/catchup/strip/pause/
  ops/today) → `var(--x, fallback)`; per-pod avatar hues collapsed to the single accent.
- **Standalone pages** (ideas, dealroom) + **HQ game floor** (`hq/public/*`): Inter + black/white theme
  blocks + swatches. `theme-color` meta + manifest → `#000000`. HQ keeps Silkscreen for its deliberately
  game-styled branding (demoted "behind the scenes" surface).
- 432 evals green; all JS syntax-valid; zero console errors; both themes verified via computed styles.
- ⚠ **Notes:** used `color-mix()` for non-teal tints (needs Chromium 111+/Safari 16.2+ — fine for
  Electron/Chrome). `--shadow-lg` referenced in a few govcon rules but never defined (pre-existing, benign).
  Screenshot tool still flaky with the animated canvas — verified via computed styles, operator should eyeball.

### 🆕 2026-07-10 (newest) — system-wide design overhaul (font · themes · brain · Today)
Operator's ask: make it feel like Timepage/Things3/Fantastical/Notion, not a mess. Foundation reset:
- **ONE typeface (Inter) system-wide** — dropped the 3-font mix (Space Grotesk + Silkscreen pixel + Georgia
  serif). Body, headings, the `.px` wordmark, and the standalone pages (focus/quickwins/teaming) all use
  `var(--font)`. Fonts now consistent A-Z.
- **Two flagship themes** on a complete variable contract, in `style.css`: **Jet Black** (true #000, default)
  and **True White** (pure #fff, dark ink, AA-contrast teal). Legacy teal/arc/exec kept in the picker; old
  translucent `exec` default auto-migrates to Jet Black (index.html init + `applyTheme` allow-list + `.html`
  page heads). Verified readable in both via computed styles.
- **3D brain confined to the Jarvis tab**: `neural.js` no longer bleeds through every screen. Non-talk views
  paint a solid `--ink` bg; `#jTalkView` is transparent so the neural map glows through ONLY there; the draw
  loop idle-polls (2fps) off-tab. (`body:has(#jTalkView.active) #neuralMap{opacity:1}`.)
- **Premium Today tab** (`today.css` append): live date header (weekday title + full date sub via a small
  script), Things-3 circle checkboxes, roomy rows, softer rounded calendar (filled-pill "today", chip
  events, accent toggles), pill inputs. Fixed a hardcoded `color-scheme:dark` picker.
- ⚠ **Verification caveat:** the preview screenshot tool timed out all session (flaky with the animated
  canvas), so visual polish was verified via **computed styles**, not screenshots — the operator should eyeball
  it. **Known remaining work:** the deep legacy overlays (`ops`/`floor`/`command`/`personal`/`hq` iframe, and
  the `/govcon` page which has its own CSS) may still have hardcoded colors that don't fully adapt to True
  White — a follow-up "theme-sweep the overlays" pass is needed for true A-Z coverage. Main surfaces (Home,
  Today, Jarvis, More, focus/quickwins/teaming) are done.

### 🆕 2026-07-10 (newest) — GovCon growth engine (PDF · capability · quick-wins · teaming) + cockpit fixes
Eval harness **432 green**. Companion is PC-local (restart to load `server.js` route changes; done).
- **PDF + capability statement** (`pods/gov/pdf.mjs` + `company.mjs`): the gov wants a letterheaded PDF,
  not text. Dependency-free — render print-perfect HTML with a "Download PDF" button (browser Save-as-PDF).
  `mdToHtml` (pure, eval-pinned) letterheads any gov-draft; `capabilityDoc()` = the 1-page capability
  statement from canonical facts (UEI Z1SWBFEK7EM4 / CAGE 18S75, self-certified SDB — never a cert we lack).
  Routes `/api/gov/print?kind=proposal&noticeId=` + `/capability`. Submit wizard step 5 now offers
  **"Save as PDF"** on both email + portal paths. More → "Capability statement (PDF)".
- **Wide-net "Quick Wins" scout** (`pods/gov/quickwins.mjs`): the primary scout is locked to 3 janitorial
  NAICS; this casts a wider net (15 adjacent service NAICS + keyword sweep for one-off jobs — cleaning,
  grounds, snow, hauling, pressure-wash, chimney, dumpster), screens out traps (base-ops/O&M/construction/
  IT/clearance/certs-we-lack), scores by fit, flags sources-sought + one-time. `/api/gov/quickwins?days=N`,
  page `/quickwins`, More → "Quick wins". **Live: 146 in 7d.** `classifyQuickWin` pure eval-pinned.
- **Teaming radar** (`pods/gov/teaming.mjs`): Rodgate as the SUB reaching UP to primes. Scans USASpending.gov
  (free, no key) for recent >$750k awards in our lane (the winner must carry a small-biz subcontracting
  plan), ranks primes by size + PA/NJ/FL proximity, **drafts** a personalized intro (gated — you send it).
  `/api/gov/teaming` + `/api/gov/teaming/intro`, page `/teaming`, More → "Teaming radar". **Live: 70 primes
  (URS $932M NJ, Amentum $611M FL, General Dynamics $335M PA).** classify + introLetter pure eval-pinned.
- **Cockpit fixes:** linked the **Focus dashboard** (`/focus`) into More — it had NO menu entry, so it was
  unreachable. Cleared **`companion/.dashboard.json`** — it held stale mid-June demo seeds ("Approve personal
  inbox cleanup", "Authorize hosting…") with no id/executor, so approving them faded the card but fired
  nothing (both already done). Approvals that matter live in the control-plane (~26 pending gov gates —
  note the gate-dedup isn't holding on the NAS; same outreach queued ~8×, a cleanup for next session).
- ⏭ **Next / open:** (a) **gov gate-dedup on the NAS** — dedupe the ~26 stale/duplicate pending approvals +
  confirm `gateKey` idempotency is deployed. (b) wire quick-wins + teaming into the **scheduler** (daily
  batch → Telegram digest, gated). (c) outreach-at-scale (the gated batch drafting). (d) `GOV_AUTO_SEND=1`.

### 🆕 2026-07-10 (newest) — Focus/time tracker (Forest replacement) + the Florida-ops layer
The operator outgrew the **Forest** app; he wants his time as data — charts/bars per day/week/month/
quarter/year. Also this session hardened the "run the business from Florida for a month" layer.
- **Focus tracker** (`pods/focus.mjs`, eval-pinned `evals/focus.eval.mjs`, 408/408 green):
  - **Voice/typed logging** — "focused 90 min on gov proposals" parses in code (amount/tag never by LLM),
    logs to `focus/<year>.jsonl`, speaks back the running daily total. Wired into `/api/chat` (after the
    expense + action-log captures) and `POST /api/focus/log`.
  - **Forest import** — `importForest(csv)`, idempotent (dedup by start-time). **Imported the operator's full
    export: 6,036 sessions · 3,792.8h · 1,966 active days · 97% completed · 2016→2026.** Top tags: 📚reading
    1,364h · work 1,156h · trading 294h · real estate 240h. Best weekday: Tue. Peak year 2017 (794h),
    2025 rebound (443h).
  - **Dashboard** `/focus` (`companion/public/focus.html`): period toggle + scrollable bar chart + 6 stat
    tiles + top-tags breakdown + inline log box. Theme-aware, mobile-first. **Verified live in-browser**
    (Month + Year views, API serving the full decade, no console errors).
  - **API**: `GET /api/focus?grouping=day|week|month|quarter|year`, `POST /api/focus/log`.
  - ✅ Live now: the **companion runs on the PC** (`companion/server.js` :8095, reached from the phone over
    Tailscale) — NOT a NAS service — so restarting the local companion (done 2026-07-10) made it live; no NAS
    redeploy needed. Import ran local-only against `Y:\Forest Plants...csv`.
  - **UX overhaul same day** (`fix(cockpit)`): killed the PC perf hang (the heavy always-on neural backdrop
    was pegging tight PCs → fewer particles + frame-throttle + DPR cap); **decluttered Home** (it now leads
    with THE ONE THING; "While you were away" + team strip demoted via flex `order`); **real desktop layout**
    (≥1024px Home is a centered two-column cockpit, not a phone-width column); **Command wall now shows a
    JARVIS arc-reactor core** (rotating reactor housing + JARVIS wordmark) instead of the abstract sphere/burst.
    Confirmed: voice-first home is already the default landing screen (`nav.js`). All verified in-browser.
- **Florida-ops (earlier this session, all LIVE):** the **Telegram bridge as a 24/7 NAS service**
  (`companion/telegram-bridge.mjs` — approve-from-phone inline buttons + agent-signed activity feed;
  `jarvis-telegram-bridge-1` confirmed Up, operator received "team is online"). **Slack #floor war-room**
  (`companion/slack-bridge.mjs`). **Voice expense tracker** (`pods/expenses.mjs`, personal+business books).
  **Action Log / momentum** (`pods/actions.mjs` → vault `00 - System/🏆 Action Log.md`, 20-min auto-sync).
  **Gate dedup** made idempotent. **Kokoro TTS auto-start + VAD push-to-talk**. **Voice-first home**
  (`companion/public/talkhome.js`). All committed + pushed; NAS deploy confirmed.
- ✅ **Florida remote access (set up 2026-07-10):** PC already on the tailnet as **`shisui`** → cockpit
  reachable from anywhere at **`http://shisui:8095`** (verified over Tailscale; companion binds all
  interfaces). PC never sleeps on AC. **Subnet-router turned out unnecessary** (every device runs Tailscale
  directly). Reboot/crash resilience: **`companion/jarvis-forever.cmd`** (companion-only, self-healing)
  auto-starts at logon via a Startup-folder shortcut. NAS keeps running control-plane/scheduler/Telegram 24/7.
- ⏭ **Open queue (parked):** (b) **Board write-back** (append-only,
  concept approved). (c) **Outreach-at-scale drafting** (primes/subs, daily batch, council pre-review,
  GATED — operator chose "draft at scale, I approve from my phone", never auto-send). (d) **`GOV_AUTO_SEND=1`**
  operator's config call to make Approve actually send. (e) USACE PIEE submit (operator, due 7/13).
  (f) [[hermes-full-capability]] + [[jarvis-on-alexa]] parked. (g) Fiverr/private expansion HELD until
  USACE submitted + first Fiverr sale.

### 🆕 2026-07-07 (newest) — Tax & Wealth pod Phase 3B shipped: docs indexer
Built per `docs/superpowers/specs/2026-07-07-tax-pod-phase3b-docs-index-design.md`, branch
`feat/tax-phase3b-docs-index`, 4 TDD tasks:
- **`pods/tax/docs-index.mjs`** — `classifyDoc` (kind by filename: receipt/hud/contract/insurance/appraisal/
  permit/statement/closing; property+entity by folder path), `buildIndex`, `suggestDocs` (rank a doc for a
  ledger entry by property/entity + payee token + amount-in-filename + mtime proximity). **Filename+folder
  only — READ-ONLY, no OCR: only reads names + stat, never opens/moves/deletes/uploads a file.**
- **Index**: `POST /api/tax/docs/reindex` walks `docRoots` (entities.json: `Z:\Real Estate`, `gov-drafts`,
  `fiverr`) → `tax-docs/index.json` (gitignored). **Live test cataloged 419 real docs.** An offline root
  (e.g. Z: disconnected) is skipped gracefully.
- **Attach a receipt to a deduction**: the review screen's "📎 receipts" button → `suggestDocs` → one-tap
  `attach-doc` (an append-only resolution folded by `resolveLedger` as `entry.docPath`, status-orthogonal).
- **Next**: Phase **3C** — the FreeTaxUSA filing pack (Sch C ×2 + Brick Ave LLC 1065 books/K-1 + 1099
  checklist + judgment calls). **Spec + plan are written (`docs/superpowers/{specs,plans}/2026-07-07-...
  phase3c-filing-pack*`); recommended to BUILD later, against real backfilled data + close to filing season.**

### 2026-07-07 — Tax & Wealth pod Phase 3A shipped: tax deadline wiring
Built per `docs/superpowers/specs/2026-07-07-tax-pod-phase3-deadlines-design.md`, branch
`feat/tax-phase3-deadlines`, 4 TDD tasks:
- **`pods/tax/deadlines.mjs`** — a pure, eval-pinned tax calendar: `taxDeadlines` (1040-ES quarterlies
  carrying the estimator's voucher $, Jan 31 1099-NEC, **Mar 15 Form 1065**, Apr 15 1040+PA-40+local;
  passed dates roll to next occurrence), `stageFor` (upcoming≤30 / soon≤7 / final≤3), `dueTaxReminders`
  (staged + deduped via `tax.deadline.reminded` events).
- **Home glance + `/api/tax/status`** now carry `upcomingDeadlines` (within 45 days) — the nearest tax
  deadline shows on the cockpit with its $ if a quarterly. **This works live now.**
- **Daily radar** (`runTaxDeadlineRadar` → control-plane `/maintenance/tax-deadline-check` → the
  `tax-deadline-radar` schedule.json job) pushes **final-stage (≤3-day)** reminders to Telegram, deduped,
  best-effort — mirrors the gov deadline radar. **Activates on the next NAS control-plane redeploy.**
- Next in Phase 3: **3B docs indexer** (index Z:\Real Estate + gov/Fiverr folders, link docs↔ledger) →
  **3C FreeTaxUSA filing pack** (Schedule C ×2 + Brick Ave LLC 1065 books/K-1 + 1099 checklist).

### 2026-07-06 — Tax & Wealth pod (Sage/TAX-01) Phase 2 shipped: bank-CSV importer
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
