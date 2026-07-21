// watcher-health.mjs — the Watcher Health Contract (PRD "Watcher Health Contract + Bid Fit Index", L-013).
// The burn: fiverr-order-watch logged ✅ "no new orders" ELEVEN times in one day from a channel that has
// never received a single email in its life. Eleven confident all-clears from a sensor that cannot see.
//
// The contract: every watcher reports ONE of three (optionally four) states, in its FIRST LINE, before any
// results. Core invariant — a watcher that has never received a single expected input is BLIND by default;
// "no results" from an unproven channel is NEVER "all clear." Pure + deterministic + eval-pinned.

import fs from 'node:fs';
import path from 'node:path';

export const STATES = { SIGNAL: '🔴 SIGNAL', VERIFIED_CLEAR: '✅ VERIFIED-CLEAR', BLIND: '⚠️ BLIND', SUSPECT: '🟠 SUSPECT' };
const DAY = 86400000;

// PURE: the state for a watcher this run. `entry` is its ledger record; `obs` is what this run observed.
//   obs = { newItems:int, controlProbeOk:bool|null, now:Date|iso }
// Order matters: a real signal wins; then BLIND-by-default for anything unproven/broken; then SUSPECT.
export function computeState(entry = {}, obs = {}) {
  const newItems = Number(obs.newItems) || 0;
  if (newItems > 0) return 'SIGNAL';
  // BLIND: never proven live, OR the control probe (a query with no filter) failed → the connector is down.
  if (!entry.ever_received || obs.controlProbeOk === false) return 'BLIND';
  // SUSPECT (optional 4th): proven once, but silent far past its expected cadence.
  const now = obs.now ? new Date(obs.now).getTime() : (entry.last_checked_at ? new Date(entry.last_checked_at).getTime() : 0);
  const last = entry.last_signal_at ? new Date(entry.last_signal_at).getTime() : 0;
  const maxDays = Number(entry.expected_max_silence_days) || 0;
  if (last && maxDays && (now - last) / DAY > maxDays) return 'SUSPECT';
  return 'VERIFIED_CLEAR';
}

// PURE: the headline — state FIRST, then the one fact that matters. BLIND leads with the blocking fix.
export function headline(watcher, entry = {}, state, obs = {}) {
  const newItems = Number(obs.newItems) || 0;
  const checks = Number(entry.checks_today) || 1;
  switch (state) {
    case 'SIGNAL': return `${STATES.SIGNAL} — ${newItems} new item${newItems === 1 ? '' : 's'} on ${watcher}. Act.`;
    case 'BLIND': return `${STATES.BLIND} — ${watcher}: channel unproven or broken, results are MEANINGLESS. Fix: ${entry.blocking_fix || 'confirm the channel is wired and receiving.'}`;
    case 'SUSPECT': return `${STATES.SUSPECT} — ${watcher}: proven once but silent past its expected cadence (>${entry.expected_max_silence_days}d). Verify the source still fires.`;
    default: return `${STATES.VERIFIED_CLEAR} — ${watcher}: channel live, nothing new (checked ${checks}× today).`;
  }
}

// PURE: advance the ledger entry for this run. ever_received only ever flips true→stays true (never back).
// Returns a NEW entry; also bumps checks_today (reset when the day rolls over).
export function updateEntry(entry = {}, obs = {}) {
  const now = obs.now ? new Date(obs.now) : new Date(entry.last_checked_at || 0);
  const nowIso = now.toISOString();
  const signalNow = (Number(obs.newItems) || 0) > 0;
  const prevDay = (entry.last_checked_at || '').slice(0, 10);
  const sameDay = prevDay === nowIso.slice(0, 10);
  const next = {
    ...entry,
    ever_received: !!entry.ever_received || signalNow,                 // one-way latch
    last_signal_at: signalNow ? nowIso : (entry.last_signal_at || null),
    last_checked_at: nowIso,
    checks_today: sameDay ? (Number(entry.checks_today) || 0) + 1 : 1, // reset on a new day
    control_probe_ok: obs.controlProbeOk == null ? (entry.control_probe_ok ?? null) : !!obs.controlProbeOk,
  };
  next.state = computeState(next, obs);
  return next;
}

// PURE: delta-logging decision (§3.3) — write a FULL log entry only on a state change or a 🔴 SIGNAL;
// otherwise update one counter line in place. Stops the eleven-near-identical-paragraphs problem.
export function shouldLogFull(prevState, newState) { return prevState !== newState || newState === 'SIGNAL'; }
// PURE: the pushable states (a clean run never pushes).
export function shouldPush(state) { return state === 'SIGNAL' || state === 'BLIND' || state === 'SUSPECT'; }
// PURE: the ACTUAL push decision (anti-spam): a SIGNAL always pushes; BLIND/SUSPECT push only on the
// TRANSITION into them, so a channel that stays BLIND for days doesn't re-notify every single run.
export function pushDecision(prevState, newState) { return newState === 'SIGNAL' || (shouldPush(newState) && prevState !== newState); }

// ── ledger IO ─────────────────────────────────────────────────────────────────────────────────────────
// The SEED (git-tracked, human-readable — PRD §3.2) holds initial states + the blocking fixes; the runtime
// copy lives in the gitignored data/ dir and self-updates each run. loadLedger overlays runtime on seed.
const HERE = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
export const SEED_PATH = path.join(HERE, 'watcher-health.seed.json');
export const LEDGER_PATH = process.env.WATCHER_HEALTH_PATH || path.join(HERE, 'data', 'watcher-health.json');

export function loadLedger(file = LEDGER_PATH) {
  let seed = {}, live = {};
  try { seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8')); } catch { /* seed optional */ }
  try { live = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* no runtime yet → seed only */ }
  return { ...seed, ...live }; // a watcher's live entry fully supersedes its seed entry
}
export function saveLedger(ledger, file = LEDGER_PATH) {
  try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(ledger, null, 2)); } catch { /* best-effort */ }
}

// Record one watcher run end-to-end: advance the ledger, persist it, and return the report the watcher
// should print (headline + whether to log-full / push). Does NOT itself send — the caller gates that.
export function recordRun(watcher, obs = {}, { file = LEDGER_PATH } = {}) {
  const ledger = loadLedger(file);
  const prev = ledger[watcher] || {};
  const next = updateEntry(prev, obs);
  ledger[watcher] = next;
  saveLedger(ledger, file);
  return { state: next.state, headline: headline(watcher, next, next.state, obs), logFull: shouldLogFull(prev.state, next.state), push: pushDecision(prev.state, next.state), entry: next };
}
