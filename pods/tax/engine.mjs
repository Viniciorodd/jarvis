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
