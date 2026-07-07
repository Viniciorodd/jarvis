// Status assembler — the ONE place the estimator, buckets, and debt desk fuse into "the line" the
// operator sees on Home + the morning brief. PURE core (buildStatus) + a thin I/O wrapper (taxStatus).
// CLI: node pods/tax/status.mjs

import { TY2026 } from './constants-2026.mjs';
import { estimate, quarterlies, k1Share, annualDepreciation } from './engine.mjs';
import { readLedger, summarize, resolveLedger } from './ledger.mjs';
import { bucketState, nudgeLine } from './savings.mjs';
import { loadDebts, paymentsDue } from './debt.mjs';
import { loadRegistry } from './capture.mjs';
import { taxDeadlines } from './deadlines.mjs';

const usd = (c) => '$' + Math.round(c / 100).toLocaleString('en-US');

export function buildStatus({ entries, registry, debts, C, todayISO, taxYear }) {
  const bookYear = taxYear || Number(String(todayISO).slice(0, 4));
  const live = resolveLedger(entries);
  const sum = summarize(entries, registry);
  const llcEntity = (registry.entities || []).find((e) => e.kind === 'partnership') || { ownershipPct: 0 };
  // Depreciation is a real LLC-book expense (per property, from basis + in-service). Properties
  // without setup contribute 0 — understate deductions, never overstate.
  const deprCents = (registry.properties || [])
    .filter((p) => p.entity === llcEntity.id)
    .reduce((s, p) => s + annualDepreciation({ basisCents: p.basisCents, inServiceISO: p.inService, taxYear: bookYear, C }), 0);
  const llcNetCents = sum.llcBooks.netCents - deprCents;
  const k1NetCents = k1Share(llcNetCents, llcEntity.ownershipPct || 0);
  const schCNetCents = Object.entries(sum.schCByEntity).map(([id, b]) => ({ id, netCents: b.netCents }));
  const est = estimate({ C, schCNetCents, k1NetCents, otherIncomeCents: 0,
    localEitRatePct: (registry.localEitRatePct && registry.localEitRatePct.value) || 0,
    estPaidCents: sum.estPaidCents });
  // NOTE (Phase 2): treats all est-tax payments as federal for the safe-harbor voucher. Split
  // meta:est-tax-payment into fed/PA/local when the importer starts capturing real payments.
  const q = quarterlies({ C, projectedTaxCents: est.totalCents, priorYearTaxCents: 0, priorAgiCents: 0,
    paidCents: sum.estPaidCents, todayISO });
  const rates = { ...registry.splits, taxPct: registry.splits.taxPct === 'auto' ? est.setAsidePct : registry.splits.taxPct };
  // needs_review entries are excluded here for the SAME reason summarize() skips them — the bucket
  // nudge and the tax estimate must always agree on which entries counted.
  const incomeEvents = live.filter((e) => e && !e.error && e.status !== 'needs_review' && e.category && e.category.startsWith('income:'))
    .map((e) => ({ cents: e.cents }));
  const buckets = bucketState({ incomeEvents, movedEvents: [], rates });
  const due = paymentsDue({ debts, todayISO });
  const needsReview = live.filter((e) => e && !e.error && e.status === 'needs_review').length;
  const warnings = [];
  for (const k of C.unverified()) warnings.push(`TY${C.year} constant "${k}" not yet verified against the official source`);
  if (registry.localEitRatePct && registry.localEitRatePct.verified === false) warnings.push('local EIT rate is a placeholder — set your municipality rate in entities.json');
  for (const d of debts) if (d.setup) warnings.push(`debt "${d.id}": ${d.setup}`);
  for (const p of registry.properties || []) if (p.setup) warnings.push(`property "${p.id}": ${p.setup}`);
  if (needsReview > 0) warnings.push(`${needsReview} captured item(s) need a quick review before they count`);
  const nextVoucher = q.remaining[0] || null;
  const headline = `Set aside ${est.setAsidePct}% of every dollar in · tax bucket target ${usd(buckets.target.tax)}`
    + (nextVoucher ? ` · next quarterly ~${usd(nextVoucher.amountCents)} due ${nextVoucher.due}` : '');
  // Full self-employed deadline calendar (est-tax + 1099-NEC + 1065 + 1040), trimmed to what's actually
  // near — the year arg is advisory only (deadlines.mjs derives statutory dates from todayISO).
  const upcomingDeadlines = taxDeadlines({ year: C.year, C, nextVoucher, todayISO }).filter((d) => d.daysUntil <= 45);
  return { headline, setAsidePct: est.setAsidePct, estimate: est, nextVoucher, buckets,
    nudge: nudgeLine(buckets), paymentsDue: due, flags: est.flags, warnings, needsReview, upcomingDeadlines };
}

export async function taxStatus() {
  const registry = loadRegistry();
  const year = registry.taxYear || TY2026.year;
  const entries = readLedger(year);
  const debts = loadDebts().debts || [];
  const status = buildStatus({ entries, registry, debts, C: TY2026, todayISO: new Date().toLocaleDateString('en-CA'), taxYear: year });
  // docsIndexed is additive I/O (reads tax-docs/index.json) — kept out of buildStatus to preserve its purity.
  let docsIndexed = 0;
  try { const { loadIndex } = await import('./docs-index.mjs'); docsIndexed = loadIndex().docs.length; } catch { docsIndexed = 0; }
  return { ...status, docsIndexed };
}

if (process.argv[1] && process.argv[1].endsWith('status.mjs')) {
  taxStatus().then((s) => {
    console.log('\n' + s.headline + '\n');
    if (s.paymentsDue.length) console.log('Payments: ' + s.paymentsDue.map((p) => `${p.creditor} in ${p.daysUntil}d`).join(' · '));
    console.log(s.nudge);
    for (const w of s.warnings) console.log('⚠ ' + w);
  });
}
