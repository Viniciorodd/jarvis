# Control Plane — the system of record

The surface-agnostic core from the doctrine (§4) + handoff ("First task"). HQ, Slack, and the
Companion are **clients** of this API; none is load-bearing. Dependency-free Node (builtins only),
so it runs identically on Windows dev and `node:20-alpine` on the NAS.

## Run
```
node control-plane/server.js          # default port 8787
CONTROL_PLANE_PORT=8787 SPEND_ACTION_CAP_USD=2 SPEND_DAILY_CAP_USD=5 node control-plane/server.js
node evals/run.mjs                     # regression suites (exits non-zero on failure)
```

## Pieces
- **`store.mjs`** — append-only JSONL event store (`data/events.jsonl`). Immutable: a correction is a
  new event. Source of truth + KPI source + audit trail. Swap for Postgres later behind this module.
- **`spend.mjs`** — the deterministic spending guard (directive #1). Pure, unit-tested in `/evals`.
- **`kpis.mjs`** — Layer-1 (per-pod) + Layer-2 (system) metrics, computed from events.
- **`server.js`** — the HTTP API below.

## API contract
| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | liveness + active caps |
| POST | `/events` | log an immutable action/trace (`{kind,actor,pod,action,rationale,status,cost_usd,reversible,idempotency_key,payload}`) |
| GET | `/events?pod=&kind=&since=` | read the log (debug/dashboard) |
| GET | `/approvals/pending` | open approval requests |
| POST | `/approvals/:id` | resolve a gate — `{decision:"approve"\|"edit"\|"pass", note?}` |
| POST | `/command` | operator instruction in — `{text, source}` (CoS router dispatch is a later pod) |
| GET | `/kpis` | Layer-1 + Layer-2 metrics |
| POST | `/spend/check` | **deterministic cap gate** — `{amountUsd, actor, pod}` → `200 allow` / `402 deny`. Money-moving calls MUST pass this first. |
| GET | `/state` | summary for dashboards (pending + recent + kpis) |

## Event kinds
`action` · `approval.request` · `approval.decision` · `command` · `trace`
An approval is **open** until an `approval.decision` event references its id (`ref`).

## How agents use it (the contract every pod follows)
1. Before any spend: `POST /spend/check` → proceed only on `allow`.
2. For any irreversible action: `POST /events {kind:"approval.request", reversible:false}` → wait for a decision.
3. After acting: `POST /events {kind:"action", cost_usd, idempotency_key}` (idempotency key prevents double-sends — directive: rule 5).
4. The weekly Opus reflection reads `/kpis` (human-edit rate, ROIC of compute, eval coverage) and proposes changes.

## Tracing
Every `/events` write **is** a trace record (inputs/tool-calls/cost/outcome in `payload`). For full
visual tracing, Langfuse (self-hosted, Docker on the NAS) is the production target — it consumes the
same event shape. Wire it in `infra/` when the NAS has spare headroom.

## Not yet (deliberately — needs owner go-ahead per doctrine)
- Postgres backend (currently JSONL). - Langfuse container. - The Chief-of-Staff router that consumes
  `/command` and dispatches to pods. - Per-agent scoped credentials feeding `actor`.
