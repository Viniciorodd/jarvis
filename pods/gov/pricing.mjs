// pricing.mjs — the MIDDLEMAN MONEY MATH, in deterministic code (doctrine #1: the LLM proposes,
// code disposes of money). A sub's quote comes in as free text ("$4,200/mo", "about 5k", "48,000
// annually"); this module turns it into a number, applies the operator's markup policy, and produces
// the bid price + profit the proposal cites. Pure functions, eval-pinned. No LLM anywhere near the math.
//
// Policy knobs (env, not code): GOV_MARKUP_PCT (default 18) — clamped to a sane 5–60% band so a typo
// can never produce a 400% markup or an underwater bid.
//
// R2c additions (Victor CFO PRD §1): priceBuildup() adds the CONTINGENCY RESERVE the plain middleman
// method lacks, and cashFlowGap() models the sub-pay-vs-gov-pay float. Both pure + eval-pinned.
//   • GOV_CONTINGENCY_PCT — default **0 (OFF)**, clamped 0–15. Deliberately off by default: turning it on
//     raises every bid by that %, and in a competitive small-business set-aside a ~6% higher price can LOSE
//     the award. That is the operator's PRICING POLICY call, not a default we make for him — he sets it in
//     .env when he wants it (the PRD asks for 5–8%). middlemanPrice() is untouched, so live bids don't move.
//   • GOV_SUB_TERMS_DAYS (30) · GOV_PAY_DAYS (30, FAR Prompt Payment) · GOV_INVOICE_LAG_DAYS (5).

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

const round2 = (n) => Math.round(n * 100) / 100;
// Resolve a knob: explicit arg → env → default, then CLAMP. A bad env value can never escape the band.
function knob(explicit, envName, dflt, lo, hi) {
  const envN = Number(process.env[envName]);
  const want = explicit != null ? Number(explicit) : (isFinite(envN) ? envN : dflt);
  return Math.min(hi, Math.max(lo, isFinite(want) ? want : dflt));
}

// ── PURE: the FULL price buildup (Victor CFO PRD §1). The plain middleman method treats the whole spread
// as profit, so a single sub overrun or change order eats the margin. This holds a CONTINGENCY RESERVE on
// top of the cost basis BEFORE margin is figured, so the reserve absorbs overruns instead of your profit:
//     cost basis (sub quote) → + contingency reserve → loaded cost → × (1 + markup) → bid
// profit is measured against the LOADED cost, so it is the honest margin — the reserve is NOT counted as
// profit (if the job runs clean and the reserve goes unspent, it becomes upside, never a number we promised).
// contingencyPct defaults to GOV_CONTINGENCY_PCT (0 = off) — see the header note on why off is the default.
export function priceBuildup({ quote, markupPct = null, contingencyPct = null } = {}) {
  const q = typeof quote === 'number' ? quote : parseMoney(quote);
  if (q == null || q <= 0) return null;
  const markup = knob(markupPct, 'GOV_MARKUP_PCT', 18, 5, 60);
  const contPct = knob(contingencyPct, 'GOV_CONTINGENCY_PCT', 0, 0, 15);
  const contingency = round2(q * (contPct / 100));
  const loadedCost = round2(q + contingency);
  const bid = round2(loadedCost * (1 + markup / 100));
  const profit = round2(bid - loadedCost);
  return {
    subQuote: q, contingencyPct: contPct, contingency, loadedCost,
    markupPct: markup, bid, profit,
    marginPct: Math.round((profit / bid) * 1000) / 10,
  };
}

// ── PURE: the cash-flow float (Victor CFO PRD §1) — the gap between paying your sub and the government
// paying you. This is the working capital a middleman must actually carry; it is the whole reason invoice
// factoring exists (see the Lendability tracker). Positive gapDays = days you float the sub's cost.
export function cashFlowGap({ subCost = null, subTermsDays = null, govPayDays = null, invoiceLagDays = null } = {}) {
  const cost = typeof subCost === 'number' ? subCost : parseMoney(subCost);
  const subDueDay = knob(subTermsDays, 'GOV_SUB_TERMS_DAYS', 30, 0, 180);
  const govDays = knob(govPayDays, 'GOV_PAY_DAYS', 30, 0, 180);
  const lag = knob(invoiceLagDays, 'GOV_INVOICE_LAG_DAYS', 5, 0, 60);
  const govPayDay = lag + govDays;
  const gapDays = govPayDay - subDueDay;
  const floatAmount = gapDays > 0 && cost != null && cost > 0 ? round2(cost) : 0;
  const note = gapDays > 0
    ? `You owe the sub on day ${subDueDay}; the government pays ~day ${govPayDay} — you float ${floatAmount ? '$' + floatAmount.toLocaleString('en-US') : 'the sub cost'} for ${gapDays} days. Invoice factoring on the federal receivable closes exactly this gap.`
    : gapDays === 0
      ? `Neutral: the sub is due the same day (${subDueDay}) the government pays — no float, but no cushion either.`
      : `Favorable: the government pays ~day ${govPayDay}, ${Math.abs(gapDays)} days BEFORE the sub is due on day ${subDueDay} — no working capital needed.`;
  return { subDueDay, govPayDay, gapDays, floatAmount, note };
}

// ── PURE: plain-English buildup line for proposals / the Deal Room card. Shows the reserve explicitly so a
// reviewer always sees what the bid actually contains (never a silent markup).
export function buildupLine(p, period = 'total') {
  if (!p) return '';
  const per = period === 'total' ? '' : '/' + { month: 'mo', year: 'yr', hour: 'hr' }[period];
  const fmt = (n) => '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
  const res = p.contingencyPct > 0 ? ` + ${p.contingencyPct}% contingency reserve (${fmt(p.contingency)})` : '';
  return `Sub quote ${fmt(p.subQuote)}${per}${res} → loaded cost ${fmt(p.loadedCost)}${per} + ${p.markupPct}% markup → bid ${fmt(p.bid)}${per} (profit ${fmt(p.profit)}${per}, ${p.marginPct}% margin${p.contingencyPct > 0 ? '; reserve held for overruns, not counted as profit' : ''})`;
}
