// goal-registry.mjs — the filter and the router.
//
// From the PRD, and it is the line that changed what this thing is:
//   *"the original doc frames this as a planner with pretty pictures. The data says it's really a FILTER and
//    a ROUTER. Build the filter first; the AI imagery is decoration on top of it."*
//
// This module consumes the curated registry (`goals.json` in the vault — 91 goals, 23 actions, hand-tiered,
// with a verbatim quote on the nodes that have one). That file is a real DAG: `goal.req[] → action.id` and
// `action.blockedBy[] → action.id`. Everything here is DERIVED from it and nothing is stored back, per the
// PRD's *"`unlocks` is derived, never stored — it changes every time an edge changes."*
//
// WHY THIS REPLACED THE FUZZY MATCHER. The first pass at this (pods/goals.mjs) inferred edges by comparing
// action STRINGS across goals — Jaccard over words. It found 23 connections in 552 harvested goals and needed
// an LLM pass to invent the actions first. The curated file already states the edges outright, so the graph
// is his structure rather than my guess at it. The harvested set stays useful as a candidate feed for goals
// he's written since; it is no longer the source of truth.
//
// PURE and eval-pinned end to end. The leverage ranking is THE product — if it reshuffles between runs he
// stops trusting it, and a wrong "this moves 6 goals" is worse than no number, because he'd reorganise his
// year around it.

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// BOUNDARIES — hard-coded, non-negotiable, from the registry §6.
//
// These are the rules the engine must never propose a path through. They live in CODE and not in a prompt
// because doctrine #1 says code disposes: a model that "remembers" not to suggest trading is a model that
// forgets it on the run where he's discouraged and would say yes.
// ⚠ No trailing \b on these. A pattern that ends in `)` — as `8\(a\)` does — or in a truncated stem can
// never satisfy one, because the boundary needs a word/non-word transition that isn't there. It cost two
// silent misses on the first run: "Claim 8(a) status" and "day trade the open" both sailed through. Anchor
// the FRONT and let the stems run open with \w*.
const BOUNDARIES = [
  ['trading is off', /\b(day.?trad\w*|trading (firm|account|strateg\w*)|prop firm|credit spread|hedge fund|options? (play|trade)|forex|swing trad\w*)/i],
  ['no RE flips until reserves exist', /\b(flip(ping|s)? (a |the )?(house|home|propert\w*)|fix and flip|wholesal\w*)/i],
  ['no new ventures / no FOMO', /\b(start (a|another) (new )?(business|company|venture|brand|store)|launch a (new )?(startup|venture))/i],
  ['never claim a set-aside he does not hold', /8\(a\)|\b(hubzone|sdvosb|wosb|edwosb|service.?disabled)/i],
  ['no spend over $10 unasked', /\$\s?(?:[1-9]\d{2,}|[2-9]\d)\b/],
  ['no public traction claims while the $0-income filings stand', /\b(press release|announce publicly|post (our|the) revenue|publish (our|the) numbers)/i],
];

// PURE: does this proposed action cross one of his own lines? Returns the NAME of the boundary, or null.
// Named rather than boolean so a blocked suggestion can say which rule stopped it — a silent drop looks
// like the engine simply had no ideas.
export function violatesBoundary(text = '') {
  const t = String(text || '');
  for (const [name, re] of BOUNDARIES) if (re.test(t)) return name;
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// THE DAG

const byId = (list = []) => new Map((Array.isArray(list) ? list : []).filter((x) => x && x.id).map((x) => [x.id, x]));

// PURE: pick the single best alternative when a prerequisite is satisfiable by ANY of several actions.
//
// ⚠ THE MODELLING TRAP the PRD caught in v1, verbatim: *"cash flow was first modelled as blocked by sends AND
// product AND occupancy. That's an OR, not an AND, and it inflated two actions to 58 phantom unlocks."*
//
// So an `any` node resolves to ONE path — otherwise every alternative gets credited with unlocking everything
// downstream, and two side-quests appear to move 58 goals each. Deterministic ordering (open before blocked,
// then cheaper, then id) because a leverage table that reorders between runs is one he stops reading.
const COST_RANK = { free: 0, low: 1, effort: 2, med: 3, high: 4, '-': 5, undefined: 5 };
export function bestAlternative(ids = [], actions = []) {
  const A = byId(actions);
  const live = (Array.isArray(ids) ? ids : []).map((i) => A.get(i)).filter(Boolean);
  if (!live.length) return null;
  const score = (a) => [
    a.status === 'blocked' ? 1 : 0,
    COST_RANK[a.cost] ?? 5,
    a.id,
  ];
  return live.slice().sort((x, y) => {
    const sx = score(x), sy = score(y);
    return (sx[0] - sy[0]) || (sx[1] - sy[1]) || String(sx[2]).localeCompare(String(sy[2]));
  })[0];
}

// PURE: every action that must happen before this one, including itself. Cycle-safe — a data error in the
// registry must render a partial graph, never hang the page.
export function actionClosure(actionId, actions = [], seen = new Set()) {
  const A = byId(actions);
  const a = A.get(actionId);
  if (!a || seen.has(actionId)) return seen;
  seen.add(actionId);
  const deps = Array.isArray(a.blockedBy) ? a.blockedBy : [];
  if (!deps.length) return seen;
  // `mode: 'any'` means one of these is enough. Default is 'all' — the safe reading, and what the curated
  // file means today, since nothing in it declares a mode yet.
  if (a.mode === 'any') {
    const pick = bestAlternative(deps, actions);
    if (pick) actionClosure(pick.id, actions, seen);
    return seen;
  }
  for (const d of deps) actionClosure(d, actions, seen);
  return seen;
}

// PURE: everything that must happen before this GOAL.
export function goalClosure(goal = {}, actions = []) {
  const out = new Set();
  for (const r of (Array.isArray(goal.req) ? goal.req : [])) actionClosure(r, actions, out);
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// LEVERAGE — the whole point of the graph.

const LIVE_TIERS = new Set(['true', 'operating']);

// PURE: for every action, how many goals it unlocks. Ranked.
//
// Reported TWICE on purpose. `unlocks` counts all 91 goals; `live` counts only the true+operating tiers.
// The honest headline is the live number: an action that unblocks 67 goals sounds enormous until you notice
// 45 of them are dream-tier written at nineteen and explicitly not to be planned. Ranking by the dream count
// would let a dormant wish-list decide what he does on Monday — the exact failure the tiers exist to prevent.
export function unlockCounts(goals = [], actions = []) {
  const list = (Array.isArray(goals) ? goals : []).filter((g) => g && g.id);
  const counts = new Map();
  for (const a of (Array.isArray(actions) ? actions : [])) if (a && a.id) counts.set(a.id, { action: a, goals: [], live: [] });
  for (const g of list) {
    if (g.retired) continue;                       // he said it isn't his any more — it stops voting
    if (g.status === 'achieved') continue;
    for (const id of goalClosure(g, actions)) {
      const c = counts.get(id);
      if (!c) continue;
      c.goals.push(g.id);
      if (LIVE_TIERS.has(g.tier)) c.live.push(g.id);
    }
  }
  return [...counts.values()]
    .map((c) => ({ id: c.action.id, title: c.action.title, cost: c.action.cost, status: c.action.status,
      note: c.action.note || '', blockedBy: c.action.blockedBy || [],
      unlocks: c.goals.length, live: c.live.length, goals: c.goals, liveGoals: c.live }))
    // Live first, then total, then id — a STABLE order, always.
    .sort((x, y) => y.live - x.live || y.unlocks - x.unlocks || String(x.id).localeCompare(String(y.id)));
}

// PURE: is this action startable right now — nothing in front of it?
export function isStartable(action = {}, actions = []) {
  if (!action || !action.id) return false;
  if (action.status === 'done') return false;
  const deps = Array.isArray(action.blockedBy) ? action.blockedBy : [];
  if (!deps.length) return true;
  const A = byId(actions);
  if (action.mode === 'any') return deps.some((d) => (A.get(d) || {}).status === 'done');
  return deps.every((d) => (A.get(d) || {}).status === 'done');
}

// PURE: the answer to "what do I do next". The highest-leverage action that is actually STARTABLE.
//
// Startable is the operative word. "Net worth $10M" tops nothing and unblocks nothing this week; the point of
// a router is to name the thing he can begin today. His own registry found this and it is uncomfortable:
// everything from the ranch to his mother resting routes through one 30-minute action.
export function topAction(goals = [], actions = []) {
  return unlockCounts(goals, actions).find((a) => isStartable(byId(actions).get(a.id) || {}, actions)) || null;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// THE FREE WINS — registry §4, and the feature that matters most on a bad day.
//
// *"my burnout comes from working hard with no visible results; no daily wins and I spiral."*
// These are goals that need no money, no permission, no award and no approval from anyone.

const FREE_OK = new Set(['free']);

// PURE: goals whose ENTIRE dependency closure is free and unblocked.
//
// A goal with NO modelled prerequisites is NOT returned as a free win. That is missing data, not evidence of
// freeness, and the PRD is explicit: *"Nothing inferred is asserted."* Calling "Become the mayor of Paterson"
// a free win because nobody wrote its chain down yet would discredit the whole surface. They come back
// separately as `unmodelled`, which is an honest thing to show and a real invitation to fill the gap.
export function freeWins(goals = [], actions = []) {
  const A = byId(actions);
  const wins = [], unmodelled = [];
  for (const g of (Array.isArray(goals) ? goals : []).filter((x) => x && x.id)) {
    if (g.retired || g.status === 'achieved' || g.blocked) continue;
    if (g.tier === 'dream') continue;                       // dream tier is surfaced yearly, never planned
    const closure = [...goalClosure(g, actions)].map((i) => A.get(i)).filter(Boolean);
    if (!closure.length) { unmodelled.push(g); continue; }
    if (closure.every((a) => FREE_OK.has(a.cost) && a.status !== 'blocked')) wins.push({ ...g, chain: closure.map((a) => a.title) });
  }
  return { wins, unmodelled };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// TIERS, DECAY, TONE

// PURE: the three-way split. The single most useful field in the model, per the PRD — *"without it the
// castle and the ranch get planned identically."*
export function tierSplit(goals = []) {
  const out = { true: 0, operating: 0, dream: 0, retired: 0, achieved: 0 };
  for (const g of (Array.isArray(goals) ? goals : [])) {
    if (!g) continue;
    if (g.retired) { out.retired += 1; continue; }
    if (g.status === 'achieved') { out.achieved += 1; continue; }
    if (out[g.tier] !== undefined) out[g.tier] += 1;
  }
  return out;
}

// PURE: days since he last wrote this goal down. `last` in the registry is sometimes a bare year ("2021"),
// which we read as that year's start — the coarse answer is still the true one at this scale.
export function decayDays(goal = {}, today = '2026-08-03') {
  const raw = String(goal.last || goal.first || '').trim();
  if (!/^\d{4}/.test(raw)) return null;
  const iso = /^\d{4}$/.test(raw) ? raw + '-01-01' : (/^\d{4}-\d{2}$/.test(raw) ? raw + '-01' : raw);
  const t = Date.parse(iso), n = Date.parse(String(today));
  if (!Number.isFinite(t) || !Number.isFinite(n)) return null;
  return Math.max(0, Math.round((n - t) / 86400000));
}

// PURE: the decay counter as a LINE he reads.
//
// The registry admired Notion's field — *"Rice Land: 783 days past due"* — and the PRD immediately fenced it:
// *"informational, never accusatory... no shame framing, no 'days behind' as a headline."* So this says when
// he last wrote it, which is a fact, and never that he is late, which is a verdict. Same number, and the
// difference is the whole compassion clause.
export function decayLine(goal = {}, today = '2026-08-03') {
  const d = decayDays(goal, today);
  if (d === null) return '';
  if (d < 45) return 'written this month';
  if (d < 400) return `last written ${Math.round(d / 30)} months ago`;
  const y = (d / 365);
  return `last written ${y < 1.6 ? 'a year' : Math.round(y) + ' years'} ago`;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// THE CHAIN — reverse-engineering one goal to something startable this quarter.

// PURE: the ordered path for a goal — deepest prerequisite first, so the LAST thing he reads is the goal and
// the FIRST is what he can start. Dream-tier goals return an empty chain by design: the PRD says do not plan
// them, and a planner that quietly plans them anyway is how the castle keeps costing him Mondays.
export function chainFor(goal = {}, actions = []) {
  if (!goal || !goal.id) return { chain: [], planned: false, why: 'no goal' };
  if (goal.tier === 'dream') return { chain: [], planned: false, why: 'dream tier — surfaced once a year, not planned' };
  if (goal.blocked) return { chain: [], planned: false, why: goal.blocked };
  const A = byId(actions);
  const ids = [...goalClosure(goal, actions)];
  // Topological-ish: depth = how many prerequisites sit behind it. Startable things sort to the top.
  const depth = (id, seen = new Set()) => {
    if (seen.has(id)) return 0;
    seen.add(id);
    const a = A.get(id);
    const deps = a && Array.isArray(a.blockedBy) ? a.blockedBy : [];
    return deps.length ? 1 + Math.max(...deps.map((d) => depth(d, seen))) : 0;
  };
  const chain = ids.map((id) => A.get(id)).filter(Boolean)
    .map((a) => ({ id: a.id, title: a.title, cost: a.cost, status: a.status, note: a.note || '', depth: depth(a.id), startable: isStartable(a, actions) }))
    .sort((x, y) => x.depth - y.depth || String(x.id).localeCompare(String(y.id)));
  return { chain, planned: chain.length > 0, why: chain.length ? '' : 'no prerequisites modelled yet' };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// DECISIONS — "still yours?" keep / retire / it already happened.
//
// Written to a state file of our own, NOT back into his curated goals.json. He hand-built that file and may
// hand-edit it again; a program that rewrites it can silently eat a quote he typed at 2am. Same reasoning as
// pods/gov/pipeline-state.json, and the same shape.
export function applyDecisions(goals = [], state = {}) {
  const d = (state && state.decisions) || {};
  return (Array.isArray(goals) ? goals : []).map((g) => {
    const v = g && d[g.id];
    if (!v) return g;
    if (v.decision === 'retire') return { ...g, retired: true, decidedAt: v.at || '' };
    if (v.decision === 'achieved') return { ...g, status: 'achieved', decidedAt: v.at || '' };
    return { ...g, confirmed: true, decidedAt: v.at || '' };     // 'keep' — the tier stops being a guess
  });
}

// PURE: which goals still carry a machine-inferred tier he has never confirmed. The PRD requires inferences
// render as unconfirmed until he says otherwise, so the UI needs to know which ones those are.
export function unconfirmed(goals = []) {
  return (Array.isArray(goals) ? goals : []).filter((g) => g && !g.confirmed && !g.retired && g.status !== 'achieved');
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// THE ASSEMBLED VIEW

// PURE: everything a surface needs, in one shape.
//
// `hardDay` is the Hard Day Protocol from the registry §6: *"on a heavy day the engine shows the graph and
// one free win. No targets recited, no deadlines, no gap number."* So on those days this returns the free win
// as the headline and omits the leverage table entirely — the numbers are not withheld to be kind, they are
// withheld because a gap number on a bad day is the thing that starts the spiral.
export function registryView(data = {}, { state = {}, today = '2026-08-03', hardDay = false } = {}) {
  const actions = Array.isArray(data.actions) ? data.actions : [];
  const goals = applyDecisions(Array.isArray(data.goals) ? data.goals : [], state)
    .map((g) => ({ ...g, decay: decayLine(g, today) }));
  const free = freeWins(goals, actions);
  const ranked = unlockCounts(goals, actions);
  const top = topAction(goals, actions);
  const base = {
    ok: true,
    meta: data.meta || {},
    categories: data.categories || [],
    tiers: tierSplit(goals),
    goals,
    actions,
    freeWins: free.wins,
    unmodelled: free.unmodelled.map((g) => ({ id: g.id, t: g.t, tier: g.tier })),
    unconfirmed: unconfirmed(goals).length,
    hardDay,
  };
  if (hardDay) {
    return { ...base, oneThing: free.wins[0] || null, leverage: [], top: null,
      says: free.wins[0] ? 'One thing, and it costs nothing.' : 'The map is here whenever you want it.' };
  }
  return { ...base, leverage: ranked, top, oneThing: top };
}
