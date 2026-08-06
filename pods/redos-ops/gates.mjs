// gates.mjs — the three gates from the 90-day campaign, as code.
//
//   1. Strangers want it    10 non-friend customers      proof it is not charity
//   2. It sells without you 40% of sales not hand-sold   proof it is a product, not consulting
//   3. It is a business     $10,000 net                  the actual goal
//
// "GATES OVER DATES." From the campaign: *"If a gate is not met, the phase repeats. A campaign that
// advances on the calendar while the evidence says no is how you get to day 90 with nothing."* So
// nothing here takes a date as an input. A gate is met or it is not, and only evidence moves it.
//
// ⚠️ AN UNMEASURABLE GATE IS NOT A FAILED GATE. If the source is down, `met` is null rather than
// false. False says "we checked and you have not got there"; null says "we could not check". Showing
// the second as the first would put a red mark against a week he may well have won.
//
// PURE. Eval-pinned.

import { customers, revenue } from './metrics.mjs';

export const GATES = [
  { id: 'strangers', label: 'Strangers want it', target: 10, unit: 'non-friend customers' },
  { id: 'unattended', label: 'It sells without you', target: 40, unit: '% of sales not hand-sold' },
  { id: 'business', label: 'It is a business', target: 10000, unit: '$ net' },
];

const pctOf = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null);

// PURE: one gate → { id, label, target, value, met, pct, why }.
// `met` is true | false | null. Null is the honest answer when nothing could be read.
export function evaluate(snap = {}) {
  const c = customers(snap);
  const r = revenue(snap);

  const unattended = (() => {
    const src = snap && snap.sources && snap.sources.gumroad;
    if (!src || src.ok !== true) return { value: null, why: (src && src.error) || 'no revenue source' };
    const rows = Array.isArray(src.data.customers) ? src.data.customers : [];
    // hand_sold defaults to UNKNOWN, same discipline as is_friend: a sale nobody classified cannot be
    // claimed as proof the product sells itself.
    const classified = rows.filter((x) => x && (x.hand_sold === true || x.hand_sold === false));
    if (!classified.length) return { value: null, why: 'no sale has been classified as hand-sold or not' };
    return { value: pctOf(classified.filter((x) => x.hand_sold === false).length, classified.length), why: '' };
  })();

  const raw = {
    strangers: { value: c.nonFriend, why: c.why },
    unattended,
    business: { value: r.netUsd, why: r.why },
  };

  return GATES.map((g) => {
    const { value, why } = raw[g.id];
    return {
      ...g,
      value,
      // null, not false, when it could not be measured.
      met: value === null ? null : value >= g.target,
      pct: value === null ? null : Math.min(100, Math.round((value / g.target) * 1000) / 10),
      why: why || '',
    };
  });
}

// PURE: the phase he is actually in — the first gate not yet met. Gates are sequential by design;
// selling without you is meaningless before ten strangers have bought.
export function phase(snap = {}) {
  const gs = evaluate(snap);
  const first = gs.find((g) => g.met !== true);
  if (!first) return { phase: 'all gates met', gate: null, blocked: false };
  return {
    phase: first.label,
    gate: first,
    // Cannot advance AND cannot confirm — worth distinguishing from simply not there yet.
    blocked: first.met === null,
  };
}

// PURE: one line for the digest. Compassion clause — states the position, never scores it.
export function gateLine(snap = {}) {
  const p = phase(snap);
  if (!p.gate) return 'All three gates met.';
  const g = p.gate;
  if (g.met === null) return `${g.label}: cannot measure (${g.why || 'source down'})`;
  return `${g.label}: ${g.value} of ${g.target} ${g.unit}`;
}
