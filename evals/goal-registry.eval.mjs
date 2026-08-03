// Regression suite for the goal registry engine (pods/goal-registry.mjs).
//
// The leverage ranking IS the product. A wrong "this moves 6 goals" is worse than no number at all, because
// he reorganises his year around it. So the maths is pinned here in full, including the two traps the PRD
// caught in v1 — the any/all inflation and the free-win-from-missing-data assertion.

import {
  violatesBoundary, bestAlternative, actionClosure, goalClosure, unlockCounts, isStartable, topAction,
  freeWins, tierSplit, decayDays, decayLine, chainFor, applyDecisions, unconfirmed, registryView,
} from '../pods/goal-registry.mjs';

const ok = (pass, detail = '') => ({ pass, detail });

// A miniature of his real registry: one root action, a chain above it, and two free-and-unblocked branches.
const ACTIONS = [
  { id: 'a_send', title: 'Outbound sends', blockedBy: [], status: 'open', cost: 'effort' },
  { id: 'a_cash', title: 'Monthly net cash flow at $10,000', blockedBy: ['a_send'], status: 'blocked', cost: '-' },
  { id: 'a_debt', title: 'Debt cleared', blockedBy: ['a_cash'], status: 'blocked', cost: '-' },
  { id: 'a_health', title: 'Health base', blockedBy: [], status: 'open', cost: 'free' },
  { id: 'a_habit', title: 'Reading + writing habit', blockedBy: [], status: 'open', cost: 'free' },
  { id: 'a_occupancy', title: 'Rentals at full occupancy', blockedBy: [], status: 'open', cost: 'low' },
];
const GOALS = [
  { id: 'g_ranch', t: 'A small ranch', tier: 'true', req: ['a_debt'], last: '2026-06-09' },
  { id: 'g_fit', t: 'A fit body', tier: 'true', req: ['a_health'], last: '2026-02-01' },
  { id: 'g_book', t: 'Write his book', tier: 'true', req: ['a_habit'], last: '2025-07-01' },
  { id: 'g_10k', t: '$10k/mo', tier: 'operating', req: ['a_cash'], last: '2026-07-30' },
  { id: 'g_castle', t: 'A castle', tier: 'dream', req: ['a_debt'], last: '2018-11-06' },
  { id: 'g_jet', t: 'A private jet', tier: 'dream', req: ['a_debt'], last: '2018-11-06' },
  { id: 'g_mayor', t: 'Mayor of Paterson', tier: 'dream', req: [], last: '2021' },
  { id: 'g_proxy', t: 'Medical POA for Ana', tier: 'operating', req: [], last: '2026-07-01' },
];

export default {
  agent: 'goal-registry',
  cases: [
    // ── BOUNDARIES (registry §6) — in code, never in a prompt ───────────────────────────────────────
    { name: 'trading, flips, new ventures and set-aside claims are all refused', run: () => {
      const missed = ['Open a prop firm account', 'Fix and flip a house', 'Start a new business selling candles',
        'Claim 8(a) status', 'Spend $400 on ads'].filter((t) => !violatesBoundary(t));
      return ok(missed.length === 0, 'NOT CAUGHT: ' + JSON.stringify(missed));
    } },

    { name: 'the boundary is NAMED, so a refusal can say which rule stopped it', run: () =>
      ok(violatesBoundary('day trade the open') === 'trading is off', String(violatesBoundary('day trade the open'))) },

    { name: 'the work he is actually supposed to do passes clean', run: () => {
      const blocked = ['Send three gov proposals', 'Call two subs for quotes', 'Go to the gym',
        'Read ten pages'].filter(violatesBoundary);
      return ok(blocked.length === 0, 'WRONGLY BLOCKED: ' + JSON.stringify(blocked));
    } },

    // ── ⚠ THE any|all TRAP (PRD §2) ────────────────────────────────────────────────────────────────
    // v1 modelled cash flow as blocked by sends AND product AND occupancy. That is an OR, and it inflated
    // two side-quests to 58 phantom unlocks each. An `any` node must resolve to exactly ONE path.
    { name: '⚠ an `any` prerequisite resolves to one path, not all of them', run: () => {
      // Two ways to satisfy a_x. The closure must contain ONE of them — counting both is precisely how v1
      // inflated two side-quests to 58 phantom unlocks each. It routes through a_occupancy because `low`
      // beats `effort`: when either path will do, the router names the cheaper one.
      const acts = [...ACTIONS, { id: 'a_x', title: 'x', blockedBy: ['a_send', 'a_occupancy'], mode: 'any', status: 'blocked', cost: '-' }];
      const c = actionClosure('a_x', acts);
      return ok(c.size === 2 && c.has('a_x') && c.has('a_occupancy') && !c.has('a_send'), [...c].join(','));
    } },

    { name: '⚠ without a mode the reading stays `all` — the safe default', run: () => {
      const acts = [...ACTIONS, { id: 'a_y', title: 'y', blockedBy: ['a_send', 'a_occupancy'], status: 'blocked', cost: '-' }];
      return ok(actionClosure('a_y', acts).size === 3, [...actionClosure('a_y', acts)].join(','));
    } },

    { name: '⚠ the `any` pick is deterministic: open beats blocked, then cheaper', run: () => {
      const a = bestAlternative(['a_cash', 'a_health'], ACTIONS);          // a_cash blocked, a_health open+free
      const b = bestAlternative(['a_occupancy', 'a_health'], ACTIONS);     // both open; free beats low
      return ok(a.id === 'a_health' && b.id === 'a_health', a.id + '/' + b.id);
    } },

    { name: 'a cycle in the data renders a partial graph instead of hanging', run: () => {
      const acts = [{ id: 'a', title: 'a', blockedBy: ['b'] }, { id: 'b', title: 'b', blockedBy: ['a'] }];
      return ok(actionClosure('a', acts).size === 2);
    } },

    // ── LEVERAGE ───────────────────────────────────────────────────────────────────────────────────
    { name: 'the root action unlocks everything downstream of it', run: () => {
      const send = unlockCounts(GOALS, ACTIONS).find((a) => a.id === 'a_send');
      // ranch, 10k, castle, jet all route through sends
      return ok(send.unlocks === 4, String(send.unlocks));
    } },

    { name: 'the ranking leads with LIVE goals, so a dormant wish list cannot pick his Monday', run: () => {
      const send = unlockCounts(GOALS, ACTIONS).find((a) => a.id === 'a_send');
      // 4 total, but only ranch + 10k are true/operating — the castle and the jet do not vote
      return ok(send.live === 2 && send.unlocks === 4, send.live + '/' + send.unlocks);
    } },

    { name: 'the ranking is STABLE across runs', run: () => {
      const a = unlockCounts(GOALS, ACTIONS).map((x) => x.id).join(',');
      const b = unlockCounts([...GOALS].reverse(), ACTIONS).map((x) => x.id).join(',');
      return ok(a === b, a + ' vs ' + b);
    } },

    { name: 'a retired goal stops voting on what he should do', run: () => {
      const before = unlockCounts(GOALS, ACTIONS).find((a) => a.id === 'a_send').live;
      const after = unlockCounts(applyDecisions(GOALS, { decisions: { g_ranch: { decision: 'retire' } } }), ACTIONS)
        .find((a) => a.id === 'a_send').live;
      return ok(before === 2 && after === 1, before + ' -> ' + after);
    } },

    { name: 'topAction names something he can START, not the biggest number', run: () => {
      // a_cash outranks nothing it can act on — it is blocked. a_send is the startable root.
      const t = topAction(GOALS, ACTIONS);
      return ok(t && t.id === 'a_send', t && t.id);
    } },

    { name: 'startability follows the DAG, not the label', run: () =>
      ok(isStartable(ACTIONS[0], ACTIONS) && !isStartable(ACTIONS[1], ACTIONS)) },

    // ── FREE WINS (registry §4) ────────────────────────────────────────────────────────────────────
    { name: 'a goal whose whole closure is free-and-unblocked is a free win', run: () => {
      const ids = freeWins(GOALS, ACTIONS).wins.map((g) => g.id).sort();
      return ok(ids.join(',') === 'g_book,g_fit', ids.join(','));
    } },

    { name: '⚠ a goal with NO modelled chain is never asserted to be free', run: () => {
      // "Nothing inferred is asserted" — missing data is not evidence of freeness. g_proxy has no req.
      const f = freeWins(GOALS, ACTIONS);
      return ok(!f.wins.some((g) => g.id === 'g_proxy') && f.unmodelled.some((g) => g.id === 'g_proxy'));
    } },

    { name: 'dream-tier goals never appear as free wins', run: () =>
      ok(!freeWins(GOALS, ACTIONS).wins.some((g) => g.tier === 'dream')) },

    // ── TIERS + DECAY + TONE ───────────────────────────────────────────────────────────────────────
    { name: 'the three tiers are counted, and decided goals leave them', run: () => {
      const t = tierSplit(GOALS);
      const after = tierSplit(applyDecisions(GOALS, { decisions: { g_castle: { decision: 'retire' } } }));
      return ok(t.true === 3 && t.operating === 2 && t.dream === 3 && after.dream === 2 && after.retired === 1,
        JSON.stringify(t) + ' -> ' + JSON.stringify(after));
    } },

    { name: 'decay is measured from when he last WROTE it', run: () =>
      ok(decayDays({ last: '2025-08-03' }, '2026-08-03') === 365, String(decayDays({ last: '2025-08-03' }, '2026-08-03'))) },

    { name: 'a bare year in the registry still yields a number', run: () =>
      ok(decayDays({ last: '2021' }, '2026-08-03') > 1600) },

    { name: '⚠ the decay counter states a FACT, never a verdict', run: () => {
      // The PRD fenced Notion's "783 days past due": informational, never accusatory. Same number, and the
      // difference between "you are late" and "you wrote this a while ago" is the whole compassion clause.
      const line = decayLine({ last: '2018-11-06' }, '2026-08-03');
      const shaming = /(past due|overdue|behind|late|failed|missed|still not)/i.test(line);
      return ok(!shaming && /years ago/.test(line), JSON.stringify(line));
    } },

    // ── CHAINS ─────────────────────────────────────────────────────────────────────────────────────
    { name: 'a chain starts with what he can begin and ends at the goal', run: () => {
      const c = chainFor(GOALS[0], ACTIONS).chain;
      return ok(c[0].startable && c[0].id === 'a_send' && c[c.length - 1].id === 'a_debt', c.map((x) => x.id).join('>'));
    } },

    { name: '⚠ a dream goal is NOT planned, and says why', run: () => {
      const r = chainFor(GOALS.find((g) => g.id === 'g_castle'), ACTIONS);
      return ok(!r.planned && r.chain.length === 0 && /dream/.test(r.why), r.why);
    } },

    { name: 'a goal blocked by one of his boundaries is rendered, never planned', run: () => {
      const r = chainFor({ id: 'g_hf', t: 'A hedge fund', tier: 'dream', req: ['a_debt'], blocked: 'TRADING IS OFF' }, ACTIONS);
      return ok(!r.planned && r.chain.length === 0);
    } },

    // ── DECISIONS ──────────────────────────────────────────────────────────────────────────────────
    { name: 'keep / retire / achieved each land, and every tier starts UNCONFIRMED', run: () => {
      const g = applyDecisions(GOALS, { decisions: {
        g_ranch: { decision: 'keep' }, g_castle: { decision: 'retire' }, g_fit: { decision: 'achieved' } } });
      return ok(g[0].confirmed === true && g.find((x) => x.id === 'g_castle').retired === true
        && g.find((x) => x.id === 'g_fit').status === 'achieved'
        && unconfirmed(GOALS).length === GOALS.length);
    } },

    // ── THE ASSEMBLED VIEW + HARD DAY PROTOCOL ─────────────────────────────────────────────────────
    { name: '⚠ on a heavy day the gap number is not shown at all', run: () => {
      // Registry §6: "on a heavy day the engine shows the graph and one free win. No targets recited, no
      // deadlines, no gap number." Withheld not to be kind — a gap number on a bad day starts the spiral.
      const v = registryView({ goals: GOALS, actions: ACTIONS }, { hardDay: true, today: '2026-08-03' });
      return ok(v.leverage.length === 0 && v.top === null && v.oneThing && v.oneThing.tier !== 'dream',
        JSON.stringify({ lev: v.leverage.length, one: v.oneThing && v.oneThing.id }));
    } },

    { name: 'a normal day leads with the highest-leverage startable action', run: () => {
      const v = registryView({ goals: GOALS, actions: ACTIONS }, { today: '2026-08-03' });
      return ok(v.oneThing.id === 'a_send' && v.leverage.length > 0 && v.tiers.dream === 3);
    } },

    { name: 'empty / garbage input does not throw', run: () => {
      const v = registryView();
      return ok(v.ok && v.goals.length === 0 && !violatesBoundary() && decayDays({}) === null
        && chainFor().chain.length === 0 && freeWins().wins.length === 0 && unlockCounts().length === 0);
    } },
  ],
};
