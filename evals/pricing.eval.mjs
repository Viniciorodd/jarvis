// Regression suite for the gov MONEY MATH (pods/gov/pricing.mjs) — the R2c additions: the contingency
// reserve buildup + the sub-pay-vs-gov-pay cash-flow float. This is money the operator actually bids, so
// every number here is pinned: a silent drift in the buildup would either sink a bid (underwater) or lose
// an award (overpriced). Two properties matter most and are pinned hard:
//   1) GOV_CONTINGENCY_PCT defaults to 0 — turning contingency on is the operator's PRICING POLICY call,
//      so a fresh env must NOT silently raise his bids.
//   2) profit is measured against the LOADED cost — the reserve is never counted as profit.
// middlemanPrice() is untouched by R2c and stays pinned via evals/deals.eval.mjs. Pure only, no env writes
// that leak: each case sets/restores process.env around the call.

import { priceBuildup, cashFlowGap, buildupLine, parseQuote, middlemanPrice } from '../pods/gov/pricing.mjs';

const ok = (pass, detail = '') => ({ pass, detail });
// Run fn with a temporary env, always restoring — so case order can never matter.
function withEnv(vars, fn) {
  const saved = {};
  for (const k of Object.keys(vars)) { saved[k] = process.env[k]; if (vars[k] == null) delete process.env[k]; else process.env[k] = String(vars[k]); }
  try { return fn(); } finally { for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } }
}

export default {
  agent: 'gov-pricing',
  cases: [
    { name: 'contingency is OFF by default — a fresh env never silently raises a bid',
      run: () => withEnv({ GOV_CONTINGENCY_PCT: null, GOV_MARKUP_PCT: null }, () => {
        const p = priceBuildup({ quote: 10000 });
        // 0% reserve → loaded cost === sub quote → bid === the plain 18% markup bid
        return ok(p.contingencyPct === 0 && p.contingency === 0 && p.loadedCost === 10000 && p.bid === 11800, JSON.stringify(p));
      }) },

    { name: 'contingency ON: reserve rides on the cost basis BEFORE markup',
      run: () => withEnv({ GOV_MARKUP_PCT: 18 }, () => {
        const p = priceBuildup({ quote: 10000, contingencyPct: 6 });
        // 10000 + 600 reserve = 10600 loaded; × 1.18 = 12508
        return ok(p.contingency === 600 && p.loadedCost === 10600 && p.bid === 12508, JSON.stringify(p));
      }) },

    { name: 'profit is measured against LOADED cost — the reserve is NOT counted as profit',
      run: () => withEnv({ GOV_MARKUP_PCT: 18 }, () => {
        const p = priceBuildup({ quote: 10000, contingencyPct: 6 });
        // profit = bid - loadedCost = 12508 - 10600 = 1908 (NOT 12508-10000=2508, which would book the reserve as profit)
        return ok(p.profit === 1908, `profit=${p.profit} (must exclude the 600 reserve)`);
      }) },

    { name: 'contingencyPct is clamped to 0–15 (a typo can never balloon the bid)',
      run: () => {
        const hi = priceBuildup({ quote: 1000, contingencyPct: 900 });
        const lo = priceBuildup({ quote: 1000, contingencyPct: -50 });
        return ok(hi.contingencyPct === 15 && lo.contingencyPct === 0, `hi=${hi.contingencyPct} lo=${lo.contingencyPct}`);
      } },

    { name: 'markupPct still clamped 5–60 in the buildup path',
      run: () => {
        const hi = priceBuildup({ quote: 1000, markupPct: 400 });
        const lo = priceBuildup({ quote: 1000, markupPct: 1 });
        return ok(hi.markupPct === 60 && lo.markupPct === 5, `hi=${hi.markupPct} lo=${lo.markupPct}`);
      } },

    { name: 'GOV_CONTINGENCY_PCT env is honored + clamped when set',
      run: () => withEnv({ GOV_CONTINGENCY_PCT: 8, GOV_MARKUP_PCT: 18 }, () => {
        const p = priceBuildup({ quote: 5000 });
        return ok(p.contingencyPct === 8 && p.contingency === 400 && p.loadedCost === 5400, JSON.stringify(p));
      }) },

    { name: 'buildup rejects a junk / zero / negative quote',
      run: () => ok(priceBuildup({ quote: 0 }) === null && priceBuildup({ quote: -5 }) === null && priceBuildup({ quote: 'not money' }) === null) },

    { name: 'buildup accepts a free-text quote via parseQuote/parseMoney ("$4,200/mo")',
      run: () => withEnv({ GOV_CONTINGENCY_PCT: null, GOV_MARKUP_PCT: 18 }, () => {
        const p = priceBuildup({ quote: '$4,200/mo' });
        return ok(p && p.subQuote === 4200 && p.bid === 4956, JSON.stringify(p));
      }) },

    { name: 'middlemanPrice is UNCHANGED by R2c (live bids do not move)',
      run: () => withEnv({ GOV_CONTINGENCY_PCT: 6, GOV_MARKUP_PCT: 18 }, () => {
        // even with contingency configured, the legacy path must be identical: 10000 × 1.18 = 11800
        const m = middlemanPrice({ quote: 10000 });
        return ok(m.bid === 11800 && m.profit === 1800, JSON.stringify(m));
      }) },

    { name: 'cashFlowGap: sub due day 30 vs gov paying ~day 35 → you float the cost 5 days',
      run: () => withEnv({ GOV_SUB_TERMS_DAYS: 30, GOV_PAY_DAYS: 30, GOV_INVOICE_LAG_DAYS: 5 }, () => {
        const g = cashFlowGap({ subCost: 10000 });
        return ok(g.gapDays === 5 && g.floatAmount === 10000 && g.govPayDay === 35 && /float/i.test(g.note), JSON.stringify(g));
      }) },

    { name: 'cashFlowGap: favorable when the gov pays before the sub is due → no float',
      run: () => {
        const g = cashFlowGap({ subCost: 10000, subTermsDays: 60, govPayDays: 30, invoiceLagDays: 5 });
        return ok(g.gapDays === -25 && g.floatAmount === 0 && /favorable/i.test(g.note), JSON.stringify(g));
      } },

    { name: 'cashFlowGap: a positive gap names invoice factoring (ties to the Lendability packet)',
      run: () => {
        const g = cashFlowGap({ subCost: 10000, subTermsDays: 15, govPayDays: 30, invoiceLagDays: 5 });
        return ok(g.gapDays === 20 && /factoring/i.test(g.note), g.note);
      } },

    { name: 'buildupLine shows the reserve explicitly when on, and omits it when off',
      run: () => {
        const on = buildupLine(priceBuildup({ quote: 10000, contingencyPct: 6, markupPct: 18 }));
        const off = buildupLine(priceBuildup({ quote: 10000, contingencyPct: 0, markupPct: 18 }));
        return ok(/contingency reserve/i.test(on) && /not counted as profit/i.test(on) && !/contingency/i.test(off), on + ' || ' + off);
      } },

    { name: 'parseQuote still reads amount + period (unregressed)',
      run: () => { const q = parseQuote('about 5k a month'); return ok(q && q.amount === 5000 && q.period === 'month', JSON.stringify(q)); } },
  ],
};
