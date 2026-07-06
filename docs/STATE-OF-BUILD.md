# Jarvis — State of the Build (gap analysis)

> Honest scorecard of the vision (see [`operating-doctrine.md`](operating-doctrine.md) +
> [`reference/jarvis-build-plan.md`](reference/jarvis-build-plan.md)) vs. what actually exists.
> Last assessed: **2026-06-30**. Legend: ✅ done · 🟡 partial · ❌ missing.

## Headline
**Core infrastructure is DONE and the doctrine's old weak spots are now closed** (2026-06-30): per-agent
**least-privilege is enforced** at the point of use, the **autonomy ladder L0–L4 + promotion rule** is
real, the **Research & Risk desk** (monitor+journal, zero-execution) is built, and **Langfuse tracing** is
wired (shim; container deploy pending). The Chief-of-Staff router classifies + routes + gates and pod
workers execute. Gov pod is strong (first federal proposal sent) and now has a **"anyone can run it"
Submission Wizard** (opportunity→submitted). Remaining: deploy Langfuse, encrypt the vault for production,
and rack up real submit history so workflows can earn promotion up the ladder.

## Against the 5 prime directives
| # | Directive | Status | Reality |
|---|---|---|---|
| 1 | LLM proposes, **code** disposes | ✅ | **`control-plane/spend.mjs` deterministic spend guard built + unit-tested** (per-action + per-day caps; `/spend/check` denies over-limit). HQ money/XP also in code. Markup math still to move into code. |
| 2 | Gate every irreversible action | ✅ | dry-run→`--send` (gov), dry-run→`--execute` (inbox), Telegram/HQ approval buttons. Solid. Per-workflow autonomy levels not yet formalized. |
| 3 | Least privilege, one cred/agent, vault | ✅ | **Vault ACL now ENFORCED at the point of use** (2026-06-30): `pods/lib.mjs secret(agent,name)` broker routes every scoped read (SAM/Places/Hunter/FAL/Stripe/Anthropic) through `control-plane/vault.mjs`, which denies + logs anything off-ACL. `/vault/audit` surfaces who-can-read-what. `vault.enc` (AES-256-GCM) optional for production; `.env` still the dev value source. |
| 4 | External content = untrusted data | 🟡 | Stated in prompts (email-triage, companion); R&R desk fences market data as data (directive #4). Still no global structural sanitization layer. |
| 5 | **Evals + tracing from agent #1** | ✅ | **Eval harness green (218/218)**, exits non-zero on fail, suites per agent (vault/router/autonomy/research-risk/tracing/gov-*/finance/…). **Tracing = the append-only event store** + an optional **Langfuse visual-tracing shim** (`control-plane/tracing.mjs`, wired into `store.appendEvent`, no-op until `LANGFUSE_*` set). Remaining: deploy the Langfuse container (operator). |

## Against the stack
| Piece | Status | Notes |
|---|---|---|
| Self-hosted NAS + Docker | ✅ | Live on UGREEN ThanesKeep (192.168.6.121). |
| n8n orchestration | ✅ | 7 workflows exported + deployed (`n8n/workflows/`). |
| Claude API tiered (Haiku/Sonnet/Opus) | ✅ | Models used + **free compute layer** (`pods/model-router.mjs`, 2026-06-29): every call routes local Ollama → OpenRouter (free) → Claude, auto-falling-back so Jarvis never goes dark when tokens run out; privacy→local-only; eval-pinned. **2026-07-02: real per-model pricing (`claudeCost`, cache-aware — old flat rate underestimated Opus ~6x), prompt caching on the system block, draft tier → Sonnet 5 (intro $2/$10 through 2026-08-31), reflect tier → adaptive thinking on Opus 4.8. All eval-pinned + live-smoke-tested.** **Batch API wired (2026-07-02):** `llmBatch()` in the router + `claudeBatch()` in pods/lib — N independent prompts → ONE Message Batches call at **50% off**, per-item fallback to the normal chain (never goes dark; privacy/brain-chip respected; `LLM_BATCH=0` to disable). First consumer: the gov scan scores its whole SAM feed in one batch (was a sequential per-op loop). Live-tested: 3-item batch served in 85s at half price. Other fan-outs (inbox triage, absorb) can adopt `claudeBatch()` as-is. |
| Control-plane API + append-only event store as system of record | 🟡 | HQ (`hq/server.js`) has `/api/event`, `/api/approval`, `/api/state` + an events feed — closest thing, but it's a **game dashboard, not a rigorous append-only ledger** treated as the system of record. |
| Tailscale private access | ✅ | Per NAS deploy. |
| Slack/Mattermost as comms-only | ✅ | Slack bridge (Socket Mode) + Telegram; comms clients, not source of truth. |

## Against the build order
1. Control-plane API + event log + dashboard skeleton — 🟡 (HQ exists; not a formal control-plane/ledger)
2. Chief of Staff + email triage L0→L1 — 🟡 (morning brief + EOD + email-triage workflow + gated send exist; autonomy levels not formalized)
3. Eval harness + tracing — ❌
4. Gov scout + bid analyst (drafting only) — ✅ **strong** (scout→analyst→producer→gated send; **first proposal sent to West Point CO**)
5. One cash-flow pod (Fiverr) — 🟢 (producer + revision prompts + portfolio exist; **thumbnail quality SOLVED**
   — hybrid engine now ships real, clickable YouTube thumbnails via a live Studio + voice path; not yet earning)
6. Research-&-Risk desk (monitor + journal only) — ❌ (not built)

## Built beyond the original plan (real, but off the critical path)
- ✅ **JARVIS Companion** — voice-first "her" desktop app (orb UI, file hands, HQ fusion, now: open-files,
  drag-drop, visuals, dashboard, Deepgram wake). Powerful, but it's an extra surface the build-engineer
  order didn't ask for yet.
- ✅ Inbox cleanup tooling (audit + clean, both gated). ✅ Rodgate website live (rodgate-llc.netlify.app).
- ✅ Data ingestion (Notability/voice/journals/OCR) + Operator Profile pipeline.
- ✅ **Jarvis World** (`jarvis-world/`) — React + Vite PWA: a live, game-like window into the floor. Each
  agent is an NPC at its pod's desk that bobs while working, shows a task speech-bubble, pings coral when
  it needs you, shakes on error. Polls HQ `/api/state` + control-plane `/state`; one-tap approvals + a
  command bar that routes through the CoS. Builds clean (PWA: service worker + manifest). Dockerized +
  wired into `docker-compose.yml` (nginx proxies `/hq` + `/cp`); installable on iPhone/iPad over Tailscale.
- ✅ **HQ reskinned** to the companion's dark/teal palette — HQ + the Jarvis AI now read as one product.
- ✅ **Control-plane Dockerfile** added (was missing) + `control-plane` service in compose.
- ✅ **Tax & Wealth pod (Sage/TAX-01, reports to Victor/LEDGER-01), Phase 1 (2026-07-06)** — `pods/tax/`:
  TY2026 constants (each param verified-flagged, unverified ones surface as ⚠), pure eval-pinned engine
  (SE tax, federal brackets, QBI, PA 3.07%+local EIT, 27.5y mid-month depreciation, 19% K-1 share for
  2135 Brick Ave LLC with K-1 losses excluded+flagged, safe-harbor quarterlies), append-only ledger
  (`tax-ledger/<year>.jsonl`, hash dedupe), capture + savings splitter + debt desk (myFICO-seeded,
  avalanche/snowball, 1099-C anticipation), routes `/api/tax/status|capture|paid`, cockpit Home 💰 line.
  Eval harness green (316/316). Spec: `docs/superpowers/specs/2026-07-05-tax-pod-design.md`.
- ✅ **Tax & Wealth pod Phase 2 — bank-CSV importer (2026-07-06)** — `pods/tax/importer.mjs` +
  `accounts.mjs` + `review.mjs`: per-account column maps (header-hash profiles, one-time Claude-proposed
  map, operator confirms before any row files), cross-source ±3-day dedup on top of exact hash re-drop,
  taxonomy-gated `claudeBatch` classify fallback (rules first, LLM only picks from the fixed
  Schedule C/E list, never invents a category), whole-file quarantine to `tax-inbox/failed/` when >20%
  of rows are unparseable. Review queue + cockpit screen for `needs_review` items (accept /
  recategorize / merge / keep-both — `reject` exists in the API but has no button in the UI yet),
  append-only resolution deltas in the ledger (never mutate
  history). Backfill CLI: `node pods/tax/importer.mjs --backfill` runs the drop-folder
  (`tax-inbox/`) once and prints `N files · X filed · Y queued · Z quarantined · $D deductions found`.
  Eval harness green (run `node evals/run.mjs` for the current count). Known limitations:
  in-UI column-map confirm is deferred to the CLI/`accounts.local.json` (no first-import wizard yet in
  the cockpit); per-row property attribution is entity-level only (no per-row property inference); the
  review routes read the current tax year only (no cross-year review queue). Spec:
  `docs/superpowers/specs/2026-07-06-tax-pod-phase2-importer-design.md`.

## Extra gaps the FULL doctrine surfaces (beyond the 5 directives)
The real `operating-doctrine.md` (now canonical) asks for more than the 5 directives:
- **Chief-of-Staff-as-router** (§2 org model) — a classifying front door that dispatches to pods and
  aggregates back. ✅ BUILT (`pods/chief-of-staff/`): `/command` → Claude (Haiku) classifies → deterministic
  gate decision (irreversibles → approval.request) → routes to the pod registry, logs every step with
  rationale, mirrors the agent onto the HQ floor. 18/18 evals green (incl. the gate-decision regression).
- **Autonomy ladder L0–L4 + promotion rule** (§8) — ✅ BUILT (`control-plane/autonomy.mjs`, 2026-06-30):
  per-workflow level store; `canPromote()` = evals green AND human-edit-rate < threshold AND enough
  samples; HARD floor keeps send/submit/spend gated at every level; wired into the router as a safe
  override; `/autonomy` + CLI. Levels never auto-raise (operator grants autonomy). 13 evals.
- **Two-layer KPIs** (§10) — partial: `autonomy.mjs` now computes **human-edit-rate** per workflow + an
  **autonomy ratio** from the event log; `control-plane/kpis.mjs` has the rest. ROIC-of-compute still TODO. 🟡
- **Langfuse self-hosted tracing** (§11) — 🟡 shim built + wired (`control-plane/tracing.mjs`); container
  deploy pending (3-env-var flip, `docs/langfuse.md`).
- **Idempotency + kill switch + global hard spend cap** (§9 constitution) — kill switch ≈ n8n master
  toggle exists; idempotency + a global code-enforced daily cap are not built. 🟡

## The prioritized next builds — follow the doctrine's own BUILD ORDER (handoff §"First task")
1. ✅ **Control-plane API + append-only event store** — BUILT + tested (`control-plane/`). Endpoints,
   spend gate, two-layer KPIs all green. Postgres + Langfuse + dashboard-refactor deferred (need go-ahead).
2. ✅ **Eval harness** — BUILT + green (`evals/`, exits non-zero on fail). Tracing via the event store.
3. ✅ **Code-enforced money/caps** — BUILT + tested (`control-plane/spend.mjs`).
4. ✅ **Real media for the Fiverr cash pod** — provider-aware engine (`scripts/gen-image.mjs`, Cloudflare
   FLUX-schnell FREE default + fal.ai paid backup, $10 code cap) + companion `generate_image` tool wired.
   ✅ **THUMBNAIL QUALITY SOLVED (2026-06-19) via a HYBRID engine** (`scripts/make-thumbnail.mjs`): Claude
   designs the spec → FLUX paints the photoreal SUBJECT (free) → CODE composites the bold, legible headline
   on top → one self-contained 1280×720 SVG. This is how real designers work, and it sidesteps FLUX's mangled
   text. Surfaced as a **live Studio** (Companion → Operations → 🎨 Fiverr Studio → 🎨 Studio): type a client
   scenario → see it rendered in a real YouTube in-feed card → **Download PNG** (client-side canvas, untainted).
   The Fiverr **worker** routes `thumbnail` briefs through this engine (voice/chat: "have Remy make a thumbnail
   for X"), still behind the deliver gate.
   ✅ **FULL STUDIO (2026-06-19): 4 deliverable types.** Shared lib `scripts/studio-lib.mjs` + four engines:
   `make-thumbnail.mjs` (MrBeast-style: extreme expression, hyper-saturated color-grade, huge minimal text),
   `make-cover.mjs` (hybrid book/eBook cover, KDP 1600×2400, genre-aware type), `make-logo.mjs` (clean VECTOR
   logo — Claude designs spec, code composes monogram + wordmark; no FLUX so it's always crisp), and
   `edit-product.mjs` (fal.ai BiRefNet bg-removal via the STUDIO-01-scoped FAL_KEY → clean studio backdrop +
   contact shadow). Studio UI has a type selector (Thumbnail/Cover/Logo/Product), per-type previews (YouTube
   card / book mock / logo on dark+light / before-after), and natural-size PNG export. Routes:
   `/api/studio/{thumbnail,cover,logo}` + `/api/studio/product` (data-URI upload). Worker routes cover/logo too.
   Portfolio = one master gallery `fiverr/portfolio/index.html` (real PNG samples, Download buttons) spanning
   niches (real estate / business / trading / crypto / finance / fitness / etc.): 8 thumbnails, 5 covers,
   6 logos, 1 product. All verified in-browser. Next: more product samples + first paid order.
5. 🟡 **Chief of Staff router + email triage at L0→L1** — ✅ ROUTER BUILT & persona-aware (`pods/org.mjs`
   full chain of command: CEO/CFO/Elle + business pods + Real Estate/Legal/Personal, each with nickname +
   codename + reports-to + model tier). Resolves "ask the CFO" → person; has `scan now` + `full report`
   verbs; gate logic eval-pinned. ✅ Conservative SCHEDULER (`control-plane/scheduler.mjs` + `schedule.json`):
   working-hours window, gov 1 scan/day, order polls that REST (zero LLM) when idle — eval-pinned (dueJobs).
   ✅ Pod WORKERS now execute (gov scout→score→draft→compliance→gate; fiverr/saas/finance; + the new R&R
   desk) and ✅ L0→L4 promotion is formalized (`control-plane/autonomy.mjs`, evals + human-edit-rate).
6. ✅ **Per-agent scoped credentials ENFORCED** (directive #3, 2026-06-30) — `secret(agent,name)` broker
   routes scoped reads through the vault ACL; off-ACL reads denied + logged; `/vault/audit`. Encrypt to
   `vault.enc` for production (CLI exists).
7. ✅ **Research-&-Risk desk — monitor + journal ONLY** (`pods/research-risk/desk.mjs`, Dana). Zero
   execution by construction (`assertMonitorOnly` refuses every trade/order/wire verb); eval-pinned (§7).
10. ✅ **Gov Submission Wizard (2026-06-30)** — `companion/public/submit-wizard.js`: opportunity→submitted
    in 6 plain-English screens, simple enough for a non-expert; the irreversible submit stays human.
    `/api/gov/wizard` + `/api/gov/submit/record`; launches from the cockpit board + Home banner + GovCon
    drawer. Operator guide: `docs/how-to-submit-a-gov-contract.md`. Verified live on the iPhone viewport.
8. ✅ **Offline wake word (Vosk)** — built + model downloaded + served (hasVosk:true verified). Porcupine
   dropped (Picovoice gates on a company email); Vosk runs 100% locally, audio never leaves the PC.
   Files: `scripts/get-vosk-model.mjs`, `companion/public/vosk-wake.js`, wired in `app.js` as the
   preferred wake path. Only the live mic test is on the user.
9. **Refactor HQ + Companion to be control-plane clients**; deploy Langfuse + move event store to NAS Postgres.

## The middleman pipeline — ✅ MADE LINEAR (2026-07-02)
The operator's core complaint ("my gov business feels off, non-linear — subs aren't reached, SOW isn't
pulled, quotes aren't captured, too much in the air before a submission") is now closed in code:
- **Root cause found + fixed:** SAM v2's `description` field is a URL, not prose — scoring/drafting were
  literally reading a link string. `pods/gov/sow.mjs` now fetches the REAL description + attachment list
  before scoring; the drafter answers the actual SOW (`sow.pull` events, `gov-drafts/sow/`).
- **Deal ledger** (`pods/gov/deals.mjs`): one explicit record per notice on the linear line
  scouted→scored→sow_pulled→outreach_drafted→outreach_sent→quotes_in→priced→proposal_ready→submitted→closed.
  `dealGaps()` = the deterministic "what's still in the air" checklist; `whoseMove()` = you/sub/jarvis/agency.
  Writers: worker (score/SOW/draft), connector (outreach drafted), sender (outreach SENT on real SMTP
  success), replies (quotes in → **priced in CODE**), submit wizard (submitted).
- **Middleman money in code** (`pods/gov/pricing.mjs`): parseQuote ("$4,200/mo" → amount+period) +
  middlemanPrice (quote × markup → bid/profit/margin; GOV_MARKUP_PCT default 18%, clamped 5–60%).
  The proposal drafter is TOLD the code-computed bid — it never invents pricing (directive #1).
- **Deal Room UI** (`companion/public/dealroom.html` → `/dealroom`, `/api/deals` + control-plane `/deals`):
  executive dark/champagne board — KPIs (pipeline $ / projected profit / waiting-on-you), the "Your move"
  queue, the stage rail, per-deal cards with ✓/○ checklists + bid/profit/quote. Verified live (desktop+mobile).
- **Inbox triage actually runs** (`pods/inbox/triage.mjs` + `/maintenance/inbox-triage` + schedule.json
  07:00 job): deterministic presort (no tokens on obvious noise) + ONE claudeBatch call for the rest →
  Telegram digest (what needs a reply) + gated cleanup approval. Personal + Rodgate accounts.
- 18 new eval cases (`evals/deals.eval.mjs`); suite green (257/257).

## The image/video quality problem — ✅ SOLVED for thumbnails (2026-06-19)
**Thumbnails are done** via the hybrid engine (photo subject + code-composited text — see build #4 above).
The original problem (Claude-SVG draws people as crude silhouettes; FLUX mangles text) is sidestepped by
letting each do what it's good at. Remaining gig types still want the same playbook:
- **Thumbnails / text-in-image:** ✅ hybrid FLUX-subject + composited headline (`scripts/make-thumbnail.mjs`).
  Optional upgrade: Ideogram / Gemini 2.5 Flash Image ("Nano-Banana") for in-image text if ever needed.
- **General art / covers:** hybrid is portable here next (FLUX subject + composited title); FLUX.1 via fal.ai/Replicate.
- **Product-photo edits (bg removal, relight):** Photoroom / remove.bg + FLUX-Kontext for compositing (not built).
- **Video:** Google Veo 3.1, Kling, or Runway Gen-4 (pricier; phase later).
Image gen stays behind the human-QC gate with the $10/mo code-enforced cap. Cloudflare FLUX is free (no card);
fal.ai is the paid backup. Provider/budget changes remain an owner decision (credentials + money → ask first).

**DECIDED 2026-06-14:** provider = **fal.ai (FLUX)** — switched from OpenAI after the OpenAI account hit
`billing_hard_limit`. Cap = **$10/mo, code-enforced**. Engine `scripts/gen-image.mjs` is **provider-aware**
(fal default via `FAL_KEY`; OpenAI gpt-image-1 fallback via `OPENAI_API_KEY`; force with `MEDIA_PROVIDER`),
with the deterministic monthly cap (directive #1). Companion `generate_image` tool wired. ⏳ Needs `FAL_KEY`
in `.env` (fal.ai gives free starter credits — no card to begin), then a test gen + product-edit step.
Video (Veo/Kling) deferred.
