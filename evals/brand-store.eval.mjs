// Regression suite for the Brand ledger (pods/brand/store.mjs).
//
// The load-bearing case is the second one: a post that was never approved cannot be RECORDED as
// published. `policy.mjs` already refuses to publish it — this is the independent second layer, so
// that a bug upstream cannot produce a post that both reached a platform and looks legitimate in the
// history afterwards.

import { applyEvent, fold, isValidTransition, normaliseOutcome, byStatus, ledgerClearsPublish, STATUSES }
  from '../pods/brand/store.mjs';

const ok = (pass, detail = '') => ({ pass, detail });

const ev = (type, over = {}) => ({ id: 'p1', type, ts: '2026-08-06T10:00:00Z', ...over });

// A full, legal life: drafted → queued → approved → scheduled → published.
const HAPPY = [
  ev('draft', { body: 'Three ways my analyzer was wrong.', platform: 'bluesky', pillar: 'build' }),
  ev('queue'),
  ev('approve', { by: 'vinicio' }),
  ev('schedule', { scheduledFor: '2026-08-07T14:00:00Z' }),
  ev('publish', { platformPostId: 'abc123', url: 'https://bsky.app/p/abc123' }),
];

export default {
  agent: 'brand-store',
  cases: [
    { name: 'a full life folds to published, with the whole history kept', run: () => {
      const { records, rejected } = fold(HAPPY);
      const r = records[0];
      return ok(rejected.length === 0 && r.status === 'published' && r.approvedBy === 'vinicio'
        && r.url === 'https://bsky.app/p/abc123' && r.history.length === 5,
        JSON.stringify({ status: r.status, hist: r.history.map((h) => h.type) }));
    } },

    // ── 🚨 RULE 1, ENFORCED IN THE DATA AS WELL AS AT THE GATE ────────────────────────────────────
    { name: '🚨 a post that was never approved cannot be recorded as published', run: () => {
      const skipped = [ev('draft'), ev('queue'), ev('publish')];
      const { records, rejected } = fold(skipped);
      return ok(records[0].status === 'queued' && rejected.length === 1
        && /cannot publish a post that is queued/.test(rejected[0].error), JSON.stringify(rejected));
    } },

    { name: '🚨 publishing straight from approved is refused — it must be scheduled', run: () =>
      ok(!isValidTransition('publish', 'approved') && isValidTransition('publish', 'scheduled')) },

    { name: '🚨 the ledger gate reads the HISTORY, not just a field', run: () => {
      // A record with approvedBy set but no approval event in its history is a forgery, and the
      // second check is what makes writing the field by hand insufficient.
      const forged = { id: 'x', status: 'scheduled', approvedBy: 'vinicio', history: [{ type: 'draft' }] };
      return ok(!ledgerClearsPublish(forged).allow && /no approval event/.test(ledgerClearsPublish(forged).reason),
        ledgerClearsPublish(forged).reason);
    } },

    { name: 'the ledger gate clears a genuinely approved, scheduled post', run: () => {
      const { records } = fold(HAPPY.slice(0, 4));
      return ok(ledgerClearsPublish(records[0]).allow, ledgerClearsPublish(records[0]).reason);
    } },

    // ── kill is terminal ──────────────────────────────────────────────────────────────────────────
    { name: '⚠ a killed draft can never come back', run: () => {
      // He said no. A system that lets a killed draft creep back into the queue is one he stops
      // trusting the kill button on.
      const { records, rejected } = fold([ev('draft'), ev('queue'), ev('kill', { reason: 'off-voice' }),
        ev('approve', { by: 'vinicio' }), ev('schedule'), ev('publish')]);
      return ok(records[0].status === 'killed' && rejected.length === 3, JSON.stringify(rejected.map((r) => r.error)));
    } },

    { name: 'kill works from any live state', run: () =>
      ok(['drafted', 'queued', 'approved', 'scheduled', 'failed'].every((s) => isValidTransition('kill', s))) },

    // ── retry ─────────────────────────────────────────────────────────────────────────────────────
    { name: 'a failed publish can be rescheduled and then succeed', run: () => {
      const { records, rejected } = fold([...HAPPY.slice(0, 4),
        ev('fail', { error: 'token expired' }), ev('schedule'), ev('publish', { platformPostId: 'z9' })]);
      return ok(rejected.length === 0 && records[0].status === 'published' && records[0].lastError === 'token expired',
        JSON.stringify({ s: records[0].status, e: records[0].lastError }));
    } },

    // ── outcomes ──────────────────────────────────────────────────────────────────────────────────
    { name: '🚨 an unfetched metric is null, never zero', run: () => {
      // Rule 7. Zero is a measurement; null is the absence of one. Collapsing them makes every failed
      // fetch look like a post that flopped, and the loop would learn from it.
      const o = normaliseOutcome({ reactions: 4 });
      return ok(o.reactions === 4 && o.impressions === null && o.comments === null && o.shares === null,
        JSON.stringify(o));
    } },

    { name: 'a real zero survives as zero', run: () =>
      ok(normaliseOutcome({ reactions: 0, impressions: 0 }).reactions === 0) },

    { name: 'audience composition stays null until someone classifies it', run: () => {
      const none = normaliseOutcome({ reactions: 10 });
      const some = normaliseOutcome({ audience: { buyer: 3, peer: 1 } });
      return ok(none.audience === null && some.audience.total === 4, JSON.stringify(some.audience));
    } },

    { name: 'an outcome attaches without changing the status', run: () => {
      const { records } = fold([...HAPPY, ev('outcome', { outcome: { reactions: 12 } })]);
      return ok(records[0].status === 'published' && records[0].outcome.reactions === 12);
    } },

    { name: 'an outcome on an unpublished post is refused', run: () => {
      const { rejected } = fold([ev('draft'), ev('outcome', { outcome: { reactions: 5 } })]);
      return ok(rejected.length === 1, JSON.stringify(rejected));
    } },

    // ── the fold itself ───────────────────────────────────────────────────────────────────────────
    { name: 'one malformed line cannot hide the other 900', run: () => {
      const { records, rejected } = fold([...HAPPY, { type: 'publish' }, null, { id: 'q', type: 'nonsense' }]);
      return ok(records.length === 1 && records[0].status === 'published' && rejected.length === 3,
        JSON.stringify(rejected.map((r) => r.error)));
    } },

    { name: 'two posts fold independently', run: () => {
      const { records } = fold([...HAPPY, { id: 'p2', type: 'draft', ts: 'x', body: 'second' }]);
      return ok(records.length === 2 && byStatus(records, 'drafted').length === 1
        && byStatus(records, 'published').length === 1);
    } },

    { name: 'the status vocabulary is closed', run: () =>
      ok(STATUSES.length === 7 && STATUSES.includes('killed') && !STATUSES.includes('deleted')) },

    { name: 'a draft cannot be drafted twice', run: () =>
      ok(!isValidTransition('draft', 'drafted') && isValidTransition('draft', null)) },

    { name: 'empty / garbage input does not throw', run: () => {
      const f = fold();
      return ok(f.records.length === 0 && f.rejected.length === 0
        && !applyEvent(null, null).ok && !ledgerClearsPublish().allow
        && normaliseOutcome().impressions === null);
    } },
  ],
};
