# Langfuse — visual tracing for Jarvis (doctrine §11)

The append-only event log (`control-plane/data/events.jsonl`) is already the **source-of-truth trace** —
every agent run, tool call, cost, and outcome is logged there. Langfuse adds a **visual** layer on top:
timelines, cost/latency charts, and click-through drill-down per agent. It is **optional** — Jarvis runs
identically with it off.

## How it's wired
- `control-plane/tracing.mjs` mirrors **every** event written by `store.appendEvent` to Langfuse's
  ingestion API — but **only** when `LANGFUSE_HOST` + `LANGFUSE_PUBLIC_KEY` + `LANGFUSE_SECRET_KEY` are set.
  With them unset it's a silent no-op (fire-and-forget; it never blocks or breaks logging).
- Each Jarvis event becomes a Langfuse trace named `"<pod>.<action>"` (e.g. `gov.proposal.draft`), tagged
  reversible/irreversible, with cost + payload in metadata. The mapping (`toLangfuseItem`) is eval-pinned.

## Deploy it on the NAS (operator's step — needs your go-ahead, it's new infra)
Langfuse needs its own Postgres + a web container. Easiest path:

1. Spin up the official stack (it ships a compose file):
   ```bash
   git clone https://github.com/langfuse/langfuse && cd langfuse
   docker compose up -d        # serves the UI on :3000
   ```
   …or add a `langfuse` service to this repo's `docker-compose.yml` pointing at the existing `postgres`
   service (a commented starter block is in that file under "# --- Langfuse (optional visual tracing) ---").
2. Open `http://<nas>:3000`, create a project, copy its **Public** and **Secret** keys.
3. Put them in `.env`:
   ```
   LANGFUSE_HOST=http://langfuse:3000      # or http://<nas-ip>:3000 from the host app
   LANGFUSE_PUBLIC_KEY=pk-lf-...
   LANGFUSE_SECRET_KEY=sk-lf-...
   ```
4. Restart the control-plane (`docker compose up -d --build control-plane`). New events now appear in
   Langfuse within seconds. Verify with one command on the host: `node -e "import('./control-plane/store.mjs').then(s=>s.appendEvent({pod:'system',action:'langfuse.test',rationale:'hello'}))"`
   then refresh the Langfuse Traces view.

## Why it's gated behind a go-ahead
Standing up Langfuse = a new container + a second Postgres database + a port. That's an architecture/infra
decision (CLAUDE.md "⚠ Ask the human before … defines architecture"). The shim is built and tested now so
flipping it on later is purely setting three env vars — no code change.
