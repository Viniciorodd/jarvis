// Regression suite for the reports engine's pure core (control-plane/reports.mjs).
// Pins the period windowing + event aggregation — if these drift, your numbers lie.

import { periodStart, aggregate, operatorKpis, kpiLine } from '../control-plane/reports.mjs';

const now = new Date('2026-06-16T12:00:00');
const daysBetween = (a, b) => Math.floor((new Date(b) - new Date(a)) / 86400000);

// KPI-strip fixture: a mix of in-window and out-of-window events, one resolved + one open approval.
const kEvents = [
  { kind: 'action', pod: 'gov', action: 'send', cost_usd: 0.10, ts: '2026-06-16T08:00:00Z' },      // send, today
  { kind: 'action', pod: 'gov', action: 'submit', cost_usd: 0.20, ts: '2026-06-12T08:00:00Z' },    // send, this week
  { kind: 'action', pod: 'gov', action: 'proposal.draft', cost_usd: 0.05, ts: '2026-06-14T08:00:00Z' }, // draft, this week
  { kind: 'action', pod: 'gov', action: 'send', cost_usd: 0.99, ts: '2026-06-01T08:00:00Z' },      // send, OUT of week (in month)
  { kind: 'action', pod: 'exec', action: 'revenue', payload: { amount_usd: 1500 }, cost_usd: 0, ts: '2026-06-13T08:00:00Z' },
  { kind: 'approval.request', id: 'a1', pod: 'gov', action: 'submit', ts: '2026-06-15T08:00:00Z' }, // OPEN
  { kind: 'approval.request', id: 'a2', pod: 'gov', action: 'send', ts: '2026-06-15T09:00:00Z' },   // resolved below
  { kind: 'approval.decision', ref: 'a2', pod: 'gov', action: 'approve', ts: '2026-06-15T10:00:00Z' },
];

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

    // ── operator KPI strip (WS6 panel) ──
    { name: 'operatorKpis: sends_this_week counts only in-window send/submit (2, not the 3-week-old one)',
      run: () => { const k = operatorKpis(kEvents, now); return { pass: k.sends_this_week === 2, detail: 'sends=' + k.sends_this_week }; } },
    { name: 'operatorKpis: drafts_this_week counts the proposal draft',
      run: () => { const k = operatorKpis(kEvents, now); return { pass: k.drafts_this_week === 1, detail: 'drafts=' + k.drafts_this_week }; } },
    { name: 'operatorKpis: approvals_pending = open requests only (a1 open, a2 resolved → 1)',
      run: () => { const k = operatorKpis(kEvents, now); return { pass: k.approvals_pending === 1, detail: 'pending=' + k.approvals_pending }; } },
    { name: 'operatorKpis: ai_spend windows nest (today ≤ week ≤ month)',
      run: () => { const k = operatorKpis(kEvents, now); return { pass: k.ai_spend_today_usd <= k.ai_spend_week_usd && k.ai_spend_week_usd <= k.ai_spend_month_usd, detail: `${k.ai_spend_today_usd}/${k.ai_spend_week_usd}/${k.ai_spend_month_usd}` }; } },
    { name: 'operatorKpis: ai_spend_week sums in-window cost (0.10+0.20+0.05=0.35), excludes the old send',
      run: () => { const k = operatorKpis(kEvents, now); return { pass: k.ai_spend_week_usd === 0.35, detail: 'wk=' + k.ai_spend_week_usd }; } },
    { name: 'operatorKpis: revenue_week sums banked revenue in window',
      run: () => { const k = operatorKpis(kEvents, now); return { pass: k.revenue_week_usd === 1500, detail: 'rev=' + k.revenue_week_usd }; } },
    { name: 'kpiLine renders sends + spend + banked',
      run: () => { const line = kpiLine(operatorKpis(kEvents, now)); return { pass: /2 send/.test(line) && /AI spend \$0\.35/.test(line) && /\$1500 banked/.test(line), detail: line }; } },
  ],
};
