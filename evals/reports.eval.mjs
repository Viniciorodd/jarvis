// Regression suite for the reports engine's pure core (control-plane/reports.mjs).
// Pins the period windowing + event aggregation — if these drift, your numbers lie.

import { periodStart, aggregate } from '../control-plane/reports.mjs';

const now = new Date('2026-06-16T12:00:00');
const daysBetween = (a, b) => Math.floor((new Date(b) - new Date(a)) / 86400000);

const events = [
  { kind: 'action', pod: 'gov', action: 'scan', cost_usd: 0.01, ts: '2026-06-16T08:00:00Z' },
  { kind: 'action', pod: 'gov', action: 'draft', cost_usd: 0.05, ts: '2026-06-16T09:00:00Z' },
  { kind: 'approval.request', pod: 'gov', action: 'submit', ts: '2026-06-16T09:05:00Z' },
  { kind: 'action', pod: 'fiverr', action: 'order.produced', cost_usd: 0, ts: '2026-06-16T10:00:00Z' },
  { kind: 'action', pod: 'saas', action: 'ticket.reply.draft', status: 'error', cost_usd: 0.02, ts: '2026-06-16T11:00:00Z' },
  { kind: 'trace', pod: 'gov', action: 'router.classify', ts: '2026-06-16T08:01:00Z' },
];

export default {
  agent: 'reports',
  cases: [
    { name: 'day period starts at today 00:00', run: () => { const s = periodStart('day', now); return { pass: daysBetween(s, now) === 0, detail: s }; } },
    { name: 'week period starts 6 days back', run: () => { const s = periodStart('week', now); return { pass: daysBetween(s, now) === 6, detail: s }; } },
    { name: 'month period starts 29 days back', run: () => { const s = periodStart('month', now); return { pass: daysBetween(s, now) === 29, detail: s }; } },
    { name: 'year period starts 364 days back', run: () => { const s = periodStart('year', now); return { pass: daysBetween(s, now) === 364, detail: s }; } },
    { name: 'aggregate counts actions (excludes traces + approvals)', run: () => { const a = aggregate(events); return { pass: a.totals.actions === 4, detail: 'actions=' + a.totals.actions }; } },
    { name: 'aggregate counts drafts (draft + produced + reply.draft)', run: () => { const a = aggregate(events); return { pass: a.totals.drafts === 3, detail: 'drafts=' + a.totals.drafts }; } },
    { name: 'aggregate counts opened approvals + errors', run: () => { const a = aggregate(events); return { pass: a.totals.approvals_opened === 1 && a.totals.errors === 1, detail: `appr=${a.totals.approvals_opened} err=${a.totals.errors}` }; } },
    { name: 'aggregate sums spend', run: () => { const a = aggregate(events); return { pass: a.totals.spend_usd === 0.08, detail: 'spend=' + a.totals.spend_usd }; } },
    { name: 'aggregate breaks down by pod, gov busiest', run: () => { const a = aggregate(events); return { pass: a.pods[0].pod === 'gov', detail: a.pods.map((p) => p.pod + ':' + p.actions).join(',') }; } },
  ],
};
