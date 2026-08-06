// Regression suite for the REDOS Partner Fit Index and the Bookkeeper.
//
// The fit index is pinned against the 2026-08-05 hand ranking. If a weight moves without a
// threshold moving, the top-three case goes red. That is the point: the ranking was produced by a
// live-page verification of ten targets, and it is the only ground truth this index has.

import { partnerFit, rankTargets, band } from '../pods/redos/partner-fit.mjs';
import { books, canBuildFeature, MILESTONES } from '../pods/redos/bookkeeper.mjs';
import { roster, staleness, needsReverification } from '../pods/redos/scout.mjs';
import { loadTargets } from '../pods/redos/scout.mjs';

const ok = (pass, detail = '') => ({ pass, detail });
const NOW = Date.parse('2026-08-05T12:00:00Z');

export default {
  agent: 'redos-fit',
  cases: [
    // ── the pinned ranking ─────────────────────────────────────────────
    { name: 'PINNED: the seeded roster ranks Dan Lane, Coach Carson and Collecting Keys as SEND', run: () => {
      const r = roster({ now: NOW });
      const top = r.sendable.filter((t) => t.fit.band === 'SEND').map((t) => t.id).sort();
      const want = ['coach-carson', 'collecting-keys', 'dan-lane'];
      return ok(JSON.stringify(top) === JSON.stringify(want), `got ${JSON.stringify(top)}`);
    } },

    { name: 'PINNED: Dan Lane outranks everyone — he already takes commission on a direct competitor', run: () => {
      const r = roster({ now: NOW });
      return ok(r.sendable[0] && r.sendable[0].id === 'dan-lane', r.sendable[0] && r.sendable[0].id);
    } },

    { name: 'the dark targets are disqualified, not merely ranked low', run: () => {
      const all = loadTargets();
      const bakke = partnerFit(all.find((t) => t.id === 'ryan-bakke'));
      const dion = partnerFit(all.find((t) => t.id === 'dion-mcneeley'));
      return ok(bakke.disqualified && dion.disqualified && bakke.score === 0 && dion.score === 0);
    } },

    { name: 'someone building a competing analyser is disqualified regardless of audience', run: () => {
      const f = partnerFit({ name: 'A', contactRoute: 'email', lastContentAt: '2026-08-04', audience: 42000, buildsCompetitor: true });
      return ok(f.disqualified && /competing/i.test(f.reasons.map((r) => r.reason).join(' ')), JSON.stringify(f.reasons));
    } },

    { name: 'no contact route is a disqualifier — you cannot pitch someone you cannot reach', run: () => {
      const f = partnerFit({ name: 'A', lastContentAt: '2026-08-04', affiliateBehaviour: 'promotes-competitor' });
      return ok(f.disqualified, JSON.stringify(f.reasons));
    } },

    // ── the weighting decision, made explicit ──────────────────────────
    { name: 'WEIGHTING: already-takes-commission beats a large audience with no affiliate history', run: () => {
      const t = (o) => ({ name: 'x', contactRoute: 'email', lastContentAt: '2026-08-04', conflict: 'none', ask: 'affiliate', ...o });
      const commissioned = partnerFit(t({ affiliateBehaviour: 'promotes-competitor', audience: null }));
      const bigNoHistory = partnerFit(t({ affiliateBehaviour: 'none', audience: 500000 }));
      return ok(commissioned.score > bigNoHistory.score, `${commissioned.score} vs ${bigNoHistory.score}`);
    } },

    { name: 'WEIGHTING: an unverifiable audience is neutral, never a penalty', run: () => {
      const t = (a) => partnerFit({ name: 'x', contactRoute: 'email', lastContentAt: '2026-08-04', affiliateBehaviour: 'promotes-competitor', conflict: 'none', ask: 'affiliate', audience: a });
      return ok(t(null).score >= t(1000).score, `${t(null).score} vs ${t(1000).score}`);
    } },

    { name: 'WEIGHTING: Mint\'s mid-level band (under 40k) outscores a 500k account', run: () => {
      const t = (a) => partnerFit({ name: 'x', contactRoute: 'email', lastContentAt: '2026-08-04', affiliateBehaviour: 'none', conflict: 'none', ask: 'affiliate', audience: a });
      return ok(t(20000).score > t(500000).score, `${t(20000).score} vs ${t(500000).score}`);
    } },

    { name: 'WEIGHTING: a direct competing product tanks the score', run: () => {
      const t = (c) => partnerFit({ name: 'x', contactRoute: 'email', lastContentAt: '2026-08-04', affiliateBehaviour: 'promotes-competitor', conflict: c, ask: 'affiliate' });
      return ok(t('direct').score < t('none').score - 10, `${t('direct').score} vs ${t('none').score}`);
    } },

    { name: 'bands are monotonic and 0 is always HOLD', run: () => {
      return ok(band(0).band === 'HOLD' && band(100).band === 'SEND' && band(69).band === 'QUEUE' && band(34).band === 'HOLD');
    } },

    { name: 'rankTargets is stable — equal scores break on name, not insertion order', run: () => {
      const a = { id: 'a', name: 'Zed', contactRoute: 'email', lastContentAt: '2026-08-04', affiliateBehaviour: 'none', conflict: 'none' };
      const b = { id: 'b', name: 'Abe', contactRoute: 'email', lastContentAt: '2026-08-04', affiliateBehaviour: 'none', conflict: 'none' };
      const one = rankTargets([a, b]).map((t) => t.id).join();
      const two = rankTargets([b, a]).map((t) => t.id).join();
      return ok(one === two && one === 'b,a', `${one} / ${two}`);
    } },

    // ── the roster's own gates ─────────────────────────────────────────
    { name: 'ROSTER: held targets never appear in sendable', run: () => {
      const r = roster({ now: NOW });
      const heldInSendable = r.sendable.filter((t) => t.held === true);
      return ok(heldInSendable.length === 0, heldInSendable.map((t) => t.id).join());
    } },

    { name: 'ROSTER: David Dodge is held — the killed draft must not silently come back', run: () => {
      const r = roster({ now: NOW });
      return ok(r.held.some((t) => t.id === 'david-dodge'), r.held.map((t) => t.id).join());
    } },

    { name: 'STALENESS: the whole roster goes stale 15 days after verification', run: () => {
      const later = Date.parse('2026-08-20T12:00:00Z');
      const stale = needsReverification(loadTargets(), { staleDays: 14, now: later });
      return ok(stale.length === loadTargets().length, `${stale.length} of ${loadTargets().length}`);
    } },

    { name: 'STALENESS: a record with no verifiedAt counts as stale', run: () => {
      return ok(staleness({ name: 'x' }) === null && needsReverification([{ name: 'x' }]).length === 1);
    } },

    // ── the bookkeeper ─────────────────────────────────────────────────
    { name: 'BOOKS: zero sales says so plainly rather than hiding it', run: () => {
      const b = books([]);
      return ok(b.sales === 0 && b.net === 0 && /0 sales/.test(b.line), b.line);
    } },

    { name: 'BOOKS: refunded sales are excluded from every total', run: () => {
      const b = books([{ price: 149 }, { price: 249, refunded: true }], { feeRate: 0 });
      return ok(b.sales === 1 && b.gross === 149 && b.refunded === 1, JSON.stringify(b));
    } },

    { name: 'BOOKS: commission owed is half of an affiliate\'s gross', run: () => {
      const b = books([{ price: 149, affiliateCode: 'LEX' }, { price: 249, affiliateCode: 'LEX' }], { feeRate: 0 });
      return ok(b.byAffiliate.LEX.commissionOwed === 199, JSON.stringify(b.byAffiliate));
    } },

    { name: 'BOOKS: distance to the next milestone is counted in sales, not dollars alone', run: () => {
      const b = books(Array.from({ length: 3 }, () => ({ price: 149 })), { feeRate: 0.1 });
      return ok(b.nextMilestone.label === '$1k' && b.nextMilestone.salesRemaining > 0, JSON.stringify(b.nextMilestone));
    } },

    { name: 'BOOKS: the milestone ladder matches the revenue plan', run: () => {
      return ok(MILESTONES.map((m) => m.net).join() === '1000,10000,100000');
    } },

    // ── the two revenue-triggered gates ────────────────────────────────
    { name: 'FREEZE: a frozen PRD is refused below $10k, with a reason', run: () => {
      const b = books([{ price: 149 }]);
      const r = canBuildFeature('REDOS Buy Box programmable rules engine', b);
      return ok(r.allow === false && /frozen/i.test(r.reason), r.reason);
    } },

    { name: 'FREEZE: the freeze lifts at $10k net', run: () => {
      const b = books(Array.from({ length: 100 }, () => ({ price: 149 })), { feeRate: 0.1 });
      const r = canBuildFeature('Buy Box', b);
      return ok(b.prdFreeze === false && r.allow === true, `net ${b.net}`);
    } },

    { name: 'FREEZE: a feature that is not on the frozen list is allowed', run: () => {
      const r = canBuildFeature('fix the DSCR calculator rounding', books([]));
      return ok(r.allow === true, r.reason);
    } },

    { name: 'DECISION: the $10k card does not raise early', run: () => {
      return ok(books([{ price: 149 }]).decisionDue === false);
    } },

    { name: 'DECISION: the $10k card raises at $10k net', run: () => {
      const b = books(Array.from({ length: 100 }, () => ({ price: 149 })), { feeRate: 0.1 });
      return ok(b.decisionDue === true, `net ${b.net}`);
    } },
  ],
};
