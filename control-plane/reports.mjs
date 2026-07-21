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

// Outbound "sends" and "drafts" the operator cares about (doctrine §10 layer-1). Kept explicit so the
// KPI strip counts real deliverables, not agent chatter.
const SEND_ACTIONS = new Set(['send', 'submit', 'sub.outreach.sent', 'order.delivered', 'ticket.reply.sent']);
const DRAFT_ACTIONS = new Set(['draft', 'proposal.draft', 'order.produced', 'sub.outreach.draft', 'progress.report.draft', 'ticket.reply.draft']);

// PURE: the operator-facing KPI strip. Trailing-7-day + today/month windows, INDEPENDENT of the report
// period, because the audit (WS6) asks specifically for "sends this week · replies pending · AI spend".
// Deterministic — numbers come from the event log, never an LLM. Eval-pinned.
export function operatorKpis(events, now = new Date()) {
  const wk = periodStart('week', now), day = periodStart('day', now), mo = periodStart('month', now);
  const inWk = events.filter((e) => e.ts >= wk), inMo = events.filter((e) => e.ts >= mo), inDay = events.filter((e) => e.ts >= day);
  const cost = (list) => round(list.reduce((s, e) => s + (e.cost_usd || 0), 0));
  // pending = approval.request events with no matching approval.decision.ref (mirrors store.pendingApprovals,
  // computed here from the passed log so the KPI strip stays pure/deterministic — approvals are all-time, not windowed)
  const resolved = new Set(events.filter((e) => e.kind === 'approval.decision' && e.ref).map((e) => e.ref));
  return {
    sends_this_week: inWk.filter((e) => e.kind === 'action' && SEND_ACTIONS.has(e.action)).length,
    drafts_this_week: inWk.filter((e) => DRAFT_ACTIONS.has(e.action)).length,
    approvals_pending: events.filter((e) => e.kind === 'approval.request' && !resolved.has(e.id)).length,
    ai_spend_today_usd: cost(inDay),
    ai_spend_week_usd: cost(inWk),
    ai_spend_month_usd: cost(inMo),
    revenue_week_usd: round(inWk.filter((e) => e.kind === 'action' && e.action === 'revenue').reduce((s, e) => s + (e.payload?.amount_usd || 0), 0)),
  };
}

// PURE: one readable line for the morning brief / Home glance.
export function kpiLine(k) {
  return `KPIs — ${k.sends_this_week} send(s) this week · ${k.drafts_this_week} drafted · ${k.approvals_pending} awaiting you · AI spend $${k.ai_spend_week_usd}/wk ($${k.ai_spend_today_usd} today)`
    + (k.revenue_week_usd ? ` · $${k.revenue_week_usd} banked this week` : '');
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
  const all = readEvents();
  const events = all.filter((e) => e.ts >= since);
  const agg = aggregate(events);
  const needs = pendingApprovals().map((a) => ({ id: a.id, pod: POD_NAMES[a.pod] || a.pod, action: a.action, rationale: a.rationale, ts: a.ts }));
  let kpis = {};
  try { kpis = computeKpis().system || {}; } catch { /* */ }
  const operator_kpis = operatorKpis(all, now); // trailing-week KPI strip, deterministic
  return {
    period, since, until: now.toISOString(),
    totals: agg.totals,
    pods: agg.pods,
    needs_you: needs,
    kpis,
    operator_kpis,
    text: summarize(period, agg, needs) + '\n' + kpiLine(operator_kpis),
  };
}
