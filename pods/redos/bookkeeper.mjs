// bookkeeper.mjs — the only source of truth for REDOS revenue. Pure arithmetic over Gumroad sales.
//
// The KPI is net revenue banked. Not drafts written, not posts published, not agent runs. Both
// AppSumo's marketing guide and the Jarvis doctrine land on the same rule from different directions:
// "List size doesn't matter" and "never award XP for agent runs, only for money banked". So this
// module exposes money and distance-to-milestone, and refuses to expose an activity count that
// could be mistaken for progress.
//
// Two gates live here because they are revenue-triggered and the operator asked to be held to them:
//
//   PRD FREEZE. Nine feature PRDs are frozen until $10k net. Any agent asked to build one reads
//   prdFreeze and refuses with a reason instead of a vibe.
//
//   THE $10K DECISION. At $10k the plan says pick one of recurring revenue, a higher-ACV tier, or a
//   second product to the list, and that chasing it earlier is what kills companies at $1k. The
//   card raises once and then stays quiet.

export const MILESTONES = [
  { label: '$1k', net: 1000, note: 'hand-sold. No marketing required.' },
  { label: '$10k', net: 10000, note: 'affiliates plus the share loop. The decision point.' },
  { label: '$100k', net: 100000, note: 'three engines at once; none alone gets there.' },
];

export const PRD_FREEZE_UNTIL = 10000;
export const DECISION_AT = 10000;

/**
 * @param {Array} sales  Gumroad rows: { id, price, refunded, tier, affiliateCode, createdAt }
 *                       `price` is gross in dollars. Refunded rows are excluded from every total.
 * @param {object} o     { feeRate } Gumroad's cut. Default 0.10, overridable when the real rate is known.
 */
export function books(sales = [], o = {}) {
  const feeRate = Number.isFinite(o.feeRate) ? o.feeRate : 0.10;
  const live = sales.filter((s) => s && s.refunded !== true);

  const gross = round2(live.reduce((a, s) => a + (Number(s.price) || 0), 0));
  const net = round2(gross * (1 - feeRate));
  const refunded = sales.filter((s) => s && s.refunded === true).length;

  const byTier = {};
  for (const s of live) {
    const k = s.tier || 'unknown';
    byTier[k] = byTier[k] || { count: 0, gross: 0 };
    byTier[k].count += 1;
    byTier[k].gross = round2(byTier[k].gross + (Number(s.price) || 0));
  }

  const byAffiliate = {};
  for (const s of live) {
    if (!s.affiliateCode) continue;
    const k = s.affiliateCode;
    byAffiliate[k] = byAffiliate[k] || { count: 0, gross: 0, commissionOwed: 0 };
    byAffiliate[k].count += 1;
    byAffiliate[k].gross = round2(byAffiliate[k].gross + (Number(s.price) || 0));
    byAffiliate[k].commissionOwed = round2(byAffiliate[k].gross * 0.5);
  }

  const next = MILESTONES.find((m) => net < m.net) || null;
  const avgNet = live.length ? round2(net / live.length) : 0;

  return {
    sales: live.length,
    refunded,
    gross,
    net,
    avgNet,
    byTier,
    byAffiliate,
    nextMilestone: next
      ? { ...next, remaining: round2(next.net - net), salesRemaining: avgNet > 0 ? Math.ceil((next.net - net) / avgNet) : null }
      : null,
    prdFreeze: net < PRD_FREEZE_UNTIL,
    decisionDue: net >= DECISION_AT,
    line: line({ sales: live.length, net, next, avgNet }),
  };
}

/**
 * The cockpit one-thing. Deliberately a money sentence, never an activity count.
 * At zero it says so plainly, because "0 sales" is the honest state and hiding it helps nobody.
 */
function line({ sales, net, next, avgNet }) {
  if (sales === 0) return 'REDOS: 0 sales, $0 net. The product is finished enough. This is the only problem.';
  const head = `REDOS: ${sales} sale${sales === 1 ? '' : 's'}, $${net.toLocaleString()} net`;
  if (!next) return `${head}. Past every milestone on the plan.`;
  const n = avgNet > 0 ? Math.ceil((next.net - net) / avgNet) : null;
  return `${head}. ${n == null ? '' : `${n} more to `}${next.label}.`;
}

/**
 * Guard for any agent asked to build a frozen feature. Returns { allow, reason }.
 * Nine PRDs are frozen; the Council's finding was that the product is over-built with zero proof
 * anyone pays.
 */
export const FROZEN_PRDS = [
  'buy box', 'scheduler', 'design studio', 'vault', 'materials', 'takeoff',
  'document engine', 'template engine', 'pursue the deal', 'deal solver', 'continuity',
];

export function canBuildFeature(featureName = '', bookState = {}) {
  const n = String(featureName).toLowerCase();
  const frozen = FROZEN_PRDS.find((f) => n.includes(f));
  if (!frozen) return { allow: true, reason: 'not a frozen PRD' };
  if (bookState.prdFreeze === false) return { allow: true, reason: `past $${PRD_FREEZE_UNTIL} net; the freeze has lifted` };
  return {
    allow: false,
    reason: `"${frozen}" is one of nine PRDs frozen until $${PRD_FREEZE_UNTIL} net. Current net $${bookState.net ?? 0}. The Council: the product is over-built with zero proof anyone pays.`,
  };
}

const round2 = (n) => Math.round(n * 100) / 100;
