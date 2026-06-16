// Regression suite for the conservative scheduler's pure dueJobs() logic.
// If this regresses, agents could wake outside hours or re-fire — i.e. burn tokens. That's the failure
// this pins: the token-discipline the operator explicitly asked for.

import { dueJobs } from '../control-plane/scheduler.mjs';

const policy = {
  working_hours: { start: 7, end: 21 },
  jobs: [
    { id: 'gov-scan', type: 'scan', at_hour: 8, cadence_hours: 24 },
    { id: 'order-poll', type: 'poll', cadence_hours: 4 },
    { id: 'weekly', type: 'reflect', at_hour: 18, at_dow: 0, cadence_hours: 168 },
  ],
};
// Fixed reference points (local time). 2026-06-15 is a Monday.
const at = (h, m = 0, d = 15) => new Date(2026, 5, d, h, m);
const ids = (now, last = {}) => dueJobs(policy, now, last).map((j) => j.id);

export default {
  agent: 'scheduler',
  cases: [
    { name: 'nothing fires outside working hours (3am = rest)',
      run: () => { const r = ids(at(3)); return { pass: r.length === 0, detail: 'due=' + JSON.stringify(r) }; } },
    { name: 'gov scan fires at its 08:00 anchor when not yet run today',
      run: () => { const r = ids(at(8, 5)); return { pass: r.includes('gov-scan'), detail: 'due=' + JSON.stringify(r) }; } },
    { name: 'gov scan does NOT re-fire later the same day',
      run: () => { const r = ids(at(14), { 'gov-scan': at(8, 1).toISOString() }); return { pass: !r.includes('gov-scan'), detail: 'due=' + JSON.stringify(r) }; } },
    { name: 'order poll fires when last run was 5h ago (cadence 4h)',
      run: () => { const r = ids(at(13), { 'order-poll': at(8).toISOString() }); return { pass: r.includes('order-poll'), detail: 'due=' + JSON.stringify(r) }; } },
    { name: 'order poll does NOT fire when last run was 1h ago',
      run: () => { const r = ids(at(13), { 'order-poll': at(12).toISOString() }); return { pass: !r.includes('order-poll'), detail: 'due=' + JSON.stringify(r) }; } },
    { name: 'weekly reflection fires Sunday 18:00, not on a Monday',
      run: () => {
        const monday = ids(at(18, 0, 15));            // 2026-06-15 = Monday
        const sunday = ids(at(18, 0, 14));            // 2026-06-14 = Sunday
        return { pass: !monday.includes('weekly') && sunday.includes('weekly'), detail: `mon=${monday} sun=${sunday}` };
      } },
    { name: 'first-ever run (no history) fires the due anchors at 08:00',
      run: () => { const r = ids(at(8, 30)); return { pass: r.includes('gov-scan') && r.includes('order-poll'), detail: 'due=' + JSON.stringify(r) }; } },
  ],
};
