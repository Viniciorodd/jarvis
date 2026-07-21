// sub-pricing.mjs — the pricing-intelligence layer for the proactive sub database (vault "Strategic Pivot:
// Proactive Sub Database"). The single most valuable proactive data point: once you have real pricing
// ranges across dozens of subs, you can price-check ANY incoming quote against your OWN network instead of
// trusting one quote in isolation. Deterministic + pure — the LLM never does the money math.
//
// Two jobs:
//   1) capture/normalize per-sub pricing benchmarks (price/sqft, hourly, minimum, monthly),
//   2) aggregate them per trade and price-check a new quote against the network median.
// Plus benchFirstMatch(): the "query the warm database first, cold-source only for gaps" primitive.

const money = (v) => { const n = Number(String(v).replace(/[^0-9.]/g, '')); return Number.isFinite(n) && n > 0 ? n : null; };
const round = (n, dp = 2) => { const f = 10 ** dp; return Math.round((n + Number.EPSILON) * f) / f; };

// PURE: best-effort extraction of structured rates from a freeform quote string.
// "$0.14/sqft, $45/hr, $2,500 minimum" → { perSqft: 0.14, hourly: 45, minimum: 2500 }
export function parsePricing(text = '') {
  const s = String(text).toLowerCase();
  const grab = (re) => { const m = s.match(re); return m ? money(m[1]) : null; };
  return clean({
    perSqft: grab(/\$?\s*([0-9][0-9.,]*)\s*(?:\/|per\s*)?\s*(?:sq\.?\s*ft|sqft|sf|square\s*f(?:oo|ee)?t)/),
    hourly: grab(/\$?\s*([0-9][0-9.,]*)\s*(?:\/|per\s*)?\s*(?:hr|hour)\b/),
    monthly: grab(/\$?\s*([0-9][0-9.,]*)\s*(?:\/|per\s*)?\s*(?:mo|month)\b/),
    minimum: grab(/\$?\s*([0-9][0-9.,]*)\s*(?:min\b|minimum)/),
  });
}
function clean(o) { const r = {}; for (const k of Object.keys(o)) if (o[k] != null) r[k] = o[k]; return r; }

// PURE: the pricing object for a sub — prefers the structured `pricing` field, falls back to parsing `quote`.
export function pricingOf(sub = {}) {
  const p = sub.pricing && typeof sub.pricing === 'object' ? clean({ perSqft: money(sub.pricing.perSqft), hourly: money(sub.pricing.hourly), monthly: money(sub.pricing.monthly), minimum: money(sub.pricing.minimum) }) : {};
  return Object.keys(p).length ? p : parsePricing(sub.quote || '');
}

const METRICS = ['perSqft', 'hourly', 'monthly', 'minimum'];
function median(nums) { if (!nums.length) return null; const a = [...nums].sort((x, y) => x - y); const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : round((a[m - 1] + a[m]) / 2); }

const tradeMatch = (sub, trade) => !trade || String(sub.trade || '').toLowerCase().includes(String(trade).toLowerCase());

// PURE: aggregate every captured rate for a trade into per-metric {n,min,median,max}.
export function benchmarkForTrade(subs = [], trade = '') {
  const out = {};
  for (const metric of METRICS) {
    const vals = (subs || []).filter((s) => tradeMatch(s, trade)).map((s) => pricingOf(s)[metric]).filter((v) => v != null);
    if (vals.length) out[metric] = { n: vals.length, min: Math.min(...vals), median: median(vals), max: Math.max(...vals) };
  }
  return { trade, metrics: out, subsWithPricing: (subs || []).filter((s) => tradeMatch(s, trade) && Object.keys(pricingOf(s)).length).length };
}

// PURE: compare one incoming quote value to the network median for its trade+metric.
// Returns { position:'below'|'at'|'above'|'unknown', deltaPct, median, n }. within ±10% of median = 'at'.
export function priceCheckQuote({ subs = [], trade = '', metric = 'perSqft', value } = {}) {
  const v = money(value);
  const bench = benchmarkForTrade(subs, trade).metrics[metric];
  if (v == null || !bench || bench.n < 2) return { position: 'unknown', median: bench ? bench.median : null, n: bench ? bench.n : 0, reason: bench ? 'need at least 2 comps' : 'no comps for this trade/metric yet' };
  const deltaPct = round(((v - bench.median) / bench.median) * 100, 1);
  const position = deltaPct <= -10 ? 'below' : deltaPct >= 10 ? 'above' : 'at';
  return { position, deltaPct, median: bench.median, min: bench.min, max: bench.max, n: bench.n };
}

// PURE: "query the warm database first." Subs matching a trade (and optionally a state/area), ranked by
// readiness: has-pricing → past performance → SAM-clear → has-email. The caller cold-sources only if this
// comes back thin. state is matched loosely against the sub's freeform location string.
export function benchFirstMatch({ subs = [], trade = '', state = '' } = {}) {
  const st = String(state || '').toLowerCase().trim();
  const score = (s) => (Object.keys(pricingOf(s)).length ? 8 : 0) + Math.min(4, Number(s.past_performance) || 0)
    + (s.exclusionStatus === 'clear' ? 2 : s.exclusionStatus === 'excluded' ? -100 : 0) + (s.contact_email ? 1 : 0);
  return (subs || [])
    .filter((s) => tradeMatch(s, trade) && (!st || String(s.location || '').toLowerCase().includes(st)))
    .filter((s) => s.exclusionStatus !== 'excluded')
    .map((s) => ({ sub: s, readiness: score(s) }))
    .sort((a, b) => b.readiness - a.readiness);
}
