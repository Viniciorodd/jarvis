// Regression suite for the Real-Estate Deal Calculator (pods/real-estate/deal-calc.mjs).
// Money math is code, not an LLM — so it must be pinned. Hand-verified worked example:
//   $200k price, 20% down ($40k), 7% / 30yr on $160k → P&I ≈ $1064.48/mo.
//   Rent $2000/mo (+$0 other) → $24k gross; 5% vacancy → EGI $22,800.
//   OpEx: taxes 3000 + ins 1200 + mgmt 8%·22800(1824) + maint 5%(1140) + capex 5%(1140) = 8304.
//   NOI = 22800 − 8304 = 14,496 → cap 7.25%. Debt 12,773.76 → cashflow $1,722.24/yr ($143.52/mo).
//   Cash in = 40000 + closing(6000) + 0 = 46000 → CoC 3.74%. DSCR 1.13. 1% rule 1.0%. GRM 8.33.

import { analyzeDeal, monthlyPayment, maxOfferForCapRate } from '../pods/real-estate/deal-calc.mjs';

const ok = (pass, detail = '') => ({ pass, detail });
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const DEAL = { price: 200000, downPct: 20, rate: 7, termYears: 30, monthlyRent: 2000, vacancyPct: 5, taxesAnnual: 3000, insuranceAnnual: 1200, mgmtPct: 8, maintPct: 5, capexPct: 5, closingCosts: 6000 };

export default {
  agent: 'real-estate-deal-calc',
  cases: [
    { name: 'monthlyPayment: $160k @ 7% / 30yr ≈ $1064.48',
      run: () => { const m = monthlyPayment(160000, 7, 30); return ok(near(m, 1064.48, 0.5), 'PI=' + m); } },
    { name: 'monthlyPayment: accepts rate as 0.07 the same as 7',
      run: () => ok(monthlyPayment(160000, 0.07, 30) === monthlyPayment(160000, 7, 30)) },
    { name: 'monthlyPayment: zero interest → straight-line principal/term',
      run: () => { const m = monthlyPayment(120000, 0, 30); return ok(near(m, 333.33, 0.01), 'PI=' + m); } },
    { name: 'analyzeDeal: loan = price − down (20% → $160k)',
      run: () => { const r = analyzeDeal(DEAL); return ok(r.inputs.loanAmount === 160000 && r.inputs.downAmount === 40000, JSON.stringify(r.inputs)); } },
    { name: 'analyzeDeal: EGI applies vacancy ($24k → $22.8k)',
      run: () => { const r = analyzeDeal(DEAL); return ok(r.income.egi === 22800, 'egi=' + r.income.egi); } },
    { name: 'analyzeDeal: NOI excludes debt service ($14,496)',
      run: () => { const r = analyzeDeal(DEAL); return ok(near(r.returns.noi, 14496, 1), 'noi=' + r.returns.noi); } },
    { name: 'analyzeDeal: cap rate ≈ 7.25%',
      run: () => { const r = analyzeDeal(DEAL); return ok(near(r.returns.capRate, 7.25, 0.05), 'cap=' + r.returns.capRate); } },
    { name: 'analyzeDeal: monthly cashflow ≈ $143.52',
      run: () => { const r = analyzeDeal(DEAL); return ok(near(r.returns.monthlyCashflow, 143.52, 1), 'cf=' + r.returns.monthlyCashflow); } },
    { name: 'analyzeDeal: cash-on-cash ≈ 3.74% on $46k invested',
      run: () => { const r = analyzeDeal(DEAL); return ok(r.returns.totalCashInvested === 46000 && near(r.returns.cashOnCash, 3.74, 0.1), `coc=${r.returns.cashOnCash} inv=${r.returns.totalCashInvested}`); } },
    { name: 'analyzeDeal: DSCR ≈ 1.13',
      run: () => { const r = analyzeDeal(DEAL); return ok(near(r.returns.dscr, 1.13, 0.02), 'dscr=' + r.returns.dscr); } },
    { name: 'analyzeDeal: 1% rule = 1.0 and reported met (no flag)',
      run: () => { const r = analyzeDeal(DEAL); return ok(r.returns.onePctRule === 1 && !r.flags.some((f) => /1% rule/.test(f)), 'one=' + r.returns.onePctRule); } },
    { name: 'analyzeDeal: a bad deal (low rent) flags DSCR<1 + negative cashflow',
      run: () => { const r = analyzeDeal({ ...DEAL, monthlyRent: 900 }); return ok(r.returns.dscr < 1 && r.returns.monthlyCashflow < 0 && r.flags.length >= 2, r.verdict); } },
    { name: 'maxOfferForCapRate: price that yields an 8% cap = NOI/0.08 ($181,200)',
      run: () => { const p = maxOfferForCapRate(DEAL, 8); return ok(near(p, 181200, 50), 'maxOffer=' + p); } },
  ],
};
