// pricing.mjs — the MIDDLEMAN MONEY MATH, in deterministic code (doctrine #1: the LLM proposes,
// code disposes of money). A sub's quote comes in as free text ("$4,200/mo", "about 5k", "48,000
// annually"); this module turns it into a number, applies the operator's markup policy, and produces
// the bid price + profit the proposal cites. Pure functions, eval-pinned. No LLM anywhere near the math.
//
// Policy knobs (env, not code): GOV_MARKUP_PCT (default 18) — clamped to a sane 5–60% band so a typo
// can never produce a 400% markup or an underwater bid.

// ── PURE: pull a usable USD amount out of a sub's free-text quote ───────────────────────────────────
export function parseMoney(s) {
  if (typeof s === 'number' && isFinite(s) && s > 0) return s;
  const t = String(s || '').replace(/,/g, '');
  const m = t.match(/\$?\s*(\d+(?:\.\d+)?)\s*(k|m)?\b/i);
  if (!m) return null;
  let n = parseFloat(m[1]);
  if (m[2]) n *= /k/i.test(m[2]) ? 1e3 : 1e6;
  return isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

// ── PURE: amount + billing period from the raw quote text ──────────────────────────────────────────
export function parseQuote(s) {
  const amount = parseMoney(s);
  if (amount == null) return null;
  const t = String(s || '').toLowerCase();
  const period = /(\/|\bper\s*|\ba\s+)?(mo\b|month)/.test(t) ? 'month'
    : /(yr\b|year|annual|annum)/.test(t) ? 'year'
    : /(hr\b|hour)/.test(t) ? 'hour'
    : 'total';
  return { amount, period, raw: String(s || '') };
}

// ── PURE: the middleman method — sub quote × (1 + markup) = your bid; the spread is your profit. ────
export function middlemanPrice({ quote, markupPct = null } = {}) {
  const q = typeof quote === 'number' ? quote : parseMoney(quote);
  if (q == null || q <= 0) return null;
  const envPct = Number(process.env.GOV_MARKUP_PCT);
  const want = markupPct != null ? Number(markupPct) : (isFinite(envPct) && envPct > 0 ? envPct : 18);
  const pct = Math.min(60, Math.max(5, isFinite(want) ? want : 18)); // sane band — a typo can't sink a bid
  const bid = Math.round(q * (1 + pct / 100) * 100) / 100;
  const profit = Math.round((bid - q) * 100) / 100;
  return { subQuote: q, markupPct: pct, bid, profit, marginPct: Math.round((profit / bid) * 1000) / 10 };
}

// ── PURE: one plain-English pricing line for proposals / the Deal Room card ─────────────────────────
export function pricingLine(p, period = 'total') {
  if (!p) return '';
  const per = period === 'total' ? '' : '/' + { month: 'mo', year: 'yr', hour: 'hr' }[period];
  const fmt = (n) => '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
  return `Sub quote ${fmt(p.subQuote)}${per} + ${p.markupPct}% markup → bid ${fmt(p.bid)}${per} (profit ${fmt(p.profit)}${per}, ${p.marginPct}% margin)`;
}
