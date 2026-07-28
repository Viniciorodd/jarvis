// Regression suite for per-opportunity sub sourcing (pods/gov/sub-sourcing.mjs). Pins the DETERMINISTIC
// ranking the operator's quote requests depend on: a firm we can actually email outranks one we can't, a
// SAM-EXCLUDED firm is dropped entirely (never merely down-ranked), and trade/location/rating/past-performance
// all pull in the right direction. Pure over fixtures — no network.

import { targetFor, scoreSub, rankSubs, toOutreachCandidates } from '../pods/gov/sub-sourcing.mjs';

const ok = (pass, detail = '') => ({ pass, detail });
const T = { trade: 'Janitorial', place: 'Erie, PA' };

export default {
  agent: 'gov-sub-sourcing',
  cases: [
    { name: 'targetFor reads the trade + place off the opportunity', run: () => {
      const t = targetFor({ title: 'Base Custodial and Janitorial Services', placeState: 'PA' });
      return ok(t.trade === 'Janitorial' && t.place === 'PA', JSON.stringify(t));
    } },

    { name: 'targetFor falls back to the core lane when the title says nothing', run: () =>
      ok(targetFor({ title: 'Miscellaneous requirement' }).trade === 'Janitorial') },

    { name: 'REACHABILITY DOMINATES — a sub with an email outranks a better-rated one without', run: () => {
      const withEmail = scoreSub({ contact_email: 'a@b.com', rating: 3.0, trade: 'Janitorial', location: 'Erie, PA' }, T);
      const noEmail = scoreSub({ website: 'x.com', rating: 5.0, trade: 'Janitorial', location: 'Erie, PA' }, T);
      return ok(withEmail.score > noEmail.score, JSON.stringify({ withEmail: withEmail.score, noEmail: noEmail.score }));
    } },

    { name: 'a SAM-EXCLUDED firm is DROPPED, never just down-ranked', run: () => {
      const ranked = rankSubs([
        { name: 'Excluded Co', contact_email: 'x@y.com', rating: 5, trade: 'Janitorial', location: 'Erie, PA', exclusionStatus: 'excluded' },
        { name: 'Clean Co', contact_email: 'a@b.com', trade: 'Janitorial', location: 'Erie, PA' },
      ], T, { min: 5 });
      return ok(ranked.length === 1 && ranked[0].sub.name === 'Clean Co', JSON.stringify(ranked.map((r) => r.sub.name)));
    } },

    { name: 'rating, trade match, place-of-performance and past performance all raise the score', run: () => {
      const base = scoreSub({ contact_email: 'a@b.com' }, T).score;
      const rated = scoreSub({ contact_email: 'a@b.com', rating: 4.8 }, T).score;
      const local = scoreSub({ contact_email: 'a@b.com', location: 'Erie, PA' }, T).score;
      const specialist = scoreSub({ contact_email: 'a@b.com', trade: 'Janitorial' }, T).score;
      const repeat = scoreSub({ contact_email: 'a@b.com', past_performance: 2 }, T).score;
      return ok(rated > base && local > base && specialist > base && repeat > base, JSON.stringify({ base, rated, local, specialist, repeat }));
    } },

    { name: 'a VERIFIED sub ranks above an equivalent unverified one (it can actually auto-send)', run: () => {
      const v = scoreSub({ contact_email: 'a@b.com', verified: true }, T).score;
      const u = scoreSub({ contact_email: 'a@b.com' }, T).score;
      return ok(v > u, JSON.stringify({ v, u }));
    } },

    { name: 'rankSubs returns at most the requested count, best first', run: () => {
      const subs = Array.from({ length: 12 }, (_, i) => ({ name: 'S' + i, contact_email: 'a' + i + '@b.com', rating: i / 2 }));
      const r = rankSubs(subs, T, { min: 5 });
      return ok(r.length === 5 && r[0].score >= r[4].score, JSON.stringify(r.map((x) => x.sub.name)));
    } },

    { name: 'toOutreachCandidates only includes firms we can actually email', run: () => {
      const c = toOutreachCandidates({ target: T, subs: [{ id: '1', name: 'A', email: 'a@b.com', trade: 'Janitorial' }, { id: '2', name: 'B', email: '', trade: 'Janitorial' }] }, []);
      return ok(c.length === 1 && c[0].templateKey === 'sub-quote' && c[0].contact.contact_email === 'a@b.com', JSON.stringify(c));
    } },

    { name: 'a freshly-sourced lead is NOT verified — so the policy gate will queue it, not send it (L-009)', run: () => {
      const c = toOutreachCandidates({ target: T, subs: [{ id: 'new', name: 'Fresh Lead', email: 'new@lead.com' }] }, []);
      return ok(c[0].contact.verified === false, JSON.stringify(c[0].contact));
    } },

    { name: 'never throws on empty/garbage input', run: () =>
      ok(rankSubs([], T).length === 0 && rankSubs(null, T).length === 0 && toOutreachCandidates({}).length === 0 && typeof scoreSub().score === 'number') },
  ],
};
