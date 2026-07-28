// Regression suite for the Phase 9 SEND PATH (pods/gov/auto-outreach.mjs). The safety core is pinned in
// gov-outreach-policy.eval.mjs; this pins the PATH that would use it: dry-run is the default (nothing leaves),
// denied candidates route to the approval queue instead of the wire, the cap/cooldown accounting is right, and
// the digest tells the truth when nothing was sent.

import { runAutoOutreach, sentToday, lastToRecipient, digestText } from '../pods/gov/auto-outreach.mjs';

const ok = (pass, detail = '') => ({ pass, detail });
const VERIFIED = { contact_name: 'Jane', contact_email: 'jane@subco.com', verified: true };
const UNVERIFIED = { contact_name: 'Bob', contact_email: 'bob@unknown.com' };
const CAND = (contact) => ({ contact, templateKey: 'sub-quote', slots: { trade: 'floor care', place: 'Erie, PA' } });

export default {
  agent: 'gov-auto-outreach',
  cases: [
    { name: 'DRY RUN IS THE DEFAULT — runAutoOutreach() sends nothing', run: async () => {
      const r = await runAutoOutreach({ candidates: [CAND(VERIFIED)] });
      return ok(r.dryRun === true && r.sent === 0, JSON.stringify({ dryRun: r.dryRun, sent: r.sent }));
    } },

    { name: 'with auto-send OFF (default env), a verified contact is QUEUED, never sent', run: async () => {
      const r = await runAutoOutreach({ candidates: [CAND(VERIFIED)] });
      const res = r.results[0];
      return ok(r.sent === 0 && r.queued === 1 && res.allowed === false && /OFF/.test(res.reason), JSON.stringify(res));
    } },

    { name: 'even with Tier 1 ON, an UNVERIFIED contact is queued — never sent (the L-009 allowlist holds)', run: async () => {
      const prev = process.env.AUTO_SEND_TIER;
      process.env.AUTO_SEND_TIER = '1'; // turn auto-send ON so we test the ALLOWLIST, not the off-switch
      const r = await runAutoOutreach({ candidates: [CAND(UNVERIFIED), CAND(VERIFIED)] });
      process.env.AUTO_SEND_TIER = prev;
      const bad = r.results.find((x) => x.to === 'bob@unknown.com');
      const good = r.results.find((x) => x.to === 'jane@subco.com');
      // unverified → blocked by the allowlist; verified → allowed but STILL not sent (dry run is the default)
      return ok(bad.sent === false && bad.allowed === false && /verified/i.test(bad.reason)
        && good.allowed === true && good.sent === false && good.dryRun === true, JSON.stringify({ bad: bad.reason, good: good.reason }));
    } },

    { name: 'a bad template (missing slot) is queued with the reason — never a half-filled send', run: async () => {
      const r = await runAutoOutreach({ candidates: [{ contact: VERIFIED, templateKey: 'sub-quote', slots: {} }] });
      const res = r.results[0];
      return ok(res.sent === false && /missing required slot/i.test(res.reason), JSON.stringify(res));
    } },

    { name: 'an unknown template is queued, not sent', run: async () => {
      const r = await runAutoOutreach({ candidates: [{ contact: VERIFIED, templateKey: 'free-compose', slots: {} }] });
      return ok(r.results[0].sent === false && /unknown outreach template/i.test(r.results[0].reason), JSON.stringify(r.results[0]));
    } },

    { name: 'no candidates → a clean empty run (never throws)', run: async () => {
      const r = await runAutoOutreach({});
      return ok(r.considered === 0 && r.sent === 0 && Array.isArray(r.results), JSON.stringify(r));
    } },

    { name: 'sentToday counts only REAL sends from today (dry runs/failures never count)', run: () => {
      const now = new Date('2026-07-27T12:00:00Z');
      const log = [
        { at: '2026-07-27T09:00:00Z', sent: true }, { at: '2026-07-27T10:00:00Z', sent: true },
        { at: '2026-07-27T11:00:00Z', sent: false }, { at: '2026-07-26T09:00:00Z', sent: true },
      ];
      return ok(sentToday(log, now) === 2, String(sentToday(log, now)));
    } },

    { name: 'lastToRecipient returns the most recent real send to that address, else null', run: () => {
      const log = [
        { at: '2026-07-20T09:00:00Z', sent: true, to: 'jane@subco.com' },
        { at: '2026-07-25T09:00:00Z', sent: true, to: 'jane@subco.com' },
        { at: '2026-07-26T09:00:00Z', sent: false, to: 'jane@subco.com' },
      ];
      return ok(lastToRecipient(log, 'JANE@subco.com') === '2026-07-25T09:00:00Z' && lastToRecipient(log, 'nobody@x.com') === null);
    } },

    { name: 'digest says plainly when NOTHING was sent (no silent empty digest)', run: () => {
      const t = digestText([], new Date('2026-07-27T12:00:00Z'));
      return ok(/nothing was sent/i.test(t), t);
    } },

    { name: 'digest lists each real send (who + template)', run: () => {
      const t = digestText([{ at: '2026-07-27T09:00:00Z', sent: true, to: 'jane@subco.com', template: 'sub-quote', subject: 'Quote request' }], new Date('2026-07-27T12:00:00Z'));
      return ok(/1 sent/.test(t) && /jane@subco.com/.test(t) && /sub-quote/.test(t), t);
    } },
  ],
};
