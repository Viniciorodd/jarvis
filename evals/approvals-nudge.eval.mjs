// Regression suite for the business-hours approvals nudge + the container-clock fix.
// Pins two contracts that keep "WHEN Jarvis talks" sane:
//   (1) TIMEZONE — the three NAS services (control-plane / scheduler / telegram-bridge) pin
//       TZ=America/New_York in docker-compose and the shared image installs tzdata, so
//       scheduler.mjs's now.getHours() means TRUE local hours (no more 4-5 AM ET Telegrams).
//   (2) NUDGE WIRING — schedule.json fires /maintenance/approvals-nudge at 12 + 16 local via the
//       pure dueJobs() (working-hours guarded), and the server route enforces the calm contract:
//       weekend skip, silent when no gates, ≤2/day via date+slot dedup (slot boundary = hour < 14).
// dueJobs/loadPolicy are pure exports of control-plane/scheduler.mjs (its main-guard keeps the
// interval loop from starting on import); the route/compose/Dockerfile contracts are pinned as
// source-text invariants since server.js is a live CommonJS server (importing it would listen).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dueJobs, loadPolicy } from '../control-plane/scheduler.mjs';

const ok = (pass, detail = '') => ({ pass, detail });
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

const policy = loadPolicy();
const job = (id) => (policy.jobs || []).find((j) => j.id === id);
// Local-time Date helper (months are 0-based). dueJobs ignores weekday for these jobs (no at_dow —
// weekdays are enforced inside the route), so any calendar day works.
const at = (h, m = 0) => new Date(2026, 6, 15, h, m);
const ids = (due) => due.map((j) => j.id);

export default {
  agent: 'approvals-nudge',
  cases: [
    { name: 'schedule.json: both nudge jobs exist, at 12 + 16, POSTing /maintenance/approvals-nudge (route enforces weekdays)', run: () => {
      const mid = job('approvals-nudge-midday'), aft = job('approvals-nudge-afternoon');
      return ok(!!mid && !!aft
        && mid.at_hour === 12 && aft.at_hour === 16
        && mid.endpoint === '/maintenance/approvals-nudge' && aft.endpoint === '/maintenance/approvals-nudge'
        && mid.type === 'maintenance' && aft.type === 'maintenance'
        && mid.cadence_hours === 24 && aft.cadence_hours === 24
        && mid.at_dow == null && aft.at_dow == null, JSON.stringify({ mid, aft }));
    } },
    { name: 'dueJobs at 12:05 local → midday due, afternoon not yet (hour < 16)', run: () => {
      const due = ids(dueJobs(policy, at(12, 5), {}));
      return ok(due.includes('approvals-nudge-midday') && !due.includes('approvals-nudge-afternoon'), due.join(','));
    } },
    { name: 'dueJobs at 16:05 with midday already run today → afternoon due, midday rests (daily anchor)', run: () => {
      const due = ids(dueJobs(policy, at(16, 5), { 'approvals-nudge-midday': at(12, 5).toISOString() }));
      return ok(due.includes('approvals-nudge-afternoon') && !due.includes('approvals-nudge-midday'), due.join(','));
    } },
    { name: 'dueJobs at 4 AM local → NOTHING fires (working_hours guard — the 4-5 AM Telegram bug stays dead)', run: () => {
      const due = ids(dueJobs(policy, at(4, 0), {}));
      return ok(due.length === 0, due.join(',') || 'empty');
    } },
    { name: 'next-day reset: midday ran yesterday → due again at 12:05 today', run: () => {
      const due = ids(dueJobs(policy, at(12, 5), { 'approvals-nudge-midday': new Date(2026, 6, 14, 12, 5).toISOString() }));
      return ok(due.includes('approvals-nudge-midday'), due.join(','));
    } },
    { name: 'docker-compose pins TZ=${TZ:-America/New_York} on control-plane + scheduler + telegram-bridge', run: () => {
      const yml = read('docker-compose.yml');
      const hits = (yml.match(/TZ: \$\{TZ:-America\/New_York\}/g) || []).length;
      return ok(hits >= 3, `found ${hits} TZ pins (need 3)`);
    } },
    { name: 'control-plane Dockerfile installs tzdata (alpine needs it for TZ to resolve)', run: () => {
      return ok(/RUN apk add --no-cache tzdata/.test(read('control-plane', 'Dockerfile')));
    } },
    { name: 'server route wiring: endpoint exists, slot boundary hour<14, date+slot dedup on approvals.nudged, weekend + no-gates skips, ≤3 one-liners', run: () => {
      const src = read('control-plane', 'server.js');
      const block = src.split("p === '/maintenance/approvals-nudge'")[1] || '';
      const pins = {
        route: src.includes("p === '/maintenance/approvals-nudge'"),
        slot: block.includes("now.getHours() < 14 ? 'midday' : 'afternoon'"),
        dedupKind: block.includes("kind: 'approvals.nudged'"),
        dedupKey: block.includes('e.payload.date === today && e.payload.slot === slot'),
        weekend: block.includes("skipped: 'weekend'"),
        noGates: block.includes("skipped: 'no gates'"),
        top3: block.includes('pending.slice(0, 3)'),
        header: block.includes('waiting on you'),
        footer: block.includes('or the cockpit to approve'),
      };
      const missing = Object.entries(pins).filter(([, v]) => !v).map(([k]) => k);
      return ok(missing.length === 0, missing.length ? 'missing: ' + missing.join(',') : '');
    } },
  ],
};
