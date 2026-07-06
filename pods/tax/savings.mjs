// Deterministic income splitter + virtual bucket balances. Jarvis computes what SHOULD move and
// nags; the operator moves money at his own bank and taps "done". No credentials, no transfers,
// ever. Rates live in entities.json (taxPct:"auto" is resolved by status.mjs from the estimator).

export function splitIncome(cents, { taxPct = 0, debtPct = 0, emergencyPct = 0, investPct = 0 }) {
  const total = Math.max(0, Math.round(cents || 0));
  // Sanitize rates (money math validates its inputs — directive #1): negatives → 0; if the
  // four rates sum past 100%, scale them down proportionally so `keep` can never go negative.
  let r = { tax: Math.max(0, taxPct || 0), debt: Math.max(0, debtPct || 0),
    emergency: Math.max(0, emergencyPct || 0), invest: Math.max(0, investPct || 0) };
  const rateSum = r.tax + r.debt + r.emergency + r.invest;
  if (rateSum > 100) { const f = 100 / rateSum; r = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v * f])); }
  const raw = { tax: total * r.tax / 100, debt: total * r.debt / 100,
    emergency: total * r.emergency / 100, invest: total * r.invest / 100 };
  const parts = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Math.floor(v)]));
  // largest-remainder: hand out the flooring dust so parts + keep === total exactly
  let dust = Object.values(raw).reduce((s, v) => s + v, 0) - Object.values(parts).reduce((s, v) => s + v, 0);
  const order = Object.entries(raw).sort((a, b) => (b[1] % 1) - (a[1] % 1)).map(([k]) => k);
  for (const k of order) { if (dust >= 1) { parts[k] += 1; dust -= 1; } }
  parts.keep = total - (parts.tax + parts.debt + parts.emergency + parts.invest);
  return parts;
}

// Virtual balances: target = every income event split by the rates; moved = what the operator
// confirmed; due = max(0, target − moved). Skipped weeks roll forward by construction.
export function bucketState({ incomeEvents = [], movedEvents = [], rates }) {
  const target = { tax: 0, debt: 0, emergency: 0, invest: 0 };
  for (const ev of incomeEvents) {
    const s = splitIncome(ev.cents, rates);
    target.tax += s.tax; target.debt += s.debt; target.emergency += s.emergency; target.invest += s.invest;
  }
  const moved = { tax: 0, debt: 0, emergency: 0, invest: 0 };
  for (const m of movedEvents) if (moved[m.bucket] != null) moved[m.bucket] += Math.round(m.cents || 0);
  const due = Object.fromEntries(Object.keys(target).map((k) => [k, Math.max(0, target[k] - moved[k])]));
  return { target, moved, due };
}

const usd = (c) => '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
export function nudgeLine({ due }) {
  const parts = Object.entries(due).filter(([, c]) => c > 0).map(([k, c]) => `${usd(c)} → ${k}`);
  return parts.length ? `Move this week: ${parts.join(', ')}.` : 'Buckets are on target — nothing to move.';
}
