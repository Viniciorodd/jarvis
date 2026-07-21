// deal-calc.mjs — the Real-Estate Deal Calculator (vault task [[Jarvis]] "Build Deal Calculator +
// wire it into Jarvis"). Deterministic underwriting math: the LLM never computes money — code does
// (prime directive #1). Pure + eval-pinned so a rental deal is scored the same every time.
//
// One entry point, analyzeDeal(input), returns every number an investor checks before offering:
// monthly P&I, NOI, cap rate, cash-on-cash, DSCR, monthly/annual cashflow, the 1% rule, GRM, expense
// ratio — plus max-offer solvers for a target cap rate or cash-on-cash. All inputs optional; sane
// defaults fill in. Percent inputs accept either 5 or 0.05 (both mean 5%).

const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
// accept 5 or 0.05 → 0.05; anything ≥ 1 is treated as "percent points"
const pct = (v, d = 0) => { const n = num(v, d); return n > 1 ? n / 100 : n; };
const round = (n, dp = 2) => { const f = 10 ** dp; return Math.round((n + Number.EPSILON) * f) / f; };

// PURE: fixed-rate fully-amortizing monthly payment. rateAnnual as 0.07 (or 7). Zero-rate → straight-line.
export function monthlyPayment(principal, rateAnnual, termYears) {
  const P = num(principal), r = pct(rateAnnual) / 12, n = Math.round(num(termYears) * 12);
  if (P <= 0 || n <= 0) return 0;
  if (r === 0) return round(P / n);
  return round((P * r * (1 + r) ** n) / ((1 + r) ** n - 1));
}

// PURE: full deal analysis. See field comments for units.
export function analyzeDeal(input = {}) {
  const price = num(input.price);
  const rehab = num(input.rehab);
  const closingCosts = input.closingCosts != null ? num(input.closingCosts) : round(price * 0.03); // default 3%
  const downPctIn = input.downAmount != null ? (price ? num(input.downAmount) / price : 0) : pct(input.downPct, 0.2);
  const downAmount = input.downAmount != null ? num(input.downAmount) : round(price * downPctIn);
  const loanAmount = Math.max(0, round(price - downAmount));

  const rateAnnual = pct(input.rate, 0.07);
  const termYears = num(input.termYears, 30);
  const pAndI = monthlyPayment(loanAmount, rateAnnual, termYears);
  const annualDebtService = round(pAndI * 12);

  // income
  const grossMonthlyRent = num(input.monthlyRent) + num(input.otherMonthlyIncome);
  const grossAnnualIncome = round(grossMonthlyRent * 12);
  const vacancy = pct(input.vacancyPct, 0.05);
  const egi = round(grossAnnualIncome * (1 - vacancy)); // effective gross income

  // operating expenses (NOTE: debt service is NOT an operating expense — excluded from NOI on purpose)
  const mgmt = round(egi * pct(input.mgmtPct, 0.08));
  const maintenance = round(egi * pct(input.maintPct, 0.05));
  const capex = round(egi * pct(input.capexPct, 0.05));
  const fixed = num(input.taxesAnnual) + num(input.insuranceAnnual) + num(input.hoaAnnual) + num(input.utilitiesAnnual) + num(input.otherExpensesAnnual);
  const operatingExpenses = round(mgmt + maintenance + capex + fixed);
  const noi = round(egi - operatingExpenses); // net operating income (annual)

  // returns
  const annualCashflow = round(noi - annualDebtService);
  const monthlyCashflow = round(annualCashflow / 12);
  const totalCashInvested = round(downAmount + closingCosts + rehab);
  const capRate = price > 0 ? round((noi / price) * 100, 2) : 0;
  const cashOnCash = totalCashInvested > 0 ? round((annualCashflow / totalCashInvested) * 100, 2) : 0;
  const dscr = annualDebtService > 0 ? round(noi / annualDebtService, 2) : null;
  const onePctRule = price > 0 ? round((grossMonthlyRent / price) * 100, 2) : 0; // ≥1.0 meets the "1% rule"
  const grm = grossAnnualIncome > 0 ? round(price / grossAnnualIncome, 2) : null; // gross rent multiplier
  const expenseRatio = egi > 0 ? round((operatingExpenses / egi) * 100, 1) : 0;

  // plain-English verdict — deterministic thresholds, not a model's opinion
  const flags = [];
  if (dscr != null && dscr < 1) flags.push('DSCR below 1.0 — the rent does not cover the debt.');
  if (monthlyCashflow < 0) flags.push('Negative monthly cashflow.');
  if (onePctRule < 1) flags.push(`Fails the 1% rule (${onePctRule}%).`);
  if (capRate < 5) flags.push(`Thin cap rate (${capRate}%).`);
  const verdict = flags.length ? flags.join(' ') : `Clears the basics: ${capRate}% cap, ${cashOnCash}% cash-on-cash, $${monthlyCashflow}/mo cashflow${dscr != null ? `, ${dscr} DSCR` : ''}.`;

  return {
    inputs: { price, downAmount, downPct: round(downPctIn * 100, 2), loanAmount, rateAnnual: round(rateAnnual * 100, 3), termYears, rehab, closingCosts },
    financing: { monthlyPI: pAndI, annualDebtService },
    income: { grossMonthlyRent, grossAnnualIncome, vacancyPct: round(vacancy * 100, 1), egi },
    expenses: { mgmt, maintenance, capex, fixed: round(fixed), operatingExpenses, expenseRatio },
    returns: { noi, monthlyCashflow, annualCashflow, capRate, cashOnCash, dscr, onePctRule, grm, totalCashInvested },
    verdict, flags,
  };
}

// PURE: highest purchase price that still hits a target cap rate, given the same income/expense assumptions.
// Solves price from capRate = NOI/price where NOI's %-based expenses scale with income (independent of price).
export function maxOfferForCapRate(input = {}, targetCapPct = 8) {
  const target = pct(targetCapPct, 0.08);
  if (target <= 0) return null;
  const probe = analyzeDeal({ ...input, price: 100000 }); // NOI is price-independent here → compute once
  const noi = probe.returns.noi;
  return noi > 0 ? round(noi / target) : 0;
}

export const DEFAULTS = { downPct: 20, rate: 7, termYears: 30, vacancyPct: 5, mgmtPct: 8, maintPct: 5, capexPct: 5, closingPct: 3 };
