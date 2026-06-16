// Reports — aggregates the append-only event store into period reports (day/week/month/quarter/year).
// Deterministic: the numbers come from code over the log, not from an LLM (doctrine §0). The companion
// can then narrate/expand the `text` summary, but the figures are trustworthy.

import { readEvents, pendingApprovals } from './store.mjs';
import { computeKpis } from './kpis.mjs';

const POD_NAMES = {
  exec: 'Executive', 'chief-of-staff': 'Chief of Staff', gov: 'Gov War Room', fiverr: 'Fiverr Studio',
  saas: 'Software Lab', vault: 'Knowledge Vault', 're': 'Real Estate', legal: 'Legal & Contracts',
  personal: 'Personal Office', 'research-risk': 'Research & Risk', content: 'Content Lab', system: 'System',
};
const round = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// PURE: the ISO timestamp marking the start of the requested period, relative to `now`. Eval-tested.
export function periodStart(period = 'week', now = new Date()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  switch (period) {
    case 'day': break;
    case 'week': d.setDate(d.getDate() - 6); break;            // trailing 7 days incl today
    case 'month': d.setDate(d.getDate() - 29); break;
    case 'quarter': d.setDate(d.getDate() - 90); break;
    case 'year': d.setDate(d.getDate() - 364); break;
    default: d.setDate(d.getDate() - 6);
  }
  return d.toISOString();
}

// PURE: roll a list of events up into totals + per-pod breakdown. Eval-tested.
export function aggregate(events) {
  const totals = { events: events.length, actions: 0, drafts: 0, approvals_opened: 0, approvals_resolved: 0, errors: 0, spend_usd: 0, revenue_usd: 0 };
  const pods = {};
  const draftActions = new Set(['draft', 'order.produced', 'sub.outreach.draft', 'progress.report.draft', 'ticket.reply.draft']);
  for (const e of events) {
    const pod = e.pod || 'system';
    const p = (pods[pod] ||= { pod, name: POD_NAMES[pod] || pod, actions: 0, drafts: 0, approvals: 0, errors: 0, recent: [] });
    if (e.kind === 'action') { totals.actions++; p.actions++; }
    if (e.kind === 'approval.request') { totals.approvals_opened++; p.approvals++; }
    if (e.kind === 'approval.decision') totals.approvals_resolved++;
    if (draftActions.has(e.action)) { totals.drafts++; p.drafts++; }
    if (e.status === 'error') { totals.errors++; p.errors++; }
    totals.spend_usd += e.cost_usd || 0;
    totals.revenue_usd += (e.payload && Number(e.payload.revenue_usd)) || 0;
    if (e.rationale && p.recent.length < 5 && e.kind !== 'trace') p.recent.push({ ts: e.ts, action: e.action, note: e.rationale.slice(0, 90) });
  }
  totals.spend_usd = round(totals.spend_usd);
  totals.revenue_usd = round(totals.revenue_usd);
  return { totals, pods: Object.values(pods).sort((a, b) => b.actions - a.actions) };
}

function summarize(period, agg, needs) {
  const t = agg.totals;
  const active = agg.pods.filter((p) => p.actions > 0).map((p) => p.name);
  const bits = [
    `Over the last ${period}: ${t.actions} actions across ${active.length} department(s)`,
    `${t.drafts} item(s) prepared`,
    `${needs.length} awaiting your approval`,
    `$${t.spend_usd} spent`,
  ];
  if (t.errors) bits.push(`${t.errors} error(s) to review`);
  return bits.join(' · ') + '.';
}

// Builds the full report for a period (reads the store). Returns structured data + a readable summary.
export function buildReport(period = 'week', now = new Date()) {
  const since = periodStart(period, now);
  const events = readEvents().filter((e) => e.ts >= since);
  const agg = aggregate(events);
  const needs = pendingApprovals().map((a) => ({ id: a.id, pod: POD_NAMES[a.pod] || a.pod, action: a.action, rationale: a.rationale, ts: a.ts }));
  let kpis = {};
  try { kpis = computeKpis().system || {}; } catch { /* */ }
  return {
    period, since, until: now.toISOString(),
    totals: agg.totals,
    pods: agg.pods,
    needs_you: needs,
    kpis,
    text: summarize(period, agg, needs),
  };
}
