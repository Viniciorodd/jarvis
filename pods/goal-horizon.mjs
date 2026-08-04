// goal-horizon.mjs — the ladder. Goals connected by CAPABILITIES, standing on his real position.
//
// Operator, 2026-08-04, after reading the first version: *"right now i just see another to-do list, another
// tracker, not what i described."* He was right, and the fix is this file.
//
// WHAT HE ASKED FOR:
//   *"long term vision and long term goals that will take 10 20 years and then see the reverse engineering to
//    get there, what neeeeeds to happen before i get there… if i want a new lambo, and i also want to buy a
//    business doing $1m usd per year, maybe those two goals can be related because if i buy the business, i
//    could probably lease the lambo too.. so which other goals can be accomplished along side other."*
//
// THE REFRAME. The previous engine ranked actions by how many goals shared them. That answers "what do these
// two goals have in common?" — which is NOT the question he asked. The Lambo is not a sibling of the
// business; it is a BYPRODUCT of it. So goals connect through capabilities:
//
//   a goal PRODUCES durable capability   (cash flow, credit, collateral, filed years)
//   a goal REQUIRES capability            (at a threshold)
//   A affords B   ⟸ A's production covers every requirement of B that reality does not already cover
//
// `affords` is DERIVED and never stored, for the same reason `unlocks` is: a stored derived edge is a stale
// edge, and this one changes every time his bank balance does.
//
// AND THE BOTTOM ROW IS LIVE. He said *"we have to look at my current reality."* Layer 0 is not a form — it
// is assembled from the tax, debt, credit, focus and gov pods. Which is also why UNKNOWN matters more here
// than anywhere else in the codebase: his credit report currently returns no score at all, and his unit list
// still contains a placeholder row reading "Add your first unit address here". Treating either as ZERO would
// invent a reality and then reverse-engineer a plan from the invention. Unknown stays unknown.
//
// PURE and eval-pinned. Spec: docs/superpowers/specs/2026-08-04-goal-horizon-engine-design.md

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// THE CAPABILITY LEDGER — closed on purpose.
//
// Free-text capabilities would drift into unmatchable strings, which is exactly how the string-matching
// engine this replaces ended up with 552 nodes and no edges. A closed vocabulary is also the schema a
// customer would fill in, if this ever becomes the product he wants to sell.
export const CAPS = {
  monthly_net:      { label: 'Monthly net cash flow',      unit: '$/mo',      dir: 'up'   },
  liquid_capital:   { label: 'Liquid capital',             unit: '$',         dir: 'up'   },
  credit_score:     { label: 'Personal credit score',      unit: 'FICO',      dir: 'up'   },
  business_credit:  { label: 'Business credit readiness',  unit: '%',         dir: 'up'   },
  filed_years:      { label: 'Years of filed returns showing income', unit: 'years', dir: 'up' },
  collateral:       { label: 'Collateral',                 unit: '$',         dir: 'up'   },
  debt_load:        { label: 'Debt payments',              unit: '$/mo',      dir: 'down' },
  free_hours:       { label: 'Unclaimed hours',            unit: 'hrs/wk',    dir: 'up'   },
  past_performance: { label: 'Past performance',           unit: 'contracts', dir: 'up'   },
  legal_clear:      { label: 'Legal exposure resolved',    unit: 'yes/no',    dir: 'up'   },
  operating_entity: { label: 'Operating entity',           unit: 'yes/no',    dir: 'up'   },
};

export const isCap = (id) => Object.prototype.hasOwnProperty.call(CAPS, id);

// PURE: read one capability out of reality. Returns `known:false` when we have no sourced value — NEVER a
// zero. Zero is a claim ("he has no credit"); unknown is the truth ("nobody has told us").
export function capOf(reality = {}, cap = '') {
  const r = reality && reality[cap];
  if (!r || r.value === null || r.value === undefined || r.value === '') {
    return { cap, known: false, value: null, partial: false, source: (r && r.source) || '', asOf: (r && r.asOf) || '' };
  }
  // `partial` marks a LOWER BOUND — "at least this much". His monthly_net is assembled from the rental
  // portfolio alone, so it is real money he definitely has and definitely not all of it.
  return { cap, known: true, value: r.value, partial: !!r.partial, source: r.source || '', asOf: r.asOf || '' };
}

// PURE: does reality satisfy one requirement? THREE-VALUED — 'yes' | 'no' | 'unknown'.
//
// Three-valued and not boolean, deliberately. A boolean forces unknown to collapse into one of the two
// answers, and both collapses are lies: "no" invents an obstacle, "yes" invents a qualification. The whole
// ladder inherits this — an unknown requirement blocks a PROMISE, not the view.
export function meets(reality = {}, req = {}) {
  if (!req || !isCap(req.cap)) return 'unknown';
  const have = capOf(reality, req.cap);
  if (!have.known) return 'unknown';
  const dir = CAPS[req.cap].dir;
  const need = req.value;
  if (typeof need === 'boolean' || typeof have.value === 'boolean') return (have.value === need) ? 'yes' : 'no';
  const n = Number(need), h = Number(have.value);
  if (!Number.isFinite(n) || !Number.isFinite(h)) return 'unknown';
  // 'down' capabilities (debt) are satisfied by being AT OR BELOW the threshold.
  const pass = dir === 'down' ? h <= n : h >= n;
  // A LOWER BOUND ("at least this much") only settles the question in one direction, and WHICH direction
  // flips with the capability:
  //   up   (cash flow): clears the bar → definite YES, the true figure is only higher.
  //                     misses it     → unknown, the rest of the picture could close the gap.
  //   down (debt)     : already over  → definite NO, more will only be worse.
  //                     under         → unknown, the unseen part could push it over.
  // Collapsing either unknown into a verdict would manufacture a fact out of an incomplete measurement.
  if (have.partial && (dir === 'down' ? pass : !pass)) return 'unknown';
  return pass ? 'yes' : 'no';
}

const reqs = (goal = {}) => (Array.isArray(goal.requires) ? goal.requires : []).filter((r) => r && isCap(r.cap));
const prods = (goal = {}) => (Array.isArray(goal.produces) ? goal.produces : []).filter((p) => p && isCap(p.cap));

// PURE: what this goal still needs, given where he actually stands. Unknowns come back flagged rather than
// silently dropped or silently counted.
export function unmet(goal = {}, reality = {}) {
  return reqs(goal).map((r) => ({ ...r, verdict: meets(reality, r), have: capOf(reality, r.cap) }))
    .filter((r) => r.verdict !== 'yes');
}

// PURE: does A's production cover requirement R?
function covers(produce, req) {
  if (!produce || produce.cap !== req.cap) return false;
  if (typeof req.value === 'boolean') return produce.value === req.value;
  const p = Number(produce.value), n = Number(req.value);
  if (!Number.isFinite(p) || !Number.isFinite(n)) return false;
  return CAPS[req.cap].dir === 'down' ? p <= n : p >= n;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// THE ANSWER TO HIS QUESTION.
//
// *"which other goals can be accomplished along side other"* — B comes along with A when everything B still
// needs is something A hands over.
//
// Returns the reasoning, not just a boolean, because "the Lambo comes free with the business" is a strong
// enough claim that he should be able to see exactly which line of it does the work.
export function affords(a = {}, b = {}, reality = {}) {
  if (!a || !b || a.id === b.id) return { afforded: false, covers: [], missing: [], unknown: [] };
  const need = unmet(b, reality);
  if (!need.length) return { afforded: false, covers: [], missing: [], unknown: [], why: 'already within reach' };
  const production = prods(a);
  const got = [], missing = [], unknown = [];
  for (const r of need) {
    const hit = production.find((p) => covers(p, r));
    if (hit) { got.push({ cap: r.cap, need: r.value, from: hit.value }); continue; }
    // An unknown we cannot cover is NOT a miss we can assert — it is a question. Kept separate so the UI can
    // say "we'd need to know your credit score" instead of "you can't afford this".
    (r.verdict === 'unknown' ? unknown : missing).push({ cap: r.cap, need: r.value });
  }
  return { afforded: got.length > 0 && missing.length === 0 && unknown.length === 0, covers: got, missing, unknown };
}

// PURE: for every goal, which goals it brings along. This is the headline the whole engine exists to produce.
export function affordedMap(goals = [], reality = {}) {
  const live = (Array.isArray(goals) ? goals : []).filter((g) => g && g.id);
  const out = new Map();
  for (const a of live) {
    const brings = [];
    for (const b of live) {
      const r = affords(a, b, reality);
      if (r.afforded) brings.push({ id: b.id, t: b.t, via: r.covers });
    }
    if (brings.length) out.set(a.id, brings);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// THE LADDER — bottom-up, and DERIVED.
//
// *"I like graph views connecting from the bottom up."*
//
// Height is not his stated horizon. It is computed: a goal sits one rung above whatever has to happen first.
// That matters because it means the ladder RE-LAYERS as he moves — which is the difference between a picture
// of his life and a poster of it. His `horizon` field is his intent, displayed, never driving the layout.
//
// Layer 0 is reality itself. Layer 1 is everything already within reach today.

// PURE: which goals produce a capability this goal is still missing? Those are what must come first.
export function blockers(goal = {}, goals = [], reality = {}) {
  const need = unmet(goal, reality);
  if (!need.length) return [];
  const out = [];
  for (const g of (Array.isArray(goals) ? goals : [])) {
    if (!g || !g.id || g.id === goal.id) continue;
    if (prods(g).some((p) => need.some((r) => covers(p, r)))) out.push(g.id);
  }
  return out;
}

// PURE: the rung each goal stands on. Cycle-safe — a loop in the data must render a flat ladder, never hang.
export function layers(goals = [], reality = {}) {
  const list = (Array.isArray(goals) ? goals : []).filter((g) => g && g.id);
  const byId = new Map(list.map((g) => [g.id, g]));
  const memo = new Map();
  const depth = (id, seen) => {
    if (memo.has(id)) return memo.get(id);
    if (seen.has(id)) return 1;                       // cycle — stop climbing rather than spin
    seen.add(id);
    const g = byId.get(id);
    const bs = g ? blockers(g, list, reality) : [];
    const d = bs.length ? 1 + Math.max(...bs.map((b) => depth(b, seen))) : 1;
    seen.delete(id);
    const capped = Math.min(d, 6);                    // six rungs is already more than anyone reads
    memo.set(id, capped);
    return capped;
  };
  const out = new Map();
  for (const g of list) out.set(g.id, depth(g.id, new Set()));
  return out;
}

// PURE: the whole picture — rungs, the goals on each, and the edges that climb between them.
export function ladder(goals = [], reality = {}) {
  const list = (Array.isArray(goals) ? goals : []).filter((g) => g && g.id);
  const L = layers(list, reality);
  const brings = affordedMap(list, reality);
  const rungs = [];
  for (const g of list) {
    const n = L.get(g.id) || 1;
    (rungs[n] = rungs[n] || []).push({
      id: g.id, t: g.t, tier: g.tier, horizon: g.horizon || '', confirmed: !!g.horizonConfirmed,
      unmet: unmet(g, reality).map((r) => ({ cap: r.cap, need: r.value, verdict: r.verdict })),
      brings: (brings.get(g.id) || []).map((b) => b.id),
    });
  }
  const edges = [];
  for (const g of list) for (const b of blockers(g, list, reality)) edges.push({ from: b, to: g.id, kind: 'requires' });
  for (const [from, bs] of brings) for (const b of bs) edges.push({ from, to: b.id, kind: 'affords' });
  return {
    rungs: rungs.map((goalsOnRung, i) => ({ rung: i, goals: goalsOnRung || [] })).filter((r) => r.goals.length),
    edges,
    reachableNow: (rungs[1] || []).map((g) => g.id),
  };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// REVERSE-ENGINEERING ONE GOAL — *"what neeeeeds to happen before i get there."*

// PURE: the gap, lowest rung first, with the capabilities named and his real numbers attached.
// Returns `nextGap` = the ONE thing to close first: unknowns before misses, because you cannot plan around a
// number nobody has looked up.
export function reverse(goal = {}, goals = [], reality = {}) {
  if (!goal || !goal.id) return { steps: [], nextGap: null, reachable: false };
  const need = unmet(goal, reality);
  if (!need.length) return { steps: [], nextGap: null, reachable: true };
  const L = layers(goals, reality);
  const steps = need.map((r) => {
    const from = (Array.isArray(goals) ? goals : []).filter((g) => g && g.id !== goal.id && prods(g).some((p) => covers(p, r)));
    return {
      cap: r.cap, label: CAPS[r.cap].label, unit: CAPS[r.cap].unit,
      need: r.value, have: r.have.known ? r.have.value : null, known: r.have.known,
      source: r.have.source, asOf: r.have.asOf,
      via: from.map((g) => ({ id: g.id, t: g.t, rung: L.get(g.id) || 1 })),
    };
  });
  // Unknowns first — then the shallowest real gap, because that is the one he can start on.
  const order = steps.slice().sort((a, b) => (a.known === b.known ? 0 : (a.known ? 1 : -1))
    || (Math.min.apply(null, [9].concat(a.via.map((v) => v.rung))) - Math.min.apply(null, [9].concat(b.via.map((v) => v.rung)))));
  // Unmeasured gaps come back as their own group. When two or more numbers have never been looked up, no
  // single "next step" is honest — the next step is going and finding them out, and the UI should say so
  // rather than picking one at random and implying the others are handled.
  const unknowns = order.filter((s) => !s.known);
  return { steps: order, unknowns, nextGap: order[0] || null, reachable: false };
}
