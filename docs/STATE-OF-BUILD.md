# Jarvis — State of the Build (gap analysis)

> Honest scorecard of the vision (see [`operating-doctrine.md`](operating-doctrine.md) +
> [`reference/jarvis-build-plan.md`](reference/jarvis-build-plan.md)) vs. what actually exists.
> Last assessed: **2026-06-14**. Legend: ✅ done · 🟡 partial · ❌ missing.

## Headline
**Core infrastructure is DONE** — control-plane spine, evals + tracing, code-enforced caps, Vosk offline
wake, real image generation all tested + working. Gov pod is strong (first federal proposal sent). The
remaining weak spots are exactly what the doctrine calls out: **per-agent scoped credentials** (currently
shared keys in .env), **Chief-of-Staff router** (comms-only Companion, not a classifying front door yet),
and formal **autonomy ladder with promotion rules** (workflows are human-gated but levels not formalized).

## Against the 5 prime directives
| # | Directive | Status | Reality |
|---|---|---|---|
| 1 | LLM proposes, **code** disposes | ✅ | **`control-plane/spend.mjs` deterministic spend guard built + unit-tested** (per-action + per-day caps; `/spend/check` denies over-limit). HQ money/XP also in code. Markup math still to move into code. |
| 2 | Gate every irreversible action | ✅ | dry-run→`--send` (gov), dry-run→`--execute` (inbox), Telegram/HQ approval buttons. Solid. Per-workflow autonomy levels not yet formalized. |
| 3 | Least privilege, one cred/agent, vault | 🟡 | Secrets in `.env` (not a vault). One shared Anthropic key; shared Gmail app-passwords. Not per-agent. |
| 4 | External content = untrusted data | 🟡 | Stated in prompts (email-triage, companion). No structural fencing/sanitization layer. |
| 5 | **Evals + tracing from agent #1** | 🟡 | **Eval harness built + green** (`evals/run.mjs` + spend-guard suite, 8/8 pass, exits non-zero on fail). **Tracing = the append-only event store** (`control-plane/`); every `/events` write is a trace. Remaining: a suite per agent + Langfuse for visual tracing. |

## Against the stack
| Piece | Status | Notes |
|---|---|---|
| Self-hosted NAS + Docker | ✅ | Live on UGREEN ThanesKeep (192.168.6.121). |
| n8n orchestration | ✅ | 7 workflows exported + deployed (`n8n/workflows/`). |
| Claude API tiered (Haiku/Sonnet/Opus) | ✅ | Models used + **free compute layer** (`pods/model-router.mjs`, 2026-06-29): every call routes local Ollama → OpenRouter (free) → Claude, auto-falling-back so Jarvis never goes dark when tokens run out; privacy→local-only; eval-pinned. Remaining cost saver: prompt caching + Batch API not yet wired. |
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

## Extra gaps the FULL doctrine surfaces (beyond the 5 directives)
The real `operating-doctrine.md` (now canonical) asks for more than the 5 directives:
- **Chief-of-Staff-as-router** (§2 org model) — a classifying front door that dispatches to pods and
  aggregates back. ✅ BUILT (`pods/chief-of-staff/`): `/command` → Claude (Haiku) classifies → deterministic
  gate decision (irreversibles → approval.request) → routes to the pod registry, logs every step with
  rationale, mirrors the agent onto the HQ floor. 18/18 evals green (incl. the gate-decision regression).
- **Autonomy ladder L0–L4 + promotion rule** (§8) — promote a workflow only when evals pass AND
  human-edit-rate < threshold. Not implemented; autonomy is informal. ❌
- **Two-layer KPIs** (§10) — Layer-2 system metrics (autonomy ratio, **human-edit rate**, escalation
  rate, cost/task, **ROIC of compute**, eval coverage/drift) are not tracked. ❌
- **Langfuse self-hosted tracing** (§11) — named explicitly; not deployed. ❌
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
   Remaining: wire the actual pod WORKERS (the router routes/queues; pods don't execute the work yet) and
   formalize L0→L1 promotion (evals + human-edit-rate threshold).
6. ❌ **Per-agent scoped credentials + a vault** (directive #3) — split shared keys; secrets out of `.env`.
7. ❌ **Research-&-Risk desk — monitor + journal ONLY**, zero execution (§7).
8. ✅ **Offline wake word (Vosk)** — built + model downloaded + served (hasVosk:true verified). Porcupine
   dropped (Picovoice gates on a company email); Vosk runs 100% locally, audio never leaves the PC.
   Files: `scripts/get-vosk-model.mjs`, `companion/public/vosk-wake.js`, wired in `app.js` as the
   preferred wake path. Only the live mic test is on the user.
9. **Refactor HQ + Companion to be control-plane clients**; deploy Langfuse + move event store to NAS Postgres.

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
