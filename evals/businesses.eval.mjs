// Regression suite for the Businesses registry (pods/businesses.mjs). Pins the "whose move is next"
// + status derivation each business row shows, and that the registry stays the single add-a-business point.

import { BUSINESSES, summarize, buildHub, needsYouCount } from '../pods/businesses.mjs';

const ok = (pass, detail = '') => ({ pass, detail });

export default {
  agent: 'businesses',
  cases: [
    { name: 'registry lists all 9 businesses with unique ids + icons', run: () => {
      const ids = BUSINESSES.map((b) => b.id);
      return ok(BUSINESSES.length === 9 && new Set(ids).size === 9 && BUSINESSES.every((b) => b.name && b.icon && b.source),
        ids.join(','));
    } },

    // ── 🚨 REDOS has a seat. Operator, 2026-08-07: "I have no business control for REDOS within
    //    Jarvis." The engine existed for weeks; this registry is the file that kept it invisible.
    { name: '🚨 REDOS is registered — his one live product is not missing from the hub', run: () => {
      const b = BUSINESSES.find((x) => x.id === 'redos');
      return ok(!!b && b.source === 'redos' && b.board === 'generic', JSON.stringify(b)) } },

    { name: '🚨 unknown renders as UNKNOWN, never as zero', run: () => {
      // A dashboard that shows "0 strangers" for "we could not reach Gumroad" reads as a measured flop
      // rather than a broken connector, and he would make decisions on it.
      const s = summarize(BUSINESSES.find((b) => b.id === 'redos'),
        { redos: { customers: { nonFriend: null }, revenue: { netUsd: null }, gates: [], gateLine: 'x' } });
      return ok(/unknown strangers/.test(s.status) && /unknown net/.test(s.status) && s.metric === 'unknown',
        JSON.stringify({ status: s.status, metric: s.metric })) } },

    { name: '🚨 a post held for unconfirmed figures is YOUR move and outranks everything else', run: () => {
      // Nothing else can release it — not the kill window, not silence. So it beats a live batch.
      const s = summarize(BUSINESSES.find((b) => b.id === 'redos'), { redos: {
        customers: { nonFriend: 3 }, revenue: { netUsd: 0 }, gates: [], gateLine: 'Strangers want it: 3 of 10',
        posts: { status: { published: 2, total: 15 }, next: [], held: [{ n: 1, title: 'Taxes', pending: ['2,650'] }],
          pending: { batchId: 'b1', closesAt: '2026-08-10T09:20:00Z', decision: null } } } });
      return ok(s.next.who === 'you' && /held/.test(s.next.text) && /nothing else can/.test(s.next.text),
        JSON.stringify(s.next)) } },

    { name: 'a batch in flight with nothing held is Jarvis move', run: () => {
      const s = summarize(BUSINESSES.find((b) => b.id === 'redos'), { redos: {
        customers: { nonFriend: 3 }, revenue: { netUsd: 0 }, gates: [], gateLine: 'x',
        posts: { status: { published: 2, total: 15 }, next: [], held: [],
          pending: { batchId: 'b1', closesAt: '2026-08-10T09:20:00Z', decision: null } } } });
      return ok(s.next.who === 'jarvis' && /unless you stop it/.test(s.next.text), JSON.stringify(s.next)) } },

    { name: 'a stale snapshot is YOUR move — a dashboard that looks live and is not is worse than none', run: () => {
      const s = summarize(BUSINESSES.find((b) => b.id === 'redos'), { redos: {
        stale: true, customers: { nonFriend: 3 }, revenue: { netUsd: 0 }, gates: [], gateLine: 'x' } });
      return ok(s.next.who === 'you' && /stale/i.test(s.next.text) && /stale/.test(s.status), JSON.stringify(s.next)) } },

    { name: 'no engine at all shows the setup path, not a fake zero', run: () => {
      const s = summarize(BUSINESSES.find((b) => b.id === 'redos'), { redos: null });
      return ok(s.setup === true && /collect\.mjs/.test(s.next.text), JSON.stringify(s.next)) } },

    { name: 'the board carries the three gates and what is queued', run: () => {
      const s = summarize(BUSINESSES.find((b) => b.id === 'redos'), { redos: {
        customers: { nonFriend: 3 }, revenue: { netUsd: 0 }, gateLine: 'x',
        gates: [{ label: 'Strangers want it', target: 10, unit: 'x', value: 3, met: false, why: '' }],
        posts: { status: { published: 0, total: 15 }, next: [{ n: 4, title: 'CapEx', platforms: ['bluesky'] }], held: [] } } });
      const st = s.board.cards.map((c) => c.stage);
      return ok(st.includes('Not yet') && st.includes('Queued'), JSON.stringify(st)) } },
    { name: 'gov summarizes from the live board + surfaces your next move', run: () => {
      const s = summarize(BUSINESSES.find((b) => b.id === 'gov'), { gov: { total: 74, counts: { reviewing: 2, responding: 2 }, yourNextAction: { text: 'Review, sign & submit the proposal', title: 'Range Maintenance' } } });
      return ok(s.next.who === 'you' && /Range Maintenance/.test(s.next.text) && /74 tracked/.test(s.status), JSON.stringify({ status: s.status, next: s.next }));
    } },
    { name: 'real estate flags HAP pending as YOUR move + builds a board', run: () => {
      const s = summarize(BUSINESSES.find((b) => b.id === 'realestate'), { realestate: { units: [{ id: 'u1', address: '463 2nd', hap_status: 'pending', rent: 1200 }, { id: 'u2', address: '12 Oak', tenant: 'Smith', rent: 1000 }], rentals: [{}, {}], flips: [] } });
      const hapCol = s.board.stages.indexOf('HAP pending') >= 0;
      return ok(s.next.who === 'you' && /463 2nd/.test(s.next.text) && hapCol && s.board.cards.length === 2, JSON.stringify({ next: s.next, cards: s.board.cards.map((c) => c.stage) }));
    } },
    { name: 'web studio: empty shows a start prompt, with a project shows the board', run: () => {
      const empty = summarize(BUSINESSES.find((b) => b.id === 'web'), { web: { projects: [] } });
      const one = summarize(BUSINESSES.find((b) => b.id === 'web'), { web: { projects: [{ client: 'Acme', status: 'review', type: 'landing', price: 800 }] } });
      return ok(empty.next.who === 'you' && /No active sites/.test(empty.status)
        && one.next.who === 'you' && /Acme/.test(one.next.text) && one.board.cards[0].stage === 'Review',
        JSON.stringify({ emptyNext: empty.next.text, oneStage: one.board.cards[0].stage }));
    } },
    { name: 'finance reflects Stripe money, or says "connect" when absent', run: () => {
      const off = summarize(BUSINESSES.find((b) => b.id === 'finance'), {});
      const on = summarize(BUSINESSES.find((b) => b.id === 'finance'), { finance: { weekCollected: 500, available: 1200 } });
      return ok(off.next.who === 'you' && /Connect Stripe/.test(off.next.text) && on.next.who === 'jarvis' && /\$500/.test(on.status), JSON.stringify({ off: off.status, on: on.status }));
    } },
    { name: 'unwired businesses (ZeroTick/Lifeline) show the add-files setup path', run: () => {
      const z = summarize(BUSINESSES.find((b) => b.id === 'zerotick'), {});
      return ok(z.setup === true && z.next.who === 'you' && /give jarvis the files/i.test(z.next.text), JSON.stringify(z.next));
    } },
    { name: 'buildHub returns one row per business + counts your moves', run: () => {
      const hub = buildHub({ gov: { total: 3, counts: { reviewing: 1, responding: 1 }, yourNextAction: { text: 'Sign', title: 'X' } } });
      return ok(hub.length === 9 && hub.every((b) => b.name && b.next) && needsYouCount(hub) >= 1, 'needsYou=' + needsYouCount(hub));
    } },
  ],
};
