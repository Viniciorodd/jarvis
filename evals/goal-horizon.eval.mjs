// Regression suite for the horizon engine (pods/goal-horizon.mjs).
//
// The centrepiece is HIS example, verbatim: *"if i want a new lambo, and i also want to buy a business doing
// $1m usd per year, maybe those two goals can be related because if i buy the business, i could probably
// lease the lambo too."* If that case ever stops working, the engine has gone back to being a tracker.
//
// The second thing pinned hard is UNKNOWN. His credit report currently returns no score and his unit list
// still holds a placeholder row. An engine that reads either as zero would invent a reality and then
// reverse-engineer a plan out of the invention.

import { CAPS, isCap, capOf, meets, unmet, affords, affordedMap, blockers, layers, ladder, reverse,
  groundProposal, applyProposals, HORIZONS } from '../pods/goal-horizon.mjs';

const ok = (pass, detail = '') => ({ pass, detail });

// His real position, roughly, as the pods report it today.
const REALITY = {
  monthly_net:   { value: 3350,  source: 'money dashboard', asOf: '2026-08-04' },
  debt_load:     { value: 572,   source: '/api/finance/debts', asOf: '2026-08-04' },
  filed_years:   { value: 0,     source: 'tax pod', asOf: '2026-08-04' },
  free_hours:    { value: 20,    source: 'focus pod', asOf: '2026-08-04' },
  operating_entity: { value: true, source: 'Rodgate LLC', asOf: '2026-08-04' },
  // credit_score and liquid_capital are DELIBERATELY absent — that is the live truth.
};

// The same position once he has actually pulled the numbers. Placement tests use THIS, because an unmeasured
// requirement makes a goal unplaceable-pending rather than unreachable, and the two must not be conflated.
const MEASURED = {
  ...REALITY,
  credit_score:   { value: 640,  source: 'myFICO', asOf: '2026-08-04' },
  liquid_capital: { value: 8000, source: 'accounts', asOf: '2026-08-04' },
};

const BUSINESS = {
  id: 'g_biz', t: 'Buy a business doing $1M/yr', tier: 'operating', horizon: '3y',
  requires: [
    { cap: 'liquid_capital', value: 200000 },
    { cap: 'filed_years', value: 2 },
    { cap: 'credit_score', value: 680 },
  ],
  produces: [
    { cap: 'monthly_net', value: 16000 },
    { cap: 'collateral', value: 400000 },
    { cap: 'business_credit', value: 80 },
  ],
};
const LAMBO = {
  id: 'g_lambo', t: 'A Lamborghini Urus', tier: 'dream', horizon: '10y',
  requires: [{ cap: 'monthly_net', value: 12000 }],
  produces: [],
};
const SENDS = {
  id: 'g_sends', t: 'Sending going out every day', tier: 'operating', horizon: 'now',
  requires: [{ cap: 'free_hours', value: 5 }],
  produces: [{ cap: 'monthly_net', value: 10000 }, { cap: 'past_performance', value: 1 }],
};
const TAXES = {
  id: 'g_taxes', t: 'Two years of filed returns showing income', tier: 'operating', horizon: '3y',
  requires: [{ cap: 'monthly_net', value: 8000 }],
  produces: [{ cap: 'filed_years', value: 2 }],
};
// The two links that make the chain to the business complete. Without something that PRODUCES capital and
// credit, the business has no modelled path at all — which the engine correctly refuses to place, and which
// is exactly the state his real registry is in until he fills these in.
const SAVE = {
  id: 'g_save', t: 'A $250k war chest', tier: 'operating', horizon: '3y',
  requires: [{ cap: 'monthly_net', value: 10000 }],
  produces: [{ cap: 'liquid_capital', value: 250000 }],
};
const CREDIT = {
  id: 'g_credit', t: 'Credit repaired to 720', tier: 'operating', horizon: '1y',
  requires: [{ cap: 'debt_load', value: 1500 }],
  produces: [{ cap: 'credit_score', value: 720 }],
};
const GOALS = [BUSINESS, LAMBO, SENDS, TAXES, SAVE, CREDIT];

export default {
  agent: 'goal-horizon',
  cases: [
    // ── 🏎 HIS EXAMPLE ─────────────────────────────────────────────────────────────────────────────
    { name: '🏎 the Lambo comes WITH the business — his whole point', run: () => {
      const r = affords(BUSINESS, LAMBO, REALITY);
      return ok(r.afforded && r.covers.some((c) => c.cap === 'monthly_net' && c.from >= 12000),
        JSON.stringify(r));
    } },

    { name: '🏎 …and it says WHICH capability does the work, not just "yes"', run: () => {
      const c = affords(BUSINESS, LAMBO, REALITY).covers[0];
      return ok(c.cap === 'monthly_net' && c.need === 12000 && c.from === 16000, JSON.stringify(c));
    } },

    { name: '🏎 the Lambo does NOT afford the business — this is directional', run: () =>
      ok(!affords(LAMBO, BUSINESS, REALITY).afforded) },

    { name: 'a goal affords nothing it cannot fully cover', run: () => {
      // Sends produce $10k/mo; the Lambo needs $12k. Close is not covered.
      const r = affords(SENDS, LAMBO, REALITY);
      return ok(!r.afforded && r.missing.some((m) => m.cap === 'monthly_net'), JSON.stringify(r));
    } },

    { name: 'the map names everything a goal brings along', run: () => {
      const m = affordedMap(GOALS, REALITY);
      return ok((m.get('g_biz') || []).some((b) => b.id === 'g_lambo'), JSON.stringify([...m]));
    } },

    // ── ⚠ UNKNOWN IS NOT ZERO ──────────────────────────────────────────────────────────────────────
    { name: '⚠ a capability nobody has looked up reads UNKNOWN, never 0', run: () => {
      const c = capOf(REALITY, 'credit_score');
      return ok(!c.known && c.value === null, JSON.stringify(c)) ;
    } },

    { name: '⚠ an unknown requirement is neither met nor failed', run: () =>
      ok(meets(REALITY, { cap: 'credit_score', value: 680 }) === 'unknown'
        && meets(REALITY, { cap: 'filed_years', value: 2 }) === 'no'
        && meets(REALITY, { cap: 'monthly_net', value: 3000 }) === 'yes') },

    { name: '⚠ an unknown blocks the CLAIM but is reported apart from real misses', run: () => {
      // Nothing may say "you can afford this" while a requirement is unmeasured.
      const gift = { id: 'g_gift', t: 'gift', requires: [], produces: [{ cap: 'liquid_capital', value: 500000 }, { cap: 'filed_years', value: 2 }] };
      const r = affords(gift, BUSINESS, REALITY);
      return ok(!r.afforded && r.unknown.some((u) => u.cap === 'credit_score') && r.missing.length === 0,
        JSON.stringify(r));
    } },

    { name: '⚠ every known value carries where it came from and when', run: () => {
      const c = capOf(REALITY, 'monthly_net');
      return ok(c.known && c.source === 'money dashboard' && c.asOf === '2026-08-04') ;
    } },

    // ── the ladder ─────────────────────────────────────────────────────────────────────────────────
    { name: 'what he can start today sits on rung 1', run: () => {
      // He has 20 free hours; sending needs 5. Nothing comes first.
      return ok(layers(GOALS, REALITY).get('g_sends') === 1, String(layers(GOALS, REALITY).get('g_sends')));
    } },

    { name: 'the ladder climbs: sends → filed years → the business', run: () => {
      const L = layers(GOALS, MEASURED);
      return ok(L.get('g_sends') < L.get('g_taxes') && L.get('g_taxes') < L.get('g_biz'),
        JSON.stringify([...L]));
    } },

    { name: 'height is DERIVED from the gap, not read off his stated horizon', run: () => {
      // The Lambo says '10y' and the business says '3y', yet the Lambo sits ABOVE the business, because the
      // business is what pays for it. A layout driven by the typed horizon would have inverted them.
      const L = layers(GOALS, MEASURED);
      return ok(L.get('g_lambo') > L.get('g_biz'), 'lambo=' + L.get('g_lambo') + ' biz=' + L.get('g_biz'));
    } },

    { name: 'the ladder re-layers when his reality changes', run: () => {
      const richer = { ...MEASURED, filed_years: { value: 2, source: 'tax pod', asOf: '2026-08-04' },
        liquid_capital: { value: 250000, source: 'accounts', asOf: '2026-08-04' },
        credit_score: { value: 700, source: 'myFICO', asOf: '2026-08-04' } };
      const before = layers(GOALS, MEASURED).get('g_biz');
      const after = layers(GOALS, richer).get('g_biz');
      return ok(after === 1 && before > 1, before + ' -> ' + after);
    } },

    { name: 'blockers are the goals that PRODUCE what is missing', run: () =>
      ok(blockers(BUSINESS, GOALS, REALITY).includes('g_taxes')) },

    { name: '⚠ "no known path" is NOT rung 1 — that would be a false promise', run: () => {
      // The first version gave every goal a rung, so anything nothing produced fell to the bottom and read
      // as "start this today". On his real data that put the RANCH and $10k/mo on rung 1.
      const orphan = { id: 'g_orphan', t: 'Own an island', tier: 'dream',
        requires: [{ cap: 'liquid_capital', value: 5000000 }], produces: [] };
      const L = layers([...GOALS, orphan], MEASURED);
      return ok(L.get('g_orphan') === null, String(L.get('g_orphan')));
    } },

    { name: '⚠ unreachable goals go on their own shelf, not the bottom rung', run: () => {
      const orphan = { id: 'g_orphan', t: 'Own an island', requires: [{ cap: 'liquid_capital', value: 5000000 }], produces: [] };
      const l = ladder([...GOALS, orphan], MEASURED);
      return ok(l.noPath.some((g) => g.id === 'g_orphan')
        && !l.reachableNow.includes('g_orphan'), JSON.stringify(l.noPath.map((g) => g.id)));
    } },

    { name: 'a goal is placed only when EVERY missing capability has a producer', run: () => {
      // Half a path is not a path: liquid_capital has a producer here, credit_score does not.
      const half = { id: 'g_half', t: 'half', requires: [{ cap: 'liquid_capital', value: 999999 }, { cap: 'credit_score', value: 700 }], produces: [] };
      const giver = { id: 'g_giver', t: 'giver', requires: [], produces: [{ cap: 'liquid_capital', value: 999999 }] };  // covers capital, nothing covers credit
      return ok(layers([half, giver], MEASURED).get('g_half') === null);
    } },

    { name: '⚠ an UNMEASURED requirement makes a goal pending, not unreachable', run: () => {
      // The business needs a 680 score. Nobody has pulled his report, so it might already be met — calling it
      // unreachable would invent an obstacle, and placing it would invent a qualification.
      const l = ladder(GOALS, REALITY);
      const p = l.pending.find((g) => g.id === 'g_biz');
      return ok(p && p.needsMeasuring.includes('credit_score') && !l.noPath.some((g) => g.id === 'g_biz'),
        JSON.stringify(l.pending.map((g) => g.id + ':' + g.needsMeasuring)));
    } },

    { name: 'measuring the number moves it off the pending shelf onto a rung', run: () => {
      const before = ladder(GOALS, REALITY).pending.some((g) => g.id === 'g_biz');
      const after = layers(GOALS, MEASURED).get('g_biz');
      return ok(before && after !== null, before + ' -> rung ' + after);
    } },

    { name: '⚠ "never measured" and "only partly known" are told apart', run: () => {
      // Different problems, different remedies: one sends him to pull a credit report, the other tells Jarvis
      // it is only counting rental income. Labelling both "unmeasured" would send him looking up a number he
      // already has.
      const partial = { ...REALITY, monthly_net: { value: 2500, source: 'rent only', asOf: 'x', partial: true } };
      const g = { id: 'g_x', t: 'x', requires: [{ cap: 'monthly_net', value: 9000 }, { cap: 'credit_score', value: 700 }], produces: [] };
      const p = ladder([g], partial).pending[0];
      return ok(p.needsMeasuring.join() === 'credit_score' && p.needsCompleting.join() === 'monthly_net',
        JSON.stringify({ m: p.needsMeasuring, c: p.needsCompleting }));
    } },

    { name: 'a cycle renders a flat ladder instead of hanging', run: () => {
      const a = { id: 'a', t: 'a', requires: [{ cap: 'monthly_net', value: 99999 }], produces: [{ cap: 'filed_years', value: 9 }] };
      const b = { id: 'b', t: 'b', requires: [{ cap: 'filed_years', value: 9 }], produces: [{ cap: 'monthly_net', value: 99999 }] };
      const L = layers([a, b], REALITY);
      return ok(L.get('a') >= 1 && L.get('b') >= 1);
    } },

    { name: 'ladder() returns rungs, climbing edges and what is reachable now', run: () => {
      const l = ladder(GOALS, MEASURED);
      return ok(l.rungs.length >= 3 && l.reachableNow.includes('g_sends')
        && l.edges.some((e) => e.kind === 'affords' && e.from === 'g_biz' && e.to === 'g_lambo'),
        JSON.stringify({ rungs: l.rungs.length, now: l.reachableNow }));
    } },

    // ── reverse-engineering ────────────────────────────────────────────────────────────────────────
    { name: 'reverse() answers "what needs to happen before I get there"', run: () => {
      const r = reverse(BUSINESS, GOALS, REALITY);
      const caps = r.steps.map((s) => s.cap);
      return ok(caps.includes('filed_years') && caps.includes('liquid_capital') && caps.includes('credit_score'),
        JSON.stringify(caps));
    } },

    { name: 'unmeasured gaps outrank measured ones — you cannot plan around a number nobody looked up', run: () => {
      const r = reverse(BUSINESS, GOALS, REALITY);
      const firstKnown = r.steps.findIndex((s) => s.known);
      const lastUnknown = r.steps.map((s) => s.known).lastIndexOf(false);
      return ok(r.nextGap && r.nextGap.known === false && lastUnknown < firstKnown,
        JSON.stringify(r.steps.map((s) => s.cap + (s.known ? '' : '?'))));
    } },

    { name: '⚠ when several numbers are unmeasured, they come back as a GROUP', run: () => {
      // Two unknowns and no honest way to rank them: credit score and liquid capital have both simply never
      // been looked up. Naming one as "the next step" would imply the other was handled.
      const r = reverse(BUSINESS, GOALS, REALITY);
      const caps = r.unknowns.map((u) => u.cap).sort();
      return ok(caps.join(',') === 'credit_score,liquid_capital', JSON.stringify(caps));
    } },

    { name: 'each gap names the goal that closes it', run: () => {
      const step = reverse(BUSINESS, GOALS, MEASURED).steps.find((s) => s.cap === 'filed_years');
      return ok(step.via.some((v) => v.id === 'g_taxes'), JSON.stringify(step));
    } },

    { name: 'a goal already within reach reports reachable, with no steps', run: () =>
      ok(reverse(SENDS, GOALS, REALITY).reachable === true && reverse(SENDS, GOALS, REALITY).steps.length === 0) },

    { name: 'the capability vocabulary is closed — junk is refused', run: () =>
      ok(isCap('monthly_net') && !isCap('vibes') && meets(REALITY, { cap: 'vibes', value: 1 }) === 'unknown') },

    { name: 'a "down" capability is met by being BELOW the threshold', run: () =>
      // debt is the one that improves by shrinking; $572/mo satisfies "under $1,500"
      ok(meets(REALITY, { cap: 'debt_load', value: 1500 }) === 'yes'
        && meets(REALITY, { cap: 'debt_load', value: 100 }) === 'no') },

    // ── ⚠ PARTIAL VALUES ARE LOWER BOUNDS ──────────────────────────────────────────────────────────
    // Jarvis can only total his RENTAL income today, so monthly_net arrives flagged partial. A lower bound
    // settles the question in exactly one direction, and which direction flips with the capability.
    { name: '⚠ a lower bound that CLEARS the bar is a definite yes', run: () => {
      const partial = { monthly_net: { value: 2500, source: 'rent only', asOf: '2026-08-04', partial: true } };
      return ok(meets(partial, { cap: 'monthly_net', value: 2000 }) === 'yes');
    } },

    { name: '⚠ a lower bound that MISSES is unknown, not a no — the rest could close it', run: () => {
      // Rent alone is $2,500; his real figure is ~$3,350. Answering "no" to a $3,000 requirement would
      // invent an obstacle out of our own incomplete measurement.
      const partial = { monthly_net: { value: 2500, source: 'rent only', asOf: '2026-08-04', partial: true } };
      return ok(meets(partial, { cap: 'monthly_net', value: 3000 }) === 'unknown',
        meets(partial, { cap: 'monthly_net', value: 3000 }));
    } },

    { name: '⚠ for DEBT the asymmetry inverts — over the line is definite, under it is not', run: () => {
      // "at least $572/mo of debt" definitively fails "under $100", but cannot confirm "under $1,500":
      // the debts we have not seen could push it over.
      const partial = { debt_load: { value: 572, source: 'partial', asOf: '2026-08-04', partial: true } };
      return ok(meets(partial, { cap: 'debt_load', value: 100 }) === 'no'
        && meets(partial, { cap: 'debt_load', value: 1500 }) === 'unknown',
        meets(partial, { cap: 'debt_load', value: 100 }) + '/' + meets(partial, { cap: 'debt_load', value: 1500 }));
    } },

    // ── GROUNDING: the model proposes, code disposes ───────────────────────────────────────────────
    { name: 'an invented capability is DROPPED, never coerced', run: () => {
      // A made-up capability becomes a made-up prerequisite, and then the whole ladder is reverse-engineered
      // out of fiction. Same rule as the RFP shredder's groundRows.
      const g = groundProposal({ horizon: '3y', requires: [{ cap: 'vibes', value: 10 }, { cap: 'monthly_net', value: 8000 }] });
      return ok(g.requires.length === 1 && g.requires[0].cap === 'monthly_net' && g.dropped.includes('cap:vibes'),
        JSON.stringify(g));
    } },

    { name: 'a horizon outside the fixed set is dropped', run: () => {
      const g = groundProposal({ horizon: 'someday', requires: [] });
      return ok(g.horizon === '' && g.dropped.some((d) => d.startsWith('horizon:')), JSON.stringify(g));
    } },

    { name: 'zero and non-numbers are not requirements', run: () => {
      const g = groundProposal({ requires: [{ cap: 'monthly_net', value: 0 }, { cap: 'liquid_capital', value: 'lots' }] });
      return ok(g.requires.length === 0 && g.dropped.length === 2, JSON.stringify(g));
    } },

    { name: 'a yes/no capability refuses a number', run: () => {
      const g = groundProposal({ produces: [{ cap: 'legal_clear', value: 1 }, { cap: 'operating_entity', value: true }] });
      return ok(g.produces.length === 1 && g.produces[0].cap === 'operating_entity', JSON.stringify(g));
    } },

    { name: 'every horizon the UI offers is one the grounder accepts', run: () =>
      ok(HORIZONS.every((h) => groundProposal({ horizon: h }).horizon === h), JSON.stringify(HORIZONS)) },

    { name: 'a proposal rides along UNCONFIRMED until he taps', run: () => {
      const store = { proposals: { g_biz: { horizon: '3y', requires: [{ cap: 'filed_years', value: 2 }], produces: [], status: 'proposed', at: 'x' } } };
      const g = applyProposals([BUSINESS], store)[0];
      return ok(g.horizonConfirmed === false && g.proposalStatus === 'proposed' && g.requires.length === 1);
    } },

    { name: 'confirming one marks it his, not the machine\'s', run: () => {
      const store = { proposals: { g_biz: { horizon: '10y', requires: [], produces: [], status: 'confirmed', at: 'x' } } };
      const g = applyProposals([BUSINESS], store)[0];
      return ok(g.horizonConfirmed === true && g.horizon === '10y');
    } },

    { name: 'empty / garbage input does not throw', run: () => {
      const l = ladder(); const r = reverse();
      return ok(l.rungs.length === 0 && l.pending.length === 0 && r.steps.length === 0 && unmet().length === 0
        && !affords().afforded && affordedMap().size === 0 && layers().size === 0);
    } },
  ],
};
