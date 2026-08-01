// Regression suite for voice navigation (pods/surfaces.mjs). "Show me the gov board" has to land on a REAL
// route — a model resolving routes in its head invents /pipeline and walks him into a 404. The bar: match
// what he actually says, prefer the more specific screen, and return NULL rather than guess.

import { resolveSurface, primarySurfaces, surfaceMenu, SURFACES } from '../pods/surfaces.mjs';

const ok = (pass, detail = '') => ({ pass, detail });
const id = (t) => { const s = resolveSurface(t); return s && s.id; };

export default {
  agent: 'surfaces',
  cases: [
    { name: 'the framing verbs are stripped ("pull up the gov board please")', run: () =>
      ok(id('pull up the gov board please') === 'govcon', String(id('pull up the gov board please'))) },

    { name: 'every way he says the same thing lands on ONE screen', run: () => {
      const ways = ['show me the pipeline', 'open govcon', 'take me to the board', 'bring up my bids', 'government contracts'];
      const got = ways.map(id);
      return ok(got.every((g) => g === 'govcon'), JSON.stringify(got));
    } },

    { name: 'the money words all reach Finances', run: () => {
      const got = ['show me the money', 'open my p&l', 'what about tax', 'my debts'].map(id);
      return ok(got.every((g) => g === 'finances'), JSON.stringify(got));
    } },

    { name: 'SPECIFIC beats general — "gov pipeline" does not fall back to something shorter', run: () =>
      ok(id('gov pipeline') === 'govcon' && id('control center') === 'control', JSON.stringify([id('gov pipeline'), id('control center')])) },

    { name: 'a short exact alias still wins ("ops" is Ops, not a longer match)', run: () =>
      ok(id('ops') === 'ops' && id('today') === 'today' && id('eyes') === 'eyes', JSON.stringify([id('ops'), id('today'), id('eyes')])) },

    { name: 'NEVER GUESSES: an unknown request returns null so she can say she has no such screen', run: () =>
      ok(resolveSurface('show me the quarterly unicorn dashboard') === null
        && resolveSurface('open the thing') === null, JSON.stringify([id('show me the quarterly unicorn dashboard'), id('open the thing')])) },

    { name: 'a one/two letter fragment does not match anything', run: () =>
      ok(resolveSurface('o') === null && resolveSurface('go') === null) },

    { name: 'every surface has a real route and at least two aliases', run: () => {
      const bad = SURFACES.filter((s) => !s.route || !s.name || (s.aliases || []).length < 2);
      return ok(bad.length === 0, JSON.stringify(bad.map((b) => b.id)));
    } },

    { name: 'routes are unique (two names must never fight over one screen)', run: () => {
      const routes = SURFACES.map((s) => s.route);
      return ok(new Set(routes).size === routes.length, JSON.stringify(routes));
    } },

    { name: 'FEWER TABS: only four surfaces earn a permanent drawer slot', run: () => {
      const p = primarySurfaces().map((s) => s.id);
      return ok(p.length === 4 && p.includes('home') && p.includes('talk'), JSON.stringify(p));
    } },

    { name: 'demoted surfaces stay REACHABLE — fewer tabs, not fewer capabilities', run: () => {
      const demoted = SURFACES.filter((s) => !s.primary);
      return ok(demoted.length > 0 && demoted.every((s) => resolveSurface(s.aliases[0]) !== null), JSON.stringify(demoted.filter((s) => !resolveSurface(s.aliases[0])).map((s) => s.id)));
    } },

    { name: 'the menu she offers lists only REAL screens', run: () =>
      ok(surfaceMenu().length === SURFACES.length && surfaceMenu().every((m) => typeof m === 'string' && m.length > 4)) },

    { name: 'empty / garbage input does not throw', run: () =>
      ok(resolveSurface() === null && resolveSurface(null) === null && resolveSurface('   ') === null) },
  ],
};
