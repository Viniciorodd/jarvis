// store.mjs — the Brand pod's ledger. Append-only, folded to derive the present.
//
// Matches what the rest of Jarvis already does — `actions/`, `focus/`, `tax-ledger/` are all JSONL,
// one file per year, and `pods/tax/ledger.mjs` derives its live view by folding resolutions over
// entries. There is no SQLite in this repo and this is not the pod that introduces one.
//
// WHY APPEND-ONLY RATHER THAN A ROW YOU UPDATE. The PRD asked for a status machine
// (drafted → queued → approved | killed → scheduled → published | failed) and a mutable row would
// have been the obvious way to hold it. It is the wrong way here: the question that matters later is
// not "what state is this post in" but "what happened to it, and when, and who said yes". A row that
// gets overwritten answers the first and destroys the second.
//
// 🚨 TWO INDEPENDENT LAYERS ENFORCE RULE 1. `policy.mjs` refuses to publish anything without a
// recorded approver — that is the gate. This file refuses to RECORD a publish for a post that was
// never approved — that is the ledger. Either alone could be bypassed by a bug upstream; together,
// an unapproved post has no path to a platform and no way to look like it published.
//
// THE CLAIMS LOG IS SEPARATE AND HAS NO UPDATE PATH. Not "we agree not to mutate it" — there is no
// exported function that can. While the $0-income filings stand, a published claim is a discoverable
// document, and the record of exactly what was said and when is worth more than the growth engine.
//
// PURE core, thin IO at the bottom. Eval-pinned.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
export const STORE_DIR = path.join(ROOT, 'brand-store');
export const CLAIMS_DIR = path.join(ROOT, 'brand-claims');

// ── The state machine ────────────────────────────────────────────────────────────────────────────
// `killed` is terminal on purpose: he said no, and a system that lets a killed draft creep back into
// the queue is one he stops trusting the kill button on.
export const STATUSES = ['drafted', 'queued', 'approved', 'killed', 'scheduled', 'published', 'failed'];

const TRANSITIONS = {
  draft:    { from: [null],                        to: 'drafted' },
  queue:    { from: ['drafted'],                   to: 'queued' },
  approve:  { from: ['queued'],                    to: 'approved' },
  kill:     { from: ['drafted', 'queued', 'approved', 'scheduled', 'failed'], to: 'killed' },
  schedule: { from: ['approved', 'failed'],        to: 'scheduled' },   // failed → scheduled is a retry
  publish:  { from: ['scheduled'],                 to: 'published' },
  fail:     { from: ['scheduled'],                 to: 'failed' },
  outcome:  { from: ['published'],                 to: 'published' },   // metrics attach; status holds
};

export function isValidTransition(type, from) {
  const t = TRANSITIONS[type];
  if (!t) return false;
  return t.from.includes(from === undefined ? null : from);
}

// PURE: fold one event onto a record. Returns { ok, record } or { ok:false, error }.
//
// An illegal transition is REFUSED rather than coerced. The one that matters most is publish from
// anything but scheduled — which is how "it published without me" becomes impossible to record, not
// merely against policy.
export function applyEvent(rec, ev) {
  if (!ev || !ev.type || !ev.id) return { ok: false, error: 'event needs an id and a type' };
  const from = rec ? rec.status : null;
  if (!isValidTransition(ev.type, from)) {
    return { ok: false, error: `cannot ${ev.type} a post that is ${from === null ? 'not yet drafted' : from}` };
  }
  const t = TRANSITIONS[ev.type];
  const base = rec || { id: ev.id, created: ev.ts || '', history: [] };
  const next = {
    ...base,
    ...pick(ev, ['pillar', 'platform', 'body', 'source', 'features', 'compliance', 'scheduledFor']),
    status: t.to,
    history: [...(base.history || []), { type: ev.type, ts: ev.ts || '', by: ev.by || '' }],
  };
  if (ev.type === 'approve') next.approvedBy = ev.by || '';
  if (ev.type === 'kill') { next.killedAt = ev.ts || ''; next.killReason = ev.reason || ''; }
  if (ev.type === 'publish') {
    next.publishedAt = ev.ts || '';
    next.platformPostId = ev.platformPostId || '';
    next.url = ev.url || '';
  }
  if (ev.type === 'fail') next.lastError = ev.error || '';
  if (ev.type === 'outcome') next.outcome = normaliseOutcome(ev.outcome);
  return { ok: true, record: next };
}

// 🚨 PRD §3 rule 7: no fabricated engagement. A metric we could not fetch is null, never 0.
// Zero is a measurement ("nobody engaged"); null is the absence of one. Collapsing them would make
// every failed fetch look like a post that flopped, and the loop would learn from it.
export function normaliseOutcome(o = {}) {
  const n = (v) => (v === null || v === undefined || v === '' ? null : (Number.isFinite(Number(v)) ? Number(v) : null));
  const a = o && o.audience;
  const total = a ? ['buyer', 'peer', 'creator', 'competitor', 'unknown'].reduce((s, k) => s + (Number(a[k]) || 0), 0) : 0;
  return {
    impressions: n(o && o.impressions),
    reactions: n(o && o.reactions),
    comments: n(o && o.comments),
    shares: n(o && o.shares),
    // Composition stays null until somebody actually classifies the commenters. features.score()
    // refuses to rank without it, which is the correct answer rather than falling back to reach.
    audience: total ? { ...a, total } : null,
    fetchedAt: (o && o.fetchedAt) || null,
  };
}

// PURE: the whole event log → current records, newest activity last. Bad events are collected rather
// than thrown, so one malformed line cannot hide the other 900.
export function fold(events = []) {
  const byId = new Map();
  const rejected = [];
  for (const ev of (Array.isArray(events) ? events : [])) {
    if (!ev || !ev.id) { rejected.push({ ev, error: 'no id' }); continue; }
    const r = applyEvent(byId.get(ev.id) || null, ev);
    if (!r.ok) { rejected.push({ ev, error: r.error }); continue; }
    byId.set(ev.id, r.record);
  }
  return { records: [...byId.values()], rejected };
}

export const byStatus = (records = [], status) =>
  (Array.isArray(records) ? records : []).filter((r) => r && r.status === status);

// PURE: is this post allowed to be published, as far as the LEDGER is concerned? Deliberately
// separate from policy.mjs — that one asks about switches and tiers, this one asks whether the
// history actually contains a yes.
export function ledgerClearsPublish(rec) {
  if (!rec) return { allow: false, reason: 'no such post' };
  if (rec.status !== 'scheduled') return { allow: false, reason: `post is ${rec.status}, not scheduled` };
  if (!String(rec.approvedBy || '').trim()) return { allow: false, reason: 'no approver in the history' };
  const approved = (rec.history || []).some((h) => h.type === 'approve');
  if (!approved) return { allow: false, reason: 'history has no approval event' };
  return { allow: true, reason: 'approved by ' + rec.approvedBy };
}

function pick(o, keys) {
  const out = {};
  for (const k of keys) if (o[k] !== undefined) out[k] = o[k];
  return out;
}

// ── IO ───────────────────────────────────────────────────────────────────────────────────────────

const yearOf = (ts) => String(ts || new Date().toISOString()).slice(0, 4);
const lines = (file) => {
  try {
    return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
  } catch { return []; }
};

export function append(ev) {
  const e = { ...ev, ts: ev.ts || new Date().toISOString() };
  fs.mkdirSync(STORE_DIR, { recursive: true });
  fs.appendFileSync(path.join(STORE_DIR, yearOf(e.ts) + '.jsonl'), JSON.stringify(e) + '\n');
  return e;
}

export function readEvents({ years = null } = {}) {
  let files = [];
  try { files = fs.readdirSync(STORE_DIR).filter((f) => /^\d{4}\.jsonl$/.test(f)).sort(); } catch { return []; }
  if (years) files = files.filter((f) => years.includes(f.slice(0, 4)));
  return files.flatMap((f) => lines(path.join(STORE_DIR, f)));
}

export const load = (opts) => fold(readEvents(opts));

// ── The claims log ───────────────────────────────────────────────────────────────────────────────
// One row per published post. There is deliberately NO update and NO delete exported from this file:
// the guarantee is structural, not a convention someone has to remember.
export function recordClaim({ id, text, platform, url = '', compliance = null, at = '' } = {}) {
  const row = {
    id: id || '',
    at: at || new Date().toISOString(),
    platform: platform || '',
    text: String(text || ''),
    url,
    // The full record that cleared it, not a boolean. "It passed" is not evidence; the rules it
    // passed and the version of them that ran are.
    compliance: compliance ? { ok: compliance.ok, blocks: compliance.blocks || [], warnings: compliance.warnings || [], checked: compliance.checked } : null,
  };
  fs.mkdirSync(CLAIMS_DIR, { recursive: true });
  fs.appendFileSync(path.join(CLAIMS_DIR, yearOf(row.at) + '.jsonl'), JSON.stringify(row) + '\n');
  return row;
}

export function readClaims() {
  let files = [];
  try { files = fs.readdirSync(CLAIMS_DIR).filter((f) => /^\d{4}\.jsonl$/.test(f)).sort(); } catch { return []; }
  return files.flatMap((f) => lines(path.join(CLAIMS_DIR, f)));
}
