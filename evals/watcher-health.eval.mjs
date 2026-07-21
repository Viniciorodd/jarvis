// Regression suite for the Watcher Health Contract (control-plane/watcher-health.mjs, L-013).
// The single proof (PRD §3.6): fiverr-order-watch, which has NEVER received an email, must report BLIND —
// not ✅. Plus: the BLIND-by-default invariant, one-way ever_received latch, delta-logging, no-push-on-clear.

import { computeState, headline, updateEntry, shouldLogFull, shouldPush, pushDecision, recordRun } from '../control-plane/watcher-health.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';

const ok = (pass, detail = '') => ({ pass, detail });
const now = new Date('2026-07-20T21:07:00Z');

const FIVERR = { channel: 'gmail:from:fiverr.com', ever_received: false, last_signal_at: null, expected_max_silence_days: 30, blocking_fix: 'Fiverr → Settings → Notifications → Email ON (Vinicio-only)' };
const GOVINBOX = { channel: 'gmail:SAM.gov+PA eAlert', ever_received: true, last_signal_at: '2026-07-19T12:00:00Z', expected_max_silence_days: 30 };

export default {
  agent: 'watcher-health',
  cases: [
    // ── the core invariant ──
    { name: 'THE PROOF: an unproven channel (never received) with no results → BLIND, not clear',
      run: () => ok(computeState(FIVERR, { newItems: 0, now }) === 'BLIND') },
    { name: 'a proven channel with nothing new → VERIFIED-CLEAR',
      run: () => ok(computeState(GOVINBOX, { newItems: 0, now }) === 'VERIFIED_CLEAR') },
    { name: 'any new item → SIGNAL (even on an unproven channel)',
      run: () => ok(computeState(FIVERR, { newItems: 1, now }) === 'SIGNAL') },
    { name: 'control probe FAILED (connector down) → BLIND even on a proven channel',
      run: () => ok(computeState(GOVINBOX, { newItems: 0, controlProbeOk: false, now }) === 'BLIND') },
    { name: 'proven but silent past expected cadence → SUSPECT',
      run: () => { const stale = { ...GOVINBOX, last_signal_at: '2026-05-01T00:00:00Z' }; return ok(computeState(stale, { newItems: 0, now }) === 'SUSPECT'); } },

    // ── headline leads with state + the blocking fix ──
    { name: 'BLIND headline leads with the state and names the blocking fix',
      run: () => { const h = headline('fiverr-order-watch', FIVERR, 'BLIND', { newItems: 0 }); return ok(h.startsWith('⚠️ BLIND') && /Fiverr → Settings/.test(h), h); } },
    { name: 'VERIFIED-CLEAR headline never claims all-clear language on a blind channel',
      run: () => { const h = headline('gov-inbox-watch', GOVINBOX, 'VERIFIED_CLEAR', {}); return ok(h.startsWith('✅ VERIFIED-CLEAR'), h); } },

    // ── ledger latch + delta logging ──
    { name: 'ever_received is a one-way latch (false→true on a signal, never back)',
      run: () => { const a = updateEntry(FIVERR, { newItems: 1, now }); const b = updateEntry(a, { newItems: 0, now: new Date('2026-07-21T00:00:00Z') }); return ok(a.ever_received === true && b.ever_received === true, `a=${a.ever_received} b=${b.ever_received}`); } },
    { name: 'checks_today increments same-day, resets on a new day',
      run: () => { const a = updateEntry({ ...GOVINBOX, last_checked_at: '2026-07-20T09:00:00Z', checks_today: 3 }, { newItems: 0, now }); const b = updateEntry(a, { newItems: 0, now: new Date('2026-07-21T09:00:00Z') }); return ok(a.checks_today === 4 && b.checks_today === 1, `a=${a.checks_today} b=${b.checks_today}`); } },
    { name: 'delta logging: same state twice → no full log; a state change → full log',
      run: () => ok(!shouldLogFull('VERIFIED_CLEAR', 'VERIFIED_CLEAR') && shouldLogFull('VERIFIED_CLEAR', 'BLIND') && shouldLogFull('X', 'SIGNAL')) },
    { name: 'never push on a clean run; BLIND/SIGNAL/SUSPECT are pushable states',
      run: () => ok(!shouldPush('VERIFIED_CLEAR') && shouldPush('BLIND') && shouldPush('SIGNAL') && shouldPush('SUSPECT')) },
    { name: 'push is transition-aware (anti-spam): SIGNAL always, newly-BLIND yes, repeat-BLIND no, clear never',
      run: () => ok(pushDecision('VERIFIED_CLEAR', 'SIGNAL') && pushDecision('BLIND', 'SIGNAL') && pushDecision('VERIFIED_CLEAR', 'BLIND') && !pushDecision('BLIND', 'BLIND') && !pushDecision('X', 'VERIFIED_CLEAR')) },

    // ── end-to-end over a temp ledger file ──
    { name: 'recordRun: fiverr says BLIND end-to-end; two no-change runs → no second full log',
      run: () => {
        const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wh-')), 'watcher-health.json');
        fs.writeFileSync(f, JSON.stringify({ 'fiverr-order-watch': FIVERR }));
        const r1 = recordRun('fiverr-order-watch', { newItems: 0, now }, { file: f });
        const r2 = recordRun('fiverr-order-watch', { newItems: 0, now: new Date('2026-07-20T22:00:00Z') }, { file: f });
        return ok(r1.state === 'BLIND' && /BLIND/.test(r1.headline) && r1.logFull === true && r1.push === true && r2.logFull === false && r2.push === false, `r1=${r1.state}/${r1.logFull}/${r1.push} r2=${r2.state}/${r2.logFull}/${r2.push}`);
      } },
  ],
};
