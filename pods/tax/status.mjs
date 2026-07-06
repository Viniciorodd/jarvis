// Status assembler — the ONE place the estimator, buckets, and debt desk fuse into "the line" the
// operator sees on Home + the morning brief. PURE core (buildStatus) + a thin I/O wrapper (taxStatus).
// CLI: node pods/tax/status.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TY2026 } from './constants-2026.mjs';
import { estimate, quarterlies, k1Share, annualDepreciation } from './engine.mjs';
import { readLedger, summarize } from './ledger.mjs';
import { bucketState, nudgeLine } from './savings.mjs';
import { loadDebts, paymentsDue } from './debt.mjs';
import { loadRegistry } from './capture.mjs';

const usd = (c) => '$' + Math.round(c / 100).toLocaleString('en-US');

export function buildStatus({ entries, registry, debts, C, todayISO }) {
  const sum = summarize(entries, registry);
  const llcEntity = (registry.entities || []).find((e) => e.kind === 'partnership') || { ownershipPct: 0 };
  // Depreciation is a real LLC-book expense (per property, from basis + in-service). Properties
  // without setup contribute 0 — understate deductions, never overstate.
  const year = Number(String(todayISO).slice(0, 4));
  const deprCents = (registry.properties || [])
    .filter((p) => p.entity === llcEntity.id)
    .reduce((s, p) => s + annualDepreciation({ basisCents: p.basisCents, inServiceISO: p.inService, taxYear: year, C }), 0);
  const llcNetCents = sum.llcBooks.netCents - deprCents;
  const k1NetCents = k1Share(llcNetCents, llcEntity.ownershipPct || 0);
  const schCNetCents = Object.entries(sum.schCByEntity).map(([id, b]) => ({ id, netCents: b.netCents }));
  const est = estimate({ C, schCNetCents, k1NetCents, otherIncomeCents: 0,
    localEitRatePct: (registry.localEitRatePct && registry.localEitRatePct.value) || 0,
    estPaidCents: sum.estPaidCents });
  const q = quarterlies({ C, projectedTaxCents: est.totalCents, priorYearTaxCents: 0, priorAgiCents: 0,
    paidCents: sum.estPaidCents, todayISO });
  const rates = { ...registry.splits, taxPct: registry.splits.taxPct === 'auto' ? est.setAsidePct : registry.splits.taxPct };
  const incomeEvents = entries.filter((e) => e && !e.error && e.category && e.category.startsWith('income:'))
    .map((e) => ({ cents: e.cents }));
  const buckets = bucketState({ incomeEvents, movedEvents: [], rates });
  const due = paymentsDue({ debts, todayISO });
  const warnings = [];
  for (const k of C.unverified()) warnings.push(`TY${C.year} constant "${k}" not yet verified against the official source`);
  if (registry.localEitRatePct && registry.localEitRatePct.verified === false) warnings.push('local EIT rate is a placeholder — set your municipality rate in entities.json');
  for (const d of debts) if (d.setup) warnings.push(`debt "${d.id}": ${d.setup}`);
  for (const p of registry.properties || []) if (p.setup) warnings.push(`property "${p.id}": ${p.setup}`);
  const nextVoucher = q.remaining[0] || null;
  const headline = `Set aside ${est.setAsidePct}% of every dollar in · tax bucket target ${usd(buckets.target.tax)}`
    + (nextVoucher ? ` · next quarterly ~${usd(nextVoucher.amountCents)} due ${nextVoucher.due}` : '');
  return { headline, setAsidePct: est.setAsidePct, estimate: est, nextVoucher, buckets,
    nudge: nudgeLine(buckets), paymentsDue: due, flags: est.flags, warnings };
}

export async function taxStatus() {
  const registry = loadRegistry();
  const year = registry.taxYear || TY2026.year;
  const entries = readLedger(year);
  const debts = loadDebts().debts || [];
  return buildStatus({ entries, registry, debts, C: TY2026, todayISO: new Date().toLocaleDateString('en-CA') });
}

if (process.argv[1] && process.argv[1].endsWith('status.mjs')) {
  taxStatus().then((s) => {
    console.log('\n' + s.headline + '\n');
    if (s.paymentsDue.length) console.log('Payments: ' + s.paymentsDue.map((p) => `${p.creditor} in ${p.daysUntil}d`).join(' · '));
    console.log(s.nudge);
    for (const w of s.warnings) console.log('⚠ ' + w);
  });
}
