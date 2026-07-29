// approvals-view.mjs — turning the raw pending-approval queue into something a human can ACT on.
//
// Operator, 2026-07-29: *"my today and home are still useless on my pc."* He was right, and the queue was a
// big part of why. Twenty-five rows, twelve of them titled literally "your approval", eleven of those the same
// morning-brief step re-gated every run. A queue that says "your approval" twelve times tells you nothing —
// it is worse than an empty queue, because it costs you the time to read it before you learn that.
//
// Two defects, both fixed here as PURE functions so the evals can hold them down:
//   1. TITLES were mined out of the gate's own doctrine boilerplate. "Treated as irreversible — gated for your
//      approval (doctrine §9 rule 2)" fed through a `" for (.+)"` regex yields the subject "your approval".
//      The boilerplate is the gate's REASON, never the subject of what is being gated. Same root cause as the
//      Telegram repeats the operator flagged on 2026-07-27 — fixed there in narrate.mjs, missed here.
//   2. IDENTICAL pendings were listed one-per-run. The scheduler re-gates the same step every morning, so the
//      queue grew without ever saying anything new.
//
// We COLLAPSE identical pendings for display; we never drop one. Every id is carried on the surviving row, so
// acting on it can still resolve the whole group and nothing silently disappears from the queue.

import { isGateBoilerplate } from './narrate.mjs';

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

// PURE: the best human subject for one pending approval. Eval-pinned.
export function approvalSubject(a = {}) {
  const p = a.payload || {};
  if (clean(p.title)) return clean(p.title);
  // A gated step usually carries what it wanted to do; that is a far better label than anything we could mine
  // out of prose, so prefer it before touching the rationale at all.
  if (clean(p.summary)) return clean(p.summary).split(/(?<=[.!?])\s|\n/)[0].slice(0, 120).trim();
  const raw = clean(a.rationale);
  // Never mine a subject out of boilerplate — that is exactly what produced "your approval" twelve times.
  if (!raw || isGateBoilerplate(raw)) {
    const who = clean(p.assignee && (p.assignee.nickname || p.assignee.codename)) || clean(a.actor);
    const act = clean(a.action) || 'action';
    return (who ? who + ' — ' : '') + act + ' needs your OK';
  }
  const r = raw.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ');
  const m = r.match(/drafted for (.+?)\s*(?:\.|$)/i) || r.match(/ for (.+?)\s*(?:\.|$)/i);
  return clean(m ? m[1] : r.split(/[.—]/)[0]) || clean(a.action) || 'an action';
}

// PURE: identity of a pending item for collapsing. Same pod+action+subject+summary = the same ask restated.
export function approvalKey(a = {}) {
  const p = a.payload || {};
  return [clean(a.pod), clean(a.action), approvalSubject(a), clean(p.summary), clean(p.source)].join('¦');
}

// PURE: collapse identical pendings into one row each, newest first, carrying every id + a count.
// Order is preserved by first appearance so the queue does not reshuffle under the operator between polls.
export function collapseApprovals(list = []) {
  const out = [];
  const byKey = new Map();
  for (const a of Array.isArray(list) ? list : []) {
    const key = approvalKey(a);
    const seen = byKey.get(key);
    if (seen) { seen.count += 1; seen.ids.push(a.id); if (a.ts && (!seen.ts || a.ts > seen.ts)) seen.ts = a.ts; continue; }
    const row = { id: a.id, ids: [a.id], count: 1, pod: a.pod, action: a.action, rationale: a.rationale, title: approvalSubject(a), ts: a.ts };
    byKey.set(key, row);
    out.push(row);
  }
  return out;
}
