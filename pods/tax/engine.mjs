// PURE tax math for the Tax & Wealth pod (Sage / TAX-01) — no I/O, no LLM, integer cents in/out
// (doctrine directive #1: the LLM proposes, THIS CODE disposes). Every function is eval-pinned in
// evals/tax.eval.mjs with hand-computed known answers. C = a tax-year constants object (TY2026).

// Self-employment tax: net SE × 92.35% is the base; 12.4% SS capped at the wage base; 2.9% Medicare
// uncapped; +0.9% additional Medicare on the base over the (single) threshold. Returns the half-SE
// deduction too (half of the SS+Medicare 15.3% portion — the additional 0.9% is NOT halved).
export function seTax({ netSeCents, C }) {
  const n = Math.max(0, Math.round(netSeCents || 0));
  const baseCents = Math.round(n * C.seBase);
  const ssCents = Math.round(Math.min(baseCents, C.ssWageBaseCents) * C.seSsRate);
  const medicareCents = Math.round(baseCents * C.seMedicareRate);
  const addlMedicareCents = baseCents > C.addlMedicareThresholdCents
    ? Math.round((baseCents - C.addlMedicareThresholdCents) * C.addlMedicareRate) : 0;
  const totalCents = ssCents + medicareCents + addlMedicareCents;
  const halfCents = Math.round((ssCents + medicareCents) / 2);
  return { baseCents, ssCents, medicareCents, addlMedicareCents, totalCents, halfCents };
}

// Walk the single-filer brackets. taxable ≤ 0 → 0.
export function federalIncomeTax(taxableCents, C) {
  let t = Math.max(0, Math.round(taxableCents || 0)), tax = 0, lower = 0;
  for (const b of C.brackets.single) {
    const band = Math.min(t, b.uptoCents) - lower;
    if (band <= 0) break;
    tax += band * b.rate;
    lower = b.uptoCents;
  }
  return Math.round(tax);
}

// QBI (§199A) — simple below-threshold case ONLY: 20% of the lesser of QBI base or taxable income
// before QBI. At/over the threshold the phase-in rules kick in → we flag instead of guessing
// (conservative: deduction still computed the simple way, caller shows the flag).
export function qbiDeduction({ qbiBaseCents, taxableBeforeQbiCents, C }) {
  const base = Math.max(0, Math.round(qbiBaseCents || 0));
  const taxable = Math.max(0, Math.round(taxableBeforeQbiCents || 0));
  const deductionCents = Math.round(Math.min(base * C.qbiRate, taxable * C.qbiRate));
  return { deductionCents, overThreshold: taxable >= C.qbiThresholdCents.single };
}

// PA flat personal income tax (no standard deduction in PA).
export const paTax = (paTaxableCents, C) => Math.round(Math.max(0, paTaxableCents || 0) * C.paRate);

// Local earned-income tax — rate is the operator-config % (entities.json), applies to EARNED income
// (Schedule C), not rents.
export const localEit = (earnedCents, ratePct) => Math.round(Math.max(0, earnedCents || 0) * (ratePct / 100));

// Residential rental depreciation — 27.5-year straight line, MID-MONTH convention: the in-service
// year gets (12 − month + 0.5)/12 of a full year; later years a full 1/27.5. Missing basis or date →
// 0 (understate deductions, never overstate — the property shows "needs setup" instead).
export function annualDepreciation({ basisCents, inServiceISO, taxYear, C }) {
  const basis = Math.round(basisCents || 0);
  if (!basis || !inServiceISO) return 0;
  const inYear = Number(String(inServiceISO).slice(0, 4)), inMonth = Number(String(inServiceISO).slice(5, 7));
  if (!inYear || !inMonth || taxYear < inYear) return 0;
  const full = basis / C.residentialDeprYears;
  if (taxYear === inYear) return Math.round(full * ((12 - inMonth + 0.5) / 12));
  return Math.round(full);
}

// The operator's distributive share of the LLC (19%). Mother's share is the REMAINDER (llcNet − his),
// so the two always sum to exactly the LLC net — no lost cents.
export const k1Share = (llcNetCents, ownershipPct) => Math.round((llcNetCents || 0) * (ownershipPct / 100));

// The full estimate: Sch C profits → SE tax → AGI → QBI → taxable → federal; + PA + local EIT;
// K-1 share added as income when positive, EXCLUDED + FLAGGED when a loss (passive-limit caution —
// a pro/FreeTaxUSA decides whether the loss is usable; we never silently reduce the bill).
export function estimate({ C, schCNetCents = [], k1NetCents = 0, otherIncomeCents = 0,
  localEitRatePct = 0, estPaidCents = 0 }) {
  const flags = [];
  const schCTotal = schCNetCents.reduce((s, b) => s + Math.max(0, Math.round(b.netCents || 0)), 0);
  const se = seTax({ netSeCents: schCTotal, C });
  let k1 = Math.round(k1NetCents || 0);
  if (k1 < 0) { flags.push('k1-loss-excluded'); k1 = 0; }
  const other = Math.max(0, Math.round(otherIncomeCents || 0)); // e.g. 1099-C cancellation-of-debt
  const agiCents = schCTotal - se.halfCents + k1 + other;
  const qbiBaseCents = Math.max(0, schCTotal - se.halfCents) + k1; // both are QBI-eligible business income
  const taxableBeforeQbi = Math.max(0, agiCents - C.stdDeductionCents.single);
  const qbi = qbiDeduction({ qbiBaseCents, taxableBeforeQbiCents: taxableBeforeQbi, C });
  if (qbi.overThreshold) flags.push('qbi-over-threshold');
  const taxableCents = Math.max(0, taxableBeforeQbi - qbi.deductionCents);
  const federalCents = federalIncomeTax(taxableCents, C);
  const paCents = paTax(schCTotal + k1 + other, C); // PA taxes the classes of income, no std deduction
  const localCents = localEit(schCTotal, localEitRatePct); // EIT on earned income only, not rents
  const totalCents = se.totalCents + federalCents + paCents + localCents;
  const grossCents = schCTotal + k1 + other;
  const setAsidePct = grossCents > 0 ? Math.round((totalCents / grossCents) * 100) : 0;
  return { se, agiCents, qbiDeductionCents: qbi.deductionCents, taxableCents, federalCents, paCents,
    localCents, totalCents, estPaidCents: Math.round(estPaidCents || 0),
    remainingCents: Math.max(0, totalCents - Math.round(estPaidCents || 0)), setAsidePct, flags };
}

// IRS required-annual-payment rule: the LESSER of (90% of current-year projection) or (100% of
// prior-year tax; 110% if prior AGI > $150k). What's still owed is spread EVENLY over the due dates
// that are still in the future. basis says which leg won (shown to the operator).
export function quarterlies({ C, projectedTaxCents, priorYearTaxCents = 0, priorAgiCents = 0,
  paidCents = 0, todayISO }) {
  const currentLeg = Math.round((projectedTaxCents || 0) * C.safeHarbor.currentPct);
  const priorPct = priorAgiCents > C.safeHarbor.highAgiCents ? C.safeHarbor.priorHighPct : C.safeHarbor.priorPct;
  const priorLeg = priorYearTaxCents > 0 ? Math.round(priorYearTaxCents * priorPct) : Infinity;
  const requiredAnnualCents = Math.min(currentLeg, priorLeg);
  const basis = requiredAnnualCents === priorLeg && priorLeg !== Infinity ? 'prior-year' : 'current-year';
  const future = C.estDueDates.filter((d) => d > todayISO);
  const owed = Math.max(0, requiredAnnualCents - Math.round(paidCents || 0));
  const per = future.length ? Math.round(owed / future.length) : 0;
  return { requiredAnnualCents, basis, remaining: future.map((due) => ({ due, amountCents: per })) };
}
