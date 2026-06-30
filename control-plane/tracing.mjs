// tracing.mjs — optional Langfuse mirror for the event store (doctrine §11: tracing from agent #1).
//
// The append-only event log (store.mjs) IS the source-of-truth trace. This module ADDITIONALLY mirrors
// each event to a self-hosted Langfuse for VISUAL tracing (timelines, cost/latency charts, drill-down)
// when — and only when — Langfuse is configured. With no LANGFUSE_* env set it is a silent no-op, so
// nothing depends on Langfuse being up (graceful degradation, §11). Fire-and-forget: it never blocks or
// throws into the hot path of logging an event.
//
// Configure (after you deploy the container — see docs/langfuse.md):
//   LANGFUSE_HOST=http://localhost:3000   LANGFUSE_PUBLIC_KEY=pk-...   LANGFUSE_SECRET_KEY=sk-...
// Dependency-free (raw fetch + Node's btoa).

import crypto from 'node:crypto';

const cfg = () => ({
  host: (process.env.LANGFUSE_HOST || '').replace(/\/$/, ''),
  pub: process.env.LANGFUSE_PUBLIC_KEY || '',
  sec: process.env.LANGFUSE_SECRET_KEY || '',
});
export function tracingEnabled() { const c = cfg(); return !!(c.host && c.pub && c.sec); }

// PURE: map one Jarvis event → a Langfuse ingestion item. Each event becomes its own trace named
// "<pod>.<action>" so it's searchable; cost/latency/metadata ride along. Eval-pinned.
export function toLangfuseItem(ev = {}) {
  const ts = ev.ts || new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    type: 'trace-create',
    timestamp: ts,
    body: {
      id: ev.id || crypto.randomUUID(),
      timestamp: ts,
      name: `${ev.pod || 'system'}.${ev.action || ev.kind || 'event'}`,
      userId: ev.actor || 'system',
      input: ev.rationale || '',
      output: ev.status || 'done',
      tags: [ev.kind, ev.pod, ev.reversible === false ? 'irreversible' : 'reversible'].filter(Boolean),
      metadata: { kind: ev.kind, actor: ev.actor, cost_usd: ev.cost_usd || 0, ref: ev.ref || null, ...(ev.payload && typeof ev.payload === 'object' ? { payload: ev.payload } : {}) },
    },
  };
}

// Fire-and-forget mirror of one event. Never awaited by the store; swallows all errors.
export function traceEvent(ev) {
  const c = cfg();
  if (!(c.host && c.pub && c.sec)) return; // not configured → silent no-op
  const auth = 'Basic ' + Buffer.from(`${c.pub}:${c.sec}`).toString('base64');
  fetch(c.host + '/api/public/ingestion', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: auth },
    body: JSON.stringify({ batch: [toLangfuseItem(ev)] }),
    signal: AbortSignal.timeout(4000),
  }).catch(() => { /* Langfuse may be down; the JSONL log is still the source of truth */ });
}
