// Regression suite for the horizon engine (pods/goal-horizon.mjs).
//
// The centrepiece is HIS example, verbatim: *"if i want a new lambo, and i also want to buy a business doing
// $1m usd per year, maybe those two goals can be related because if i buy the business, i could probably
// lease the lambo too."* If that case ever stops working, the engine has gone back to being a tracker.
//
// The second thing pinned hard is UNKNOWN. His credit report currently returns no score and his unit list
// still holds a placeholder row. An engine that reads either as zero would invent a reality and then
// reverse-engineer a plan out of the invention.

import { CAPS, isCap, capOf, meets, unmet, affords, affordedMap, blockers, layers, ladder, reverse }
  from '../pods/goal-horizon.mjs';

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
const GOALS = [BUSINESS, LAMBO, SENDS, TAXES];

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
      const L = layers(GOALS, REALITY);
      return ok(L.get('g_sends') < L.get('g_taxes') && L.get('g_taxes') < L.get('g_biz'),
        JSON.stringify([...L]));
    } },

    { name: 'height is DERIVED from the gap, not read off his stated horizon', run: () => {
      // The Lambo says '10y' and the business says '3y', yet the Lambo sits ABOVE the business, because the
      // business is what pays for it. A layout driven by the typed horizon would have inverted them.
      const L = layers(GOALS, REALITY);
      return ok(L.get('g_lambo') > L.get('g_biz'), 'lambo=' + L.get('g_lambo') + ' biz=' + L.get('g_biz'));
    } },

    { name: 'the ladder re-layers when his reality changes', run: () => {
      const richer = { ...REALITY, filed_years: { value: 2, source: 'tax pod', asOf: '2026-08-04' },
        liquid_capital: { value: 250000, source: 'accounts', asOf: '2026-08-04' },
        credit_score: { value: 700, source: 'myFICO', asOf: '2026-08-04' } };
      const before = layers(GOALS, REALITY).get('g_biz');
      const after = layers(GOALS, richer).get('g_biz');
      return ok(after === 1 && before > 1, before + ' -> ' + after);
    } },

    { name: 'blockers are the goals that PRODUCE what is missing', run: () =>
      ok(blockers(BUSINESS, GOALS, REALITY).includes('g_taxes')) },

    { name: 'a cycle renders a flat ladder instead of hanging', run: () => {
      const a = { id: 'a', t: 'a', requires: [{ cap: 'monthly_net', value: 99999 }], produces: [{ cap: 'filed_years', value: 9 }] };
      const b = { id: 'b', t: 'b', requires: [{ cap: 'filed_years', value: 9 }], produces: [{ cap: 'monthly_net', value: 99999 }] };
      const L = layers([a, b], REALITY);
      return ok(L.get('a') >= 1 && L.get('b') >= 1);
    } },

    { name: 'ladder() returns rungs, climbing edges and what is reachable now', run: () => {
      const l = ladder(GOALS, REALITY);
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
      const step = reverse(BUSINESS, GOALS, REALITY).steps.find((s) => s.cap === 'filed_years');
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

    { name: 'empty / garbage input does not throw', run: () => {
      const l = ladder(); const r = reverse();
      return ok(l.rungs.length === 0 && r.steps.length === 0 && unmet().length === 0
        && !affords().afforded && affordedMap().size === 0 && layers().size === 0);
    } },
  ],
};
