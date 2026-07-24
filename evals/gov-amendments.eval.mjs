// Regression suite for the Amendment & deadline-change radar (pods/gov/amendments.mjs). Pins the deterministic
// detection the operator relies on so a missed solicitation change never sinks a bid: attachment-set signature
// (order-free, size-sensitive), amendment-level extraction, and the change detector's rules — only PURSUED
// bids alert, a real change is caught, no-change is silent, and an already-flagged change never re-alerts.

import { attSignature, amendmentLevel, pursuedSet, detectAmendments } from '../pods/gov/amendments.mjs';

const ok = (pass, detail = '') => ({ pass, detail });

// event builders
const score = (noticeId, recommendation, extra = {}) => ({ action: 'bid.score', payload: { noticeId, recommendation, ...extra } });
const snap = (noticeId, s) => ({ action: 'gov.snapshot', payload: { noticeId, ...s } });
const flag = (noticeId, s) => ({ action: 'gov.amendment.flagged', payload: { noticeId, ...s } });

export default {
  agent: 'gov-amendments',
  cases: [
    { name: 'attSignature is order-independent + size-sensitive; empty → ""', run: () => {
      const a = attSignature([{ hash: 'x', bytes: 10 }, { hash: 'y', bytes: 20 }]);
      const b = attSignature([{ hash: 'y', bytes: 20 }, { hash: 'x', bytes: 10 }]); // reordered → same
      const c = attSignature([{ hash: 'x', bytes: 10 }, { hash: 'y', bytes: 21 }]); // one byte diff → different
      return ok(a === b && a !== c && attSignature([]) === '', JSON.stringify({ a, b, c }));
    } },

    { name: 'amendmentLevel returns the highest Amendment N (0 if none)', run: () =>
      ok(amendmentLevel('Amendment 0002: quantity change') === 2
        && amendmentLevel('see Amendment 0001 and Amendment 0003 attached') === 3
        && amendmentLevel('a plain solicitation with no changes') === 0) },

    { name: 'pursuedSet: a bid-scored + a drafted notice are pursued; a watch/no-bid is not', run: () => {
      const s = pursuedSet([score('A', 'bid'), score('B', 'watch'), score('C', 'no-bid'), { action: 'proposal.draft', payload: { noticeId: 'C' } }]);
      return ok(s.has('A') && s.has('C') && !s.has('B') && s.size === 2, JSON.stringify([...s]));
    } },

    { name: 'pursuedSet honors the LATEST bid.score (bid→no-bid flip drops out)', run: () => {
      const s = pursuedSet([score('A', 'bid'), score('A', 'no-bid')]);
      return ok(!s.has('A'), JSON.stringify([...s]));
    } },

    { name: 'detectAmendments: a moved deadline on a PURSUED bid → one "deadline" change', run: () => {
      const ev = [score('A', 'bid'), snap('A', { deadline: '2026-07-20', attSig: 's1', amendmentN: 1 }), snap('A', { deadline: '2026-07-24', attSig: 's1', amendmentN: 1 })];
      const r = detectAmendments(ev);
      return ok(r.length === 1 && r[0].noticeId === 'A' && r[0].changes.join() === 'deadline', JSON.stringify(r.map((x) => x.changes)));
    } },

    { name: 'detectAmendments catches a changed attachment set + a bumped amendment', run: () => {
      const ev = [score('A', 'bid'),
        snap('A', { deadline: '2026-07-24', attSig: 's1', amendmentN: 1 }),
        snap('A', { deadline: '2026-07-24', attSig: 's2', amendmentN: 2 })];
      const r = detectAmendments(ev);
      return ok(r.length === 1 && r[0].changes.includes('attachments') && r[0].changes.includes('amendment'), JSON.stringify(r[0] && r[0].changes));
    } },

    { name: 'detectAmendments: no change across identical snapshots → nothing', run: () => {
      const ev = [score('A', 'bid'), snap('A', { deadline: '2026-07-24', attSig: 's1', amendmentN: 1 }), snap('A', { deadline: '2026-07-24', attSig: 's1', amendmentN: 1 })];
      return ok(detectAmendments(ev).length === 0);
    } },

    { name: 'detectAmendments: a change on a NON-pursued notice is skipped', run: () => {
      const ev = [score('A', 'watch'), snap('A', { deadline: '2026-07-20', attSig: 's1', amendmentN: 1 }), snap('A', { deadline: '2026-07-24', attSig: 's1', amendmentN: 1 })];
      return ok(detectAmendments(ev).length === 0);
    } },

    { name: 'detectAmendments is idempotent: an already-flagged change never re-alerts', run: () => {
      const ev = [score('A', 'bid'),
        snap('A', { deadline: '2026-07-20', attSig: 's1', amendmentN: 1 }),
        snap('A', { deadline: '2026-07-24', attSig: 's1', amendmentN: 1 }),
        flag('A', { deadline: '2026-07-24', attSig: 's1', amendmentN: 1 })];
      return ok(detectAmendments(ev).length === 0, 'flagged change re-surfaced');
    } },

    { name: 'detectAmendments needs ≥2 snapshots (a first-ever snapshot is never a change)', run: () => {
      const ev = [score('A', 'bid'), snap('A', { deadline: '2026-07-24', attSig: 's1', amendmentN: 1 })];
      return ok(detectAmendments(ev).length === 0);
    } },
  ],
};
