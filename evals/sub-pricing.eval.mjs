// Regression suite for the sub pricing-intelligence layer (pods/gov/sub-pricing.mjs).
// Pins: rate parsing from freeform quotes, per-trade benchmark aggregation, quote price-checking against
// the network median, and the bench-first match ranking (query the warm DB before cold-sourcing).

import { parsePricing, pricingOf, benchmarkForTrade, priceCheckQuote, benchFirstMatch } from '../pods/gov/sub-pricing.mjs';

const ok = (pass, detail = '') => ({ pass, detail });
const subs = [
  { id: 'a', trade: 'janitorial', location: 'Scranton, PA', past_performance: 3, exclusionStatus: 'clear', contact_email: 'a@x.com', pricing: { perSqft: 0.10, minimum: 2000 } },
  { id: 'b', trade: 'janitorial', location: 'Wilkes-Barre, PA', past_performance: 0, exclusionStatus: 'unverified', quote: '$0.14/sqft, $2,500 minimum' },
  { id: 'c', trade: 'janitorial', location: 'Allentown, PA', past_performance: 1, exclusionStatus: 'clear', pricing: { perSqft: 0.20 } },
  { id: 'd', trade: 'grounds', location: 'Scranton, PA', past_performance: 5, exclusionStatus: 'excluded', pricing: { hourly: 55 } },
];

export default {
  agent: 'gov-sub-pricing',
  cases: [
    { name: 'parsePricing pulls perSqft/hourly/minimum from freeform text',
      run: () => { const p = parsePricing('We charge $0.14/sqft, $45/hr, $2,500 minimum'); return ok(p.perSqft === 0.14 && p.hourly === 45 && p.minimum === 2500, JSON.stringify(p)); } },
    { name: 'parsePricing tolerates "per square foot" long form',
      run: () => { const p = parsePricing('$0.09 per square foot'); return ok(p.perSqft === 0.09, JSON.stringify(p)); } },
    { name: 'pricingOf prefers structured pricing, falls back to parsing quote',
      run: () => ok(pricingOf(subs[0]).perSqft === 0.10 && pricingOf(subs[1]).perSqft === 0.14) },
    { name: 'benchmarkForTrade: janitorial perSqft median of [0.10,0.14,0.20] = 0.14 (n=3)',
      run: () => { const b = benchmarkForTrade(subs, 'janitorial').metrics.perSqft; return ok(b.n === 3 && b.median === 0.14 && b.min === 0.10 && b.max === 0.20, JSON.stringify(b)); } },
    { name: 'benchmarkForTrade: minimum aggregates the two with a minimum (2000,2500)',
      run: () => { const b = benchmarkForTrade(subs, 'janitorial').metrics.minimum; return ok(b.n === 2 && b.median === 2250, JSON.stringify(b)); } },
    { name: 'priceCheckQuote: $0.20/sqft is ABOVE the 0.14 median (+42.9%)',
      run: () => { const r = priceCheckQuote({ subs, trade: 'janitorial', metric: 'perSqft', value: 0.20 }); return ok(r.position === 'above' && r.deltaPct > 40, JSON.stringify(r)); } },
    { name: 'priceCheckQuote: $0.10/sqft is BELOW median',
      run: () => { const r = priceCheckQuote({ subs, trade: 'janitorial', metric: 'perSqft', value: 0.10 }); return ok(r.position === 'below', JSON.stringify(r)); } },
    { name: 'priceCheckQuote: $0.145 within 10% of median reads "at market"',
      run: () => { const r = priceCheckQuote({ subs, trade: 'janitorial', metric: 'perSqft', value: 0.145 }); return ok(r.position === 'at', JSON.stringify(r)); } },
    { name: 'priceCheckQuote: too few comps → unknown (honest, not a guess)',
      run: () => { const r = priceCheckQuote({ subs, trade: 'grounds', metric: 'hourly', value: 60 }); return ok(r.position === 'unknown', JSON.stringify(r)); } },
    { name: 'benchFirstMatch: warm janitorial subs ranked, priced+clear first, excluded dropped',
      run: () => { const m = benchFirstMatch({ subs, trade: 'janitorial' }); return ok(m.length === 3 && m[0].sub.id === 'a' && !m.some((x) => x.sub.id === 'd'), m.map((x) => x.sub.id).join(',')); } },
    { name: 'benchFirstMatch: state filter matches the freeform location loosely',
      run: () => { const m = benchFirstMatch({ subs, trade: 'janitorial', state: 'scranton' }); return ok(m.length === 1 && m[0].sub.id === 'a', m.map((x) => x.sub.id).join(',')); } },
    { name: 'benchFirstMatch: an excluded sub is never returned',
      run: () => ok(benchFirstMatch({ subs, trade: 'grounds' }).every((x) => x.sub.exclusionStatus !== 'excluded')) },
  ],
};
