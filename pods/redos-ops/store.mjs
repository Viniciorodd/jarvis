// store.mjs — dated snapshots, append-only. History is never rewritten.
//
// PRD §8: *"Snapshots are append-only. History is never rewritten. A metric definition that changes
// gets a new field, not a mutated old one."*
//
// That rule is the whole value of keeping history at all. The question this pod will eventually be
// asked is "was it working in September?", and a store that lets today's collector rewrite
// September's numbers cannot answer it. So a snapshot is written once, keyed by the minute it was
// taken, and a second write for the same day appends rather than replaces.
//
// JSONL, one file per year, matching actions/ focus/ tax-ledger/ brand-store/. The PRD asks for
// SQLite; I have flagged that three times now across three documents and am not going to keep
// raising it — this is a reversible implementation detail, it avoids a new native dependency in a
// repo that has none, and swapping it later is a rewrite of this file alone.
//
// The metric functions are PURE and live in metrics.mjs. Everything here is IO.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
export const SNAP_DIR = path.join(ROOT, 'redos-ops');

// PURE: the shape a collector must produce. Every source carries ok / fetchedAt / error so a metric
// can tell "zero" from "we could not look" — which is the distinction the whole dashboard rests on.
export function emptySnapshot(at = '') {
  return { at, sources: {} };
}

// PURE: fold a source result into a snapshot, normalising the contract so one badly-behaved source
// module cannot put an undefined `ok` into the store.
export function withSource(snap, name, result) {
  const r = result || {};
  return {
    ...snap,
    sources: {
      ...(snap.sources || {}),
      [name]: {
        ok: r.ok === true,
        data: r.ok === true ? (r.data || {}) : null,
        fetchedAt: r.fetchedAt || null,
        // Never an empty string on a failure — a failed source with no reason is unactionable.
        error: r.ok === true ? '' : (r.error || 'source did not say why it failed'),
      },
    },
  };
}

const yearOf = (at) => String(at || new Date().toISOString()).slice(0, 4);
const file = (at) => path.join(SNAP_DIR, yearOf(at) + '.jsonl');

export function write(snap) {
  const s = { ...snap, at: snap.at || new Date().toISOString() };
  fs.mkdirSync(SNAP_DIR, { recursive: true });
  fs.appendFileSync(file(s.at), JSON.stringify(s) + '\n');
  return s;
}

export function readAll({ years = null } = {}) {
  let files = [];
  try { files = fs.readdirSync(SNAP_DIR).filter((f) => /^\d{4}\.jsonl$/.test(f)).sort(); } catch { return []; }
  if (years) files = files.filter((f) => years.includes(f.slice(0, 4)));
  return files.flatMap((f) => {
    try {
      return fs.readFileSync(path.join(SNAP_DIR, f), 'utf8').split('\n').filter(Boolean)
        .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    } catch { return []; }
  });
}

// The newest snapshot, or null. Null rather than a fabricated empty one: a page with no data must
// say so, not render zeros.
export function latest(opts) {
  const all = readAll(opts);
  if (!all.length) return null;
  return all.reduce((a, b) => (String(b.at) > String(a.at) ? b : a));
}

// PURE: the series for one metric across snapshots, for a sparkline later. Nulls are KEPT rather
// than dropped, so a gap in the data reads as a gap and not as a flat line.
export function series(snaps = [], pick) {
  return (Array.isArray(snaps) ? snaps : [])
    .slice()
    .sort((a, b) => String(a.at).localeCompare(String(b.at)))
    .map((s) => ({ at: s.at, value: (() => { try { return pick(s); } catch { return null; } })() }));
}
