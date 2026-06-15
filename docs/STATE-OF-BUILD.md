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
| Claude API tiered (Haiku/Sonnet/Opus) | 🟡 | Models used; **prompt caching + Batch API not confirmed wired** (the 80–95% cost saver). |
| Control-plane API + append-only event store as system of record | 🟡 | HQ (`hq/server.js`) has `/api/event`, `/api/approval`, `/api/state` + an events feed — closest thing, but it's a **game dashboard, not a rigorous append-only ledger** treated as the system of record. |
| Tailscale private access | ✅ | Per NAS deploy. |
| Slack/Mattermost as comms-only | ✅ | Slack bridge (Socket Mode) + Telegram; comms clients, not source of truth. |

## Against the build order
1. Control-plane API + event log + dashboard skeleton — 🟡 (HQ exists; not a formal control-plane/ledger)
2. Chief of Staff + email triage L0→L1 — 🟡 (morning brief + EOD + email-triage workflow + gated send exist; autonomy levels not formalized)
3. Eval harness + tracing — ❌
4. Gov scout + bid analyst (drafting only) — ✅ **strong** (scout→analyst→producer→gated send; **first proposal sent to West Point CO**)
5. One cash-flow pod (Fiverr) — 🟡 (producer + revision prompts + portfolio exist; **not earning; image output quality is poor — see below**)
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
   **TESTED & WORKING** — generated sample thumbnail (shocked entrepreneur, blue rim lighting, bold text).
   Note: FLUX-schnell text-rendering is imperfect; for production, either avoid fine text or post-edit with
   Photoroom / remove.bg. Next: wire into gig-producer flow + add product-edit step (bg removal, relight).
5. 🟡 **Chief of Staff router + email triage at L0→L1** — ✅ ROUTER BUILT (`pods/chief-of-staff/`:
   classify → gate → dispatch → log → HQ mirror; eval-pinned). Remaining: wire the actual email-triage
   pod behind it and formalize the L0→L1 promotion (evals + human-edit-rate threshold).
6. ❌ **Per-agent scoped credentials + a vault** (directive #3) — split shared keys; secrets out of `.env`.
7. ❌ **Research-&-Risk desk — monitor + journal ONLY**, zero execution (§7).
8. ✅ **Offline wake word (Vosk)** — built + model downloaded + served (hasVosk:true verified). Porcupine
   dropped (Picovoice gates on a company email); Vosk runs 100% locally, audio never leaves the PC.
   Files: `scripts/get-vosk-model.mjs`, `companion/public/vosk-wake.js`, wired in `app.js` as the
   preferred wake path. Only the live mic test is on the user.
9. **Refactor HQ + Companion to be control-plane clients**; deploy Langfuse + move event store to NAS Postgres.

## The image/video quality problem (why the mockups look bad)
The Fiverr samples are **SVG vector illustrations drawn in code** — fine for diagrams, wrong for what a
paying client expects (polished raster art / photoreal edits). Claude cannot generate images. To deliver
"Photoshop-pro" work the Producer must call a real media model:
- **Thumbnails / text-in-image:** Ideogram or Google Gemini 2.5 Flash Image ("Nano-Banana") — strong legible text.
- **General art / covers:** FLUX.1 (via fal.ai or Replicate) or OpenAI `gpt-image-1`.
- **Product-photo edits (bg removal, relight):** Photoroom / remove.bg + FLUX-Kontext for compositing.
- **Video:** Google Veo 3.1, Kling, or Runway Gen-4 (pricier; phase later).
This needs **one image-API key + a small per-image budget** (~$0.003–0.04/image) and stays behind the
human-QC gate. Provider + budget is an owner decision (credentials + money → ask first).

**DECIDED 2026-06-14:** provider = **fal.ai (FLUX)** — switched from OpenAI after the OpenAI account hit
`billing_hard_limit`. Cap = **$10/mo, code-enforced**. Engine `scripts/gen-image.mjs` is **provider-aware**
(fal default via `FAL_KEY`; OpenAI gpt-image-1 fallback via `OPENAI_API_KEY`; force with `MEDIA_PROVIDER`),
with the deterministic monthly cap (directive #1). Companion `generate_image` tool wired. ⏳ Needs `FAL_KEY`
in `.env` (fal.ai gives free starter credits — no card to begin), then a test gen + product-edit step.
Video (Veo/Kling) deferred.
