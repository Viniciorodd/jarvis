// Regression suite for the Businesses registry (pods/businesses.mjs). Pins the "whose move is next"
// + status derivation each business row shows, and that the registry stays the single add-a-business point.

import { BUSINESSES, summarize, buildHub, needsYouCount } from '../pods/businesses.mjs';

const ok = (pass, detail = '') => ({ pass, detail });

export default {
  agent: 'businesses',
  cases: [
    { name: 'registry lists all 8 businesses with unique ids + icons', run: () => {
      const ids = BUSINESSES.map((b) => b.id);
      return ok(BUSINESSES.length === 8 && new Set(ids).size === 8 && BUSINESSES.every((b) => b.name && b.icon && b.source),
        ids.join(','));
    } },
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
      return ok(hub.length === 8 && hub.every((b) => b.name && b.next) && needsYouCount(hub) >= 1, 'needsYou=' + needsYouCount(hub));
    } },
  ],
};
