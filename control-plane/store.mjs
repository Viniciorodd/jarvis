// store.mjs — the append-only event store (doctrine §9 rule 6: "Everything is logged").
// JSONL on disk: one immutable JSON object per line. Never updated or deleted — a correction is a
// NEW event. This is the system of record + the KPI source + the audit trail. Dependency-free so it
// runs identically on Windows (dev) and node:20-alpine (NAS); swap the backend for Postgres later
// behind this same module without touching the API or the agents.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');
const FILE = path.join(DIR, 'events.jsonl');
fs.mkdirSync(DIR, { recursive: true });

const today = () => new Date().toISOString().slice(0, 10);

/** Append one immutable event. Returns the stored record (with id + ts). */
export function appendEvent(ev) {
  const rec = {
    id: crypto.randomUUID(),
    ts: new Date().toISOString(),
    kind: ev.kind || 'action',          // action | approval.request | approval.decision | command | trace
    actor: ev.actor || 'unknown',       // which agent/workflow
    pod: ev.pod || 'system',            // gov | fiverr | chief-of-staff | research-risk | system
    action: ev.action || '',
    rationale: ev.rationale || '',
    status: ev.status || 'done',        // done | pending | error | resolved
    cost_usd: Number(ev.cost_usd) || 0,
    reversible: ev.reversible !== false, // default true; mark irreversible explicitly
    ref: ev.ref || null,                // for decisions: the request id they resolve
    idempotency_key: ev.idempotency_key || null,
    payload: ev.payload || {},
  };
  fs.appendFileSync(FILE, JSON.stringify(rec) + '\n');
  return rec;
}

/** Read all events (optionally filtered). Cheap at this scale; swap for indexed store later. */
export function readEvents(filter = {}) {
  let raw; try { raw = fs.readFileSync(FILE, 'utf8'); } catch { return []; }
  const out = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let e; try { e = JSON.parse(line); } catch { continue; }
    if (filter.pod && e.pod !== filter.pod) continue;
    if (filter.kind && e.kind !== filter.kind) continue;
    if (filter.since && e.ts < filter.since) continue;
    out.push(e);
  }
  return out;
}

/** Sum of cost_usd for events logged today — the live number the spend cap checks against. */
export function todaySpendUsd() {
  const day = today();
  return round(readEvents().filter((e) => e.ts.slice(0, 10) === day).reduce((s, e) => s + (e.cost_usd || 0), 0));
}

/** Idempotency guard (doctrine §9 rule 5): has this key already been recorded? */
export function seenIdempotencyKey(key) {
  if (!key) return false;
  return readEvents().some((e) => e.idempotency_key === key);
}

/** Look up one event by id — the executor uses it to resolve a decision back to its approval.request. */
export function getEvent(id) {
  if (!id) return null;
  return readEvents().find((e) => e.id === id) || null;
}

/** Open approval requests = approval.request events with no matching approval.decision. */
export function pendingApprovals() {
  const events = readEvents();
  const resolved = new Set(events.filter((e) => e.kind === 'approval.decision' && e.ref).map((e) => e.ref));
  return events.filter((e) => e.kind === 'approval.request' && !resolved.has(e.id));
}

function round(n) { return Math.round(n * 1000) / 1000; }
export { today };
