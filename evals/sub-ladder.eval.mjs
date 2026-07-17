// Regression suite for the SUB PRIMARY/BACKUP TIER LADDER (pods/gov/sub-ladder.mjs). The connector rates a
// shortlist of 3 subs and only ever contacts the TOP one — if he goes quiet the bid stalls silently and a
// federal deadline passes. This pins the escalation clock: tier/role assignment, when a backup activates,
// and — the doctrine line — that a RESPONDED ladder NEVER activates a backup (we have our sub; chasing the
// bench behind a "yes" burns the relationship and the operator's credibility).
//
// Every IO case runs in its own temp dir; the real gov-drafts/sub-ladder.jsonl is never touched. No network:
// nothing here calls SAM, the model, or the connector — the escalation core is pure by design.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  assignTiers, nextTierToActivate, ladderStatus, isStale, subWaitDays, roleForTier,
  startLadder, recordContact, recordResponse, markTier, getLadder, readLadders, openLadders,
} from '../pods/gov/sub-ladder.mjs';

const ok = (pass, detail = '') => ({ pass, detail });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sub-ladder-eval-'));
const NOW = '2026-07-17T12:00:00.000Z';
const daysAgo = (d) => new Date(Date.parse(NOW) - d * 864e5).toISOString();

const SHORTLIST = [
  { id: 'SUB-1', name: 'Alpha Facility Services', contact_email: 'a@alpha.test', score: 88 },
  { id: 'SUB-2', name: 'Bravo Janitorial', contact_email: 'b@bravo.test', score: 71 },
  { id: 'SUB-3', name: 'Charlie Cleaning', contact_email: 'c@charlie.test', score: 60 },
];
// A ladder fixture with each tier's status/clock set by the caller.
const ladder = (tiers, extra = {}) => ({
  key: 'N-1|janitorial', noticeId: 'N-1', trade: 'janitorial',
  tiers: assignTiers(SHORTLIST).map((t, i) => ({ ...t, ...(tiers[i] || {}) })),
  activeTier: null, closed: false, closedReason: null, ...extra,
});

export default {
  agent: 'gov-sub-ladder',
  cases: [
    { name: 'assignTiers: order preserved, roles primary → backup → backup-2, all pending', run: () => {
      const t = assignTiers(SHORTLIST);
      return ok(t.length === 3
        && t[0].tier === 1 && t[0].role === 'primary' && t[0].subId === 'SUB-1' && t[0].email === 'a@alpha.test'
        && t[1].tier === 2 && t[1].role === 'backup' && t[1].subId === 'SUB-2'
        && t[2].tier === 3 && t[2].role === 'backup-2' && t[2].subId === 'SUB-3'
        && t.every((x) => x.status === 'pending' && x.contactedAt === null && x.respondedAt === null)
        && roleForTier(4) === 'backup-2',
        JSON.stringify(t.map((x) => [x.tier, x.role, x.subId])));
    } },
    { name: 'assignTiers: empty/garbage shortlist → [] (never throws)', run: () => {
      return ok(assignTiers([]).length === 0 && assignTiers(null).length === 0 && assignTiers(undefined).length === 0,
        JSON.stringify({ empty: assignTiers([]).length, nul: assignTiers(null).length }));
    } },
    { name: 'nextTierToActivate: nothing contacted yet → tier 1 (the primary)', run: () => {
      const n = nextTierToActivate(ladder([]), NOW, { waitDays: 3 });
      return ok(!!n && n.tier === 1 && n.role === 'primary' && n.subId === 'SUB-1', JSON.stringify(n));
    } },
    { name: 'nextTierToActivate: primary contacted, still inside the wait window → null (patience)', run: () => {
      const l = ladder([{ status: 'contacted', contactedAt: daysAgo(2) }]);
      const n = nextTierToActivate(l, NOW, { waitDays: 3 });
      return ok(n === null && isStale(l.tiers[0], NOW, 3) === false, JSON.stringify({ n, stale: isStale(l.tiers[0], NOW, 3) }));
    } },
    { name: 'nextTierToActivate: primary stale past waitDays → tier 2 (the backup activates)', run: () => {
      const l = ladder([{ status: 'contacted', contactedAt: daysAgo(4) }]);
      const n = nextTierToActivate(l, NOW, { waitDays: 3 });
      return ok(!!n && n.tier === 2 && n.role === 'backup' && n.subId === 'SUB-2' && isStale(l.tiers[0], NOW, 3) === true,
        JSON.stringify(n));
    } },
    { name: 'DOCTRINE: ANY tier responded → null — a backup is NEVER chased behind a "yes"', run: () => {
      // The primary went quiet for 40 days (long past any wait window) but the BACKUP said yes. If the clock
      // still escalated here we would email tier 3 behind a sub who already committed. It must not.
      const l = ladder([
        { status: 'contacted', contactedAt: daysAgo(40) },
        { status: 'responded', contactedAt: daysAgo(30), respondedAt: daysAgo(29) },
      ]);
      const n = nextTierToActivate(l, NOW, { waitDays: 1 });
      const s = ladderStatus(l, NOW, { waitDays: 1 });
      return ok(n === null && s.responded === true && s.exhausted === false && /responded/i.test(s.nextAction) && !/activating/i.test(s.nextAction),
        JSON.stringify({ n, responded: s.responded, nextAction: s.nextAction }));
    } },
    { name: 'nextTierToActivate: steps OVER an excluded tier to the next pending one', run: () => {
      const l = ladder([
        { status: 'contacted', contactedAt: daysAgo(9) },
        { status: 'excluded' },   // FAR hard stop — permanently out of the running
      ]);
      const n = nextTierToActivate(l, NOW, { waitDays: 3 });
      return ok(!!n && n.tier === 3 && n.role === 'backup-2' && n.subId === 'SUB-3', JSON.stringify(n));
    } },
    { name: 'nextTierToActivate: stale tier with no next pending → null (bench exhausted)', run: () => {
      const l = ladder([
        { status: 'contacted', contactedAt: daysAgo(20) },
        { status: 'declined' },
        { status: 'excluded' },
      ]);
      const n = nextTierToActivate(l, NOW, { waitDays: 3 });
      const s = ladderStatus(l, NOW, { waitDays: 3 });
      return ok(n === null && s.exhausted === true, JSON.stringify({ n, exhausted: s.exhausted }));
    } },
    { name: 'nextTierToActivate: a closed ladder never activates anything', run: () => {
      const l = ladder([{ status: 'contacted', contactedAt: daysAgo(90) }], { closed: true, closedReason: 'no-bid' });
      return ok(nextTierToActivate(l, NOW, { waitDays: 3 }) === null, JSON.stringify(nextTierToActivate(l, NOW)));
    } },
    { name: 'GOV_SUB_WAIT_DAYS knob: default 3, clamped 0→1 and 99→14', run: () => {
      const prev = process.env.GOV_SUB_WAIT_DAYS;
      try {
        delete process.env.GOV_SUB_WAIT_DAYS;
        const def = subWaitDays();
        process.env.GOV_SUB_WAIT_DAYS = '0';
        const zero = subWaitDays();
        process.env.GOV_SUB_WAIT_DAYS = '99';
        const big = subWaitDays();
        process.env.GOV_SUB_WAIT_DAYS = 'banana';
        const junk = subWaitDays();
        return ok(def === 3 && zero === 1 && big === 14 && junk === 3 && subWaitDays(7) === 7,
          JSON.stringify({ def, zero, big, junk }));
      } finally { if (prev === undefined) delete process.env.GOV_SUB_WAIT_DAYS; else process.env.GOV_SUB_WAIT_DAYS = prev; }
    } },
    { name: 'ledger round-trip: startLadder → recordContact → recordResponse closes it (temp dir, fold-by-key)', run: () => {
      const dir = tmp();
      const op = { noticeId: 'N-42', title: 'Janitorial services' };
      const started = startLadder({ op, trade: 'janitorial', shortlist: SHORTLIST }, { dir });
      const again = startLadder({ op, trade: 'janitorial', shortlist: SHORTLIST }, { dir }); // idempotent
      recordContact('N-42', 'janitorial', 'SUB-1', { dir, nowIso: daysAgo(5) });
      const waiting = getLadder('N-42', 'janitorial', { dir });
      const dueBackup = nextTierToActivate(waiting, NOW, { waitDays: 3 });
      recordContact('N-42', 'janitorial', 'SUB-2', { dir, nowIso: daysAgo(1) });
      // replies.mjs matches inbound mail BY EMAIL — recordResponse must accept an email too
      recordResponse('N-42', 'janitorial', 'b@bravo.test', { dir, nowIso: NOW });
      const closed = getLadder('N-42', 'janitorial', { dir });
      const lines = fs.readFileSync(path.join(dir, 'sub-ladder.jsonl'), 'utf8').split('\n').filter((l) => l.trim());
      return ok(started.ok && started.existed === false && again.existed === true
        && !!dueBackup && dueBackup.subId === 'SUB-2'
        && waiting.activeTier === 1 && waiting.tiers[0].status === 'contacted'
        && closed.closed === true && closed.closedReason === 'sub responded'
        && closed.tiers[1].status === 'responded' && !!closed.tiers[1].respondedAt
        && nextTierToActivate(closed, NOW, { waitDays: 1 }) === null
        && readLadders({ dir }).length === 1 && lines.length === 4 && openLadders({ dir }).length === 0,
        JSON.stringify({ lines: lines.length, folded: readLadders({ dir }).length, closedReason: closed.closedReason, open: openLadders({ dir }).length }));
    } },
    { name: 'markTier: excluded/declined persist through the ledger and take a tier out of the running', run: () => {
      const dir = tmp();
      startLadder({ op: { noticeId: 'N-7' }, trade: 'grounds', shortlist: SHORTLIST }, { dir });
      recordContact('N-7', 'grounds', 'SUB-1', { dir, nowIso: daysAgo(10) });
      markTier('N-7', 'grounds', 'SUB-2', 'excluded', { dir });
      const bad = markTier('N-7', 'grounds', 'SUB-3', 'nonsense', { dir });
      const l = getLadder('N-7', 'grounds', { dir });
      const n = nextTierToActivate(l, NOW, { waitDays: 3 });
      return ok(l.tiers[1].status === 'excluded' && bad.ok === false && !!n && n.subId === 'SUB-3',
        JSON.stringify({ t2: l.tiers[1].status, next: n && n.subId, bad: bad.error }));
    } },
    { name: 'ladderStatus: plain-English nextAction — waiting vs escalating vs exhausted', run: () => {
      const waiting = ladderStatus(ladder([{ status: 'contacted', contactedAt: daysAgo(2) }]), NOW, { waitDays: 3 });
      const escalating = ladderStatus(ladder([{ status: 'contacted', contactedAt: daysAgo(5) }]), NOW, { waitDays: 3 });
      const dead = ladderStatus(ladder([
        { status: 'contacted', contactedAt: daysAgo(30) }, { status: 'declined' }, { status: 'declined' },
      ]), NOW, { waitDays: 3 });
      return ok(
        waiting.waitingOn === 'Alpha Facility Services' && waiting.daysWaiting === 2 && waiting.exhausted === false
          && /Waiting on Alpha Facility Services/.test(waiting.nextAction) && /2d of 3d/.test(waiting.nextAction)
          && escalating.daysWaiting === 5 && /activating Bravo Janitorial \(backup\)/.test(escalating.nextAction)
          && /review & send/i.test(escalating.nextAction)
          && dead.exhausted === true && /Bench exhausted for janitorial/.test(dead.nextAction) && /no-bid/.test(dead.nextAction)
          && dead.contacted === 1 && dead.responded === false,
        JSON.stringify({ waiting: waiting.nextAction, escalating: escalating.nextAction, dead: dead.nextAction }));
    } },
    { name: 'ladderStatus/nextTierToActivate never throw on junk (null, {}, no tiers)', run: () => {
      const a = nextTierToActivate(null, NOW), b = nextTierToActivate({}, NOW), c = nextTierToActivate({ tiers: [] }, NOW);
      const s = ladderStatus(null, NOW);
      return ok(a === null && b === null && c === null && s.responded === false && s.exhausted === false && !!s.nextAction,
        JSON.stringify({ a, b, c, s }));
    } },
  ],
};
