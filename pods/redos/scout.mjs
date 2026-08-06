// scout.mjs — target roster + freshness. READ-ONLY on the outside world; never sends anything.
//
// The reason this file exists at all: on 2026-08-05 a reverification of the 2026-07-24 affiliate
// list found it wrong on four of ten targets after TWELVE DAYS. Two had gone dark, one had the
// opposite affiliate posture to what was recorded, and two follower counts were off by 2x and 5x
// in opposite directions. A stale roster is worse than no roster, because it produces a confident
// wrong email that burns a partner permanently.
//
// So every record carries verifiedAt, and policy.mjs refuses to send against a record older than
// REDOS_TARGET_STALE_DAYS. This module surfaces what needs rechecking before that bites.
//
// Two fields an agent must NEVER write: `replied` and `threadOpened`. Only the operator knows who
// actually answered, and those two flags are what separate a reply from cold outreach in policy.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rankTargets } from './partner-fit.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const TARGETS_FILE = path.join(HERE, 'targets.json');

const DAY = 86400000;

/** Load the roster. Throws rather than returning a partial list — a half-roster is a wrong roster. */
export function loadTargets(file = TARGETS_FILE) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(raw.targets)) throw new Error(`${file}: no targets array`);
  return raw.targets;
}

/** Days since a record was verified against live pages. null when the stamp is missing or bad. */
export function staleness(t, now = Date.now()) {
  const v = t && t.verifiedAt ? Date.parse(t.verifiedAt) : NaN;
  if (!Number.isFinite(v)) return null;
  return Math.floor((now - v) / DAY);
}

/**
 * Which records are too old to act on. `null` staleness counts as stale — an unstamped record
 * fails closed, same as in policy.mjs.
 */
export function needsReverification(targets, { staleDays = 14, now = Date.now() } = {}) {
  return targets.filter((t) => {
    const d = staleness(t, now);
    return d == null || d > staleDays;
  });
}

/**
 * The operator's working view: ranked, with staleness and hold state folded in.
 * Returns { sendable, held, stale, all } where `sendable` is what a draft may be built for today.
 */
export function roster({ file = TARGETS_FILE, staleDays = 14, now = Date.now() } = {}) {
  const targets = loadTargets(file);
  const ranked = rankTargets(targets).map((t) => ({ ...t, staleDays: staleness(t, now) }));

  const stale = ranked.filter((t) => t.staleDays == null || t.staleDays > staleDays);
  const staleIds = new Set(stale.map((t) => t.id));
  const held = ranked.filter((t) => t.held === true && !staleIds.has(t.id));
  const heldIds = new Set(held.map((t) => t.id));

  const sendable = ranked.filter(
    (t) => !staleIds.has(t.id) && !heldIds.has(t.id) && !t.fit.disqualified && t.fit.band !== 'HOLD'
  );

  return { sendable, held, stale, all: ranked };
}

/** One-line-per-target summary for the cockpit and the daily digest. */
export function rosterLines(r = roster()) {
  const line = (t) => `${String(t.fit.score).padStart(3)}  ${t.fit.band.padEnd(5)}  ${t.name}${t.org ? ` (${t.org})` : ''}`;
  const out = [];
  out.push(`SENDABLE (${r.sendable.length})`);
  r.sendable.forEach((t) => out.push('  ' + line(t)));
  if (r.held.length) {
    out.push(`HELD (${r.held.length}) — needs a human check first`);
    r.held.forEach((t) => out.push(`  ${line(t)}  ${t.heldReason ? '— ' + t.heldReason : ''}`));
  }
  if (r.stale.length) {
    out.push(`STALE (${r.stale.length}) — reverify before any send`);
    r.stale.forEach((t) => out.push(`  ${line(t)}  — ${t.staleDays == null ? 'no verifiedAt' : t.staleDays + 'd old'}`));
  }
  return out.join('\n');
}
