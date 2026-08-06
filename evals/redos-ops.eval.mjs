// Regression suite for REDOS Ops (pods/redos-ops/).
//
// The PRD's §11 list, plus the rule that outranks all of them: this dashboard must never show a
// number that a good day of coding can move. His Belief Log has named that pattern five times —
// "building is not earning" — and a dashboard that rewards building would make the problem worse
// rather than visible.
//
// The second theme is that ABSENCE IS NOT A VALUE. Roughly half these cases exist to prove that a
// dead source produces null and not zero, because every one of those confusions makes the dashboard
// lie while each individual number in it stays technically correct.

import { customers, revenue, funnel, sends, needsFollowUp, health, isStale, digest,
  assertNoVanity, BANNED_METRICS, NET_DEFINITION, STALE_HOURS } from '../pods/redos-ops/metrics.mjs';
import { evaluate, phase, gateLine, GATES } from '../pods/redos-ops/gates.mjs';
import { emptySnapshot, withSource, series } from '../pods/redos-ops/store.mjs';
import { summarise, isRedosProduct, normaliseSale } from '../pods/redos-ops/sources/gumroad.mjs';

const ok = (pass, detail = '') => ({ pass, detail });

const src = (data, over = {}) => ({ ok: true, data, fetchedAt: '2026-08-06T06:00:00Z', error: '', ...over });
const dead = (error = 'API 500') => ({ ok: false, data: null, fetchedAt: null, error });

// One paid customer, deliberately unclassified — which is the real state today.
const SNAP = {
  at: '2026-08-06T06:00:00Z',
  sources: {
    gumroad: src({
      customers: [{ id: 'c1', at: '2026-08-01', is_friend: undefined, hand_sold: undefined }],
      gross_cents: 14900, fee_cents: 1490, affiliate_cents: 0, refund_cents: 0, orders: 1,
      by_tier: { investor: 1 },
    }),
    supabase: src({ signups: 40, analysed_a_deal: 12 }),
    posthog: src({ visitors: 900 }),
    outreach: src({ sent: 2, replied: 0, no_reply: 2,
      targets: [{ who: 'Lex Levinrad', sent_at: '2026-07-28', replied_at: null }] }),
    brand: src({ published: 5, by_platform: { bluesky: 3, mastodon: 2 } }),
  },
};

export default {
  agent: 'redos-ops',
  cases: [
    // ── 🚫 the rule that outranks the others ──────────────────────────────────────────────────────
    { name: '🚫 a metric that rewards BUILDING cannot be rendered', run: () => {
      // Commits, modules, evals green: all go up when he builds and stay flat when he sells, which is
      // backwards for the exact failure mode this dashboard exists to make visible.
      let threw = false;
      try { assertNoVanity({ commits: 40, netUsd: 149 }); } catch { threw = true; }
      return ok(threw && BANNED_METRICS.has('followers') && BANNED_METRICS.has('evals_green')
        && BANNED_METRICS.has('impressions'), 'threw: ' + threw);
    } },

    { name: '🚫 it THROWS rather than silently dropping the metric', run: () => {
      // Filtering would let the caller believe it was displayed, and the next person would "fix" the
      // display. A failing test is the point.
      let msg = '';
      try { assertNoVanity(['impressions']); } catch (e) { msg = e.message; }
      return ok(/banned metric/.test(msg) && /Building is not earning/.test(msg), msg.slice(0, 70));
    } },

    { name: 'the honest metrics pass the guard', run: () =>
      ok(assertNoVanity({ nonFriend: 1, netUsd: 134.1, emailsSent: 2, signups: 40 }) === true) },

    // ── 🚨 the one number ─────────────────────────────────────────────────────────────────────────
    { name: '🚨 an unclassified buyer does NOT count as a stranger', run: () => {
      // is_friend defaults to unknown, and unknown never counts. Otherwise the headline number drifts
      // upward on its own, which is the one thing it exists not to do.
      const c = customers(SNAP);
      return ok(c.nonFriend === 0 && c.unknown === 1 && c.total === 1, JSON.stringify(c));
    } },

    { name: 'a deliberately classified stranger counts; a friend never does', run: () => {
      const s = { ...SNAP, sources: { ...SNAP.sources, gumroad: src({
        customers: [{ is_friend: false, at: '2026-08-01' }, { is_friend: true, at: '2026-08-02' }, { at: '2026-08-03' }],
        gross_cents: 0, fee_cents: 0, affiliate_cents: 0, orders: 0 }) } };
      const c = customers(s);
      return ok(c.nonFriend === 1 && c.friend === 1 && c.unknown === 1 && c.latest === '2026-08-01',
        JSON.stringify(c));
    } },

    { name: '⚠ a dead revenue source gives null customers, never 0', run: () => {
      const c = customers({ sources: { gumroad: dead('no API key') } });
      return ok(c.nonFriend === null && c.total === null && /no API key/.test(c.why), JSON.stringify(c));
    } },

    // ── 🚨 what must never end up in the customer count ───────────────────────────────────────────
    { name: '🚨 his own checkout test is not a customer', run: () => {
      // Confirmed 2026-08-06: the one apparent REDOS sale was him testing checkout. A test row is not
      // a friend — a friend is at least a person — so conflating the two would have left his own test
      // sitting in the denominator of the north-star metric.
      const sales = [{ id: 's1', product_name: 'REDOS — Starter (Lifetime)', price: 0, created_at: '2026-08-01' }];
      const d = summarise(sales, { s1: { is_test: true } });
      return ok(d.customers.length === 0 && d.orders === 0 && d.excluded.self_tests === 1,
        JSON.stringify(d.excluded));
    } },

    { name: '🚨 buyers of a DIFFERENT product are not REDOS customers', run: () => {
      // The account carries an old Twitter ebook with four free downloads. Counting those would have
      // put "4" against a metric that means "strangers who wanted THIS" — wrong in the flattering
      // direction, which is the worst kind.
      const sales = [
        { id: 'a', product_name: 'How I Increased My Twitter Engagement over 116,308%', price: 0 },
        { id: 'b', product_name: 'REDOS — Starter (Lifetime)', price: 7900 },
      ];
      const d = summarise(sales, {});
      return ok(d.customers.length === 1 && d.excluded.other_products === 1
        && isRedosProduct('REDOS — Starter') && !isRedosProduct('Twitter Pro'), JSON.stringify(d.excluded));
    } },

    { name: '⚠ exclusions are COUNTED, never silent', run: () => {
      // A number that quietly got smaller is a number nobody can audit.
      const d = summarise([{ id: 'x', product_name: 'Other thing', price: 100 }], {});
      return ok(d.excluded.other_products === 1 && d.excluded.self_tests === 0);
    } },

    { name: '🔒 no buyer email survives normalisation', run: () => {
      const row = normaliseSale({ id: 's', product_name: 'REDOS', email: 'a@b.com',
        purchase_email: 'a@b.com', zip_code: '18641', license_key: 'ABC' }, {});
      return ok(!JSON.stringify(row).includes('@') && !('email' in row) && !('zip_code' in row),
        JSON.stringify(row));
    } },

    { name: 'is_test defaults to false, is_friend to undefined', run: () => {
      const row = normaliseSale({ id: 's', product_name: 'REDOS' }, {});
      return ok(row.is_test === false && row.is_friend === undefined && row.hand_sold === undefined);
    } },

    // ── money ─────────────────────────────────────────────────────────────────────────────────────
    { name: 'net is defined once and travels with the number', run: () => {
      const r = revenue(SNAP);
      return ok(r.grossUsd === 149 && r.netUsd === 134.1 && r.netDefinition === NET_DEFINITION
        && /affiliate commission/.test(r.netDefinition), JSON.stringify({ g: r.grossUsd, n: r.netUsd }));
    } },

    { name: '⚠ an average of nothing is nothing, not zero', run: () => {
      const s = { sources: { gumroad: src({ customers: [], gross_cents: 0, fee_cents: 0, affiliate_cents: 0, orders: 0 }) } };
      return ok(revenue(s).aovUsd === null, String(revenue(s).aovUsd));
    } },

    { name: '⚠ incomplete revenue data yields null net, not a partial sum', run: () => {
      const s = { sources: { gumroad: src({ gross_cents: 14900, orders: 1 }) } };   // no fee/affiliate
      return ok(revenue(s).netUsd === null, String(revenue(s).netUsd));
    } },

    // ── the gates ─────────────────────────────────────────────────────────────────────────────────
    { name: 'the three gates come from the campaign, unchanged', run: () =>
      ok(GATES.length === 3 && GATES[0].target === 10 && GATES[1].target === 40 && GATES[2].target === 10000) },

    { name: '🚨 an UNMEASURABLE gate is null, not failed', run: () => {
      // False says "we checked and you have not got there". Null says "we could not check". Showing
      // the second as the first puts a red mark against a week he may well have won.
      const g = evaluate({ sources: { gumroad: dead() } });
      return ok(g.every((x) => x.met === null) && g[0].pct === null, JSON.stringify(g.map((x) => x.met)));
    } },

    { name: 'an unclassified sale cannot prove the product sells itself', run: () => {
      const g = evaluate(SNAP).find((x) => x.id === 'unattended');
      return ok(g.met === null && /classified/.test(g.why), JSON.stringify(g));
    } },

    { name: 'gates evaluate honestly once the data is there', run: () => {
      const s = { sources: { gumroad: src({
        customers: Array.from({ length: 12 }, (_, i) => ({ is_friend: false, hand_sold: i < 4, at: '2026-08-0' + (i % 9 + 1) })),
        gross_cents: 200000, fee_cents: 20000, affiliate_cents: 0, orders: 12 }) } };
      const g = evaluate(s);
      return ok(g[0].met === true && g[1].value > 60 && g[1].met === true && g[2].met === false,
        JSON.stringify(g.map((x) => [x.id, x.value, x.met])));
    } },

    { name: 'the phase is the first gate not met, and says when it cannot tell', run: () => {
      const p = phase(SNAP);
      return ok(p.gate.id === 'strangers' && p.blocked === false, JSON.stringify(p.phase));
    } },

    { name: 'the gate line states the position without scoring it', run: () => {
      const line = gateLine(SNAP);
      return ok(!/(behind|failed|only|still|missed)/i.test(line) && /Strangers want it/.test(line), line);
    } },

    // ── funnel ────────────────────────────────────────────────────────────────────────────────────
    { name: 'the funnel names the biggest drop', run: () => {
      const f = funnel(SNAP);
      return ok(f.biggestDrop.from === 'visitors' && f.biggestDrop.to === 'signups', JSON.stringify(f.biggestDrop));
    } },

    { name: '⚠ a step with an unknown input is skipped, not read as a 100% drop', run: () => {
      const s = { ...SNAP, sources: { ...SNAP.sources, posthog: dead() } };
      const f = funnel(s);
      return ok(f.complete === false && f.biggestDrop.from !== 'visitors', JSON.stringify(f.biggestDrop));
    } },

    // ── sends + follow-ups ────────────────────────────────────────────────────────────────────────
    { name: 'sends counts OUTPUT, and the shape is vanity-guarded', run: () => {
      const s = sends(SNAP);
      return ok(s.postsPublished === 5 && s.emailsSent === 2 && !('impressions' in s) && !('likes' in s),
        JSON.stringify(Object.keys(s)));
    } },

    { name: 'a 7-day silence surfaces, and is never auto-chased', run: () => {
      // The PRD wants this SURFACED. Cold outreach stays human-sent, permanently — so this returns a
      // list to look at and there is deliberately no send function anywhere in this pod.
      const f = needsFollowUp(SNAP, '2026-08-06T00:00:00Z');
      return ok(f.length === 1 && f[0].who === 'Lex Levinrad' && f[0].days === 9, JSON.stringify(f));
    } },

    { name: 'a recent send does not nag', run: () =>
      ok(needsFollowUp({ sources: { outreach: src({ targets: [{ who: 'X', sent_at: '2026-08-05' }] }) } },
        '2026-08-06T00:00:00Z').length === 0) },

    // ── staleness + health ────────────────────────────────────────────────────────────────────────
    { name: 'a stale snapshot marks the page stale', run: () => {
      const fresh = isStale(SNAP, '2026-08-06T20:00:00Z');
      const old = isStale(SNAP, '2026-08-08T20:00:00Z');
      return ok(!fresh.stale && old.stale && STALE_HOURS === 26, JSON.stringify([fresh.stale, old.stale]));
    } },

    { name: '⚠ a snapshot with no timestamp is stale, not fresh', run: () =>
      ok(isStale({}, '2026-08-06T00:00:00Z').stale === true) },

    { name: 'health names which source is failing and why', run: () => {
      const h = health({ ...SNAP, sources: { ...SNAP.sources, posthog: dead('401') } });
      const bad = h.find((x) => x.name === 'posthog');
      return ok(bad.state === 'failing' && bad.error === '401' && h.find((x) => x.name === 'gumroad').state === 'live');
    } },

    // ── purity ────────────────────────────────────────────────────────────────────────────────────
    { name: '⚠ metrics are PURE — same input, same output, no clock', run: () => {
      const a = JSON.stringify([customers(SNAP), revenue(SNAP), funnel(SNAP), evaluate(SNAP)]);
      const b = JSON.stringify([customers(SNAP), revenue(SNAP), funnel(SNAP), evaluate(SNAP)]);
      return ok(a === b);
    } },

    // ── the digest ────────────────────────────────────────────────────────────────────────────────
    { name: 'the digest is four lines and prints unknown as unknown', run: () => {
      const d = digest({ ...SNAP, sources: { ...SNAP.sources, gumroad: dead() } }, '2026-08-06T00:00:00Z');
      return ok(d.length === 4 && /unknown/.test(d[0]) && !/\b0\b/.test(d[0]), JSON.stringify(d));
    } },

    { name: 'the digest never scolds', run: () => {
      const d = digest(SNAP, '2026-08-06T00:00:00Z').join(' ');
      return ok(!/(behind|failed|still no|only|days since|streak)/i.test(d), d);
    } },

    // ── the store ─────────────────────────────────────────────────────────────────────────────────
    { name: 'a source that fails is normalised, and always says why', run: () => {
      const s = withSource(emptySnapshot('2026-08-06T06:00:00Z'), 'gumroad', { ok: false });
      return ok(s.sources.gumroad.ok === false && s.sources.gumroad.data === null
        && s.sources.gumroad.error.length > 0, JSON.stringify(s.sources.gumroad));
    } },

    { name: '⚠ a gap in the series stays a gap, not a flat line', run: () => {
      const out = series([{ at: '2026-08-02', sources: {} }, { at: '2026-08-01', sources: {} }],
        (s) => (s.at === '2026-08-01' ? 3 : null));
      return ok(out[0].at === '2026-08-01' && out[0].value === 3 && out[1].value === null, JSON.stringify(out));
    } },

    { name: 'empty / garbage input does not throw', run: () => {
      const c = customers(), r = revenue(), f = funnel(), g = evaluate();
      return ok(c.nonFriend === null && r.netUsd === null && f.complete === false
        && g.every((x) => x.met === null) && needsFollowUp().length === 0
        && health().length === 0 && series().length === 0 && digest().length === 4);
    } },
  ],
};
