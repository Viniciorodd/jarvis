// kpis.mjs — the two KPI layers (doctrine §10), computed deterministically from the event store.
// Layer 1 = business (per pod). Layer 2 = system/agent metrics — "how do you KNOW it's working,
// and what does it cost to be right?" — the questions a quant/eng lead asks first.

import { readEvents, todaySpendUsd, pendingApprovals } from './store.mjs';

export function computeKpis() {
  const events = readEvents();
  const actions = events.filter((e) => e.kind === 'action');
  const requests = events.filter((e) => e.kind === 'approval.request');
  const decisions = events.filter((e) => e.kind === 'approval.decision');
  const edits = decisions.filter((e) => (e.payload?.decision || e.action) === 'edit');
  const errors = events.filter((e) => e.status === 'error');
  const revenue = events.filter((e) => e.kind === 'action' && e.action === 'revenue')
    .reduce((s, e) => s + (e.payload?.amount_usd || 0), 0);
  const costTotal = round(events.reduce((s, e) => s + (e.cost_usd || 0), 0));
  const totalActions = actions.length || 1;

  // Layer 2 — system / agent
  const system = {
    autonomy_ratio: ratio(actions.filter((e) => !e.payload?.gated).length, totalActions),
    human_edit_rate: ratio(edits.length, decisions.length || 1),
    escalation_rate: ratio(requests.length, totalActions),
    cost_per_action_usd: round(costTotal / totalActions),
    roic_of_compute: costTotal > 0 ? round(revenue / costTotal) : null, // value per $1 of API spend
    incident_rate: ratio(errors.length, events.length || 1),
    cost_total_usd: costTotal,
    cost_today_usd: todaySpendUsd(),
    events_logged: events.length,
  };

  // Layer 1 — per pod
  const pods = {};
  for (const e of events) {
    const p = (pods[e.pod] = pods[e.pod] || { actions: 0, cost_usd: 0, revenue_usd: 0, pending: 0 });
    if (e.kind === 'action') p.actions++;
    p.cost_usd = round(p.cost_usd + (e.cost_usd || 0));
    if (e.action === 'revenue') p.revenue_usd = round(p.revenue_usd + (e.payload?.amount_usd || 0));
  }
  for (const a of pendingApprovals()) { (pods[a.pod] = pods[a.pod] || { actions: 0, cost_usd: 0, revenue_usd: 0, pending: 0 }).pending++; }

  return { system, pods, revenue_total_usd: round(revenue) };
}

function ratio(n, d) { return Math.round((n / (d || 1)) * 1000) / 1000; }
function round(n) { return Math.round(n * 1000) / 1000; }
