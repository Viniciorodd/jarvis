// Regression suite for the escalation ladder + blocked-detection (pods/gov/escalation.mjs). This is what keeps
// a deal moving without the operator watching it, so the rules have to be exact: email first, phone only as the
// fallback (and honestly handed to HIM, since the machine can't call), a reply ends the chase immediately, and
// anything the machine can't resolve is surfaced plainly instead of silently stalling.

import { nextMove, blockers, siteVisitFrom, ladder } from '../pods/gov/escalation.mjs';

const ok = (pass, detail = '') => ({ pass, detail });
const NOW = new Date('2026-07-28T12:00:00Z');
const daysAgo = (n) => new Date(NOW.getTime() - n * 86400000).toISOString();

export default {
  agent: 'gov-escalation',
  cases: [
    { name: 'inside the wait window → wait, nothing sent', run: () => {
      const r = nextMove({ sentAt: daysAgo(1) }, { now: NOW });
      return ok(r.action === 'wait' && r.who === 'jarvis', JSON.stringify(r));
    } },

    { name: 'day 3 with no reply → first email follow-up (auto)', run: () => {
      const r = nextMove({ sentAt: daysAgo(3), lastContactAt: daysAgo(3), followUps: 0 }, { now: NOW });
      return ok(r.action === 'follow-up' && r.n === 1 && r.who === 'jarvis', JSON.stringify(r));
    } },

    { name: 'day 7 after one follow-up → second (final) email nudge', run: () => {
      const r = nextMove({ sentAt: daysAgo(7), lastContactAt: daysAgo(4), followUps: 1 }, { now: NOW });
      return ok(r.action === 'follow-up' && r.n === 2, JSON.stringify(r));
    } },

    { name: 'A REPLY ENDS THE LADDER — never bump someone who already answered', run: () => {
      const r = nextMove({ sentAt: daysAgo(30), replied: true, followUps: 2 }, { now: NOW });
      return ok(r.action === 'none' && /replied/.test(r.reason), JSON.stringify(r));
    } },

    { name: 'day 10 → PHONE, handed to the OPERATOR (the machine cannot call, and says so)', run: () => {
      const r = nextMove({ sentAt: daysAgo(10), followUps: 2, phone: '570-555-1212' }, { now: NOW });
      return ok(r.action === 'phone' && r.who === 'you' && r.phone === '570-555-1212', JSON.stringify(r));
    } },

    { name: 'phone stage with NO number on file says so plainly (never pretends it can call)', run: () => {
      const r = nextMove({ sentAt: daysAgo(10), followUps: 2 }, { now: NOW });
      return ok(r.action === 'phone' && /NO phone number/i.test(r.reason), JSON.stringify(r));
    } },

    { name: 'day 14 → stalled: stop chasing, log it, move on', run: () => {
      const r = nextMove({ sentAt: daysAgo(15), followUps: 2 }, { now: NOW });
      return ok(r.action === 'stalled' && r.who === 'jarvis', JSON.stringify(r));
    } },

    { name: 'nothing sent yet → no move (never chases a thread that does not exist)', run: () =>
      ok(nextMove({}, { now: NOW }).action === 'none' && nextMove({ sentAt: 'garbage' }, { now: NOW }).action === 'none') },

    { name: 'the ladder stays in order even with nonsense env values', run: () => {
      const L = ladder({ ESCALATE_FOLLOWUP1_DAYS: '99', ESCALATE_FOLLOWUP2_DAYS: '1', ESCALATE_PHONE_DAYS: '0' });
      return ok(L.f1 < L.f2 && L.f2 < L.phone && L.phone < L.stall, JSON.stringify(L));
    } },

    // ── blockers: the "tell me we're blocked" list ──
    { name: 'BLOCKED: no subs found at all', run: () => {
      const b = blockers({ opp: {}, subs: [] }, { now: NOW });
      return ok(b.some((x) => x.severity === 'blocked' && /No subcontractors/i.test(x.what)), JSON.stringify(b));
    } },

    { name: 'BLOCKED: subs found but none reachable by email', run: () => {
      const b = blockers({ opp: {}, subs: [{ name: 'A' }, { name: 'B' }] }, { now: NOW });
      return ok(b.some((x) => x.severity === 'blocked' && /NONE has a usable email/i.test(x.what)), JSON.stringify(b));
    } },

    { name: 'URGENT: a mandatory site visit is not scheduled', run: () => {
      const b = blockers({ opp: {}, subs: [{ email: 'a@b.com' }, { email: 'c@d.com' }, { email: 'e@f.com' }], siteVisit: { required: true, date: '2026-08-10', scheduled: false } }, { now: NOW });
      return ok(b.some((x) => x.severity === 'urgent' && /site visit/i.test(x.what)), JSON.stringify(b));
    } },

    { name: 'BLOCKED: the mandatory site visit already passed unattended', run: () => {
      const b = blockers({ opp: {}, subs: [{ email: 'a@b.com' }], siteVisit: { required: true, date: '2026-07-01', scheduled: false } }, { now: NOW });
      return ok(b.some((x) => x.severity === 'blocked' && /already passed/i.test(x.what)), JSON.stringify(b));
    } },

    { name: 'URGENT: deadline in 2 days with zero quotes in hand', run: () => {
      const b = blockers({ opp: { deadline: '2026-07-30' }, subs: [{ email: 'a@b.com' }, { email: 'b@c.com' }, { email: 'd@e.com' }], quotes: 0 }, { now: NOW });
      return ok(b.some((x) => x.severity === 'urgent' && /NO sub has quoted/i.test(x.what)), JSON.stringify(b));
    } },

    { name: 'a healthy opportunity produces NO blockers (no crying wolf)', run: () => {
      const b = blockers({ opp: { deadline: '2026-09-30' }, subs: [{ email: 'a@b.com' }, { email: 'b@c.com' }, { email: 'c@d.com' }], quotes: 2 }, { now: NOW });
      return ok(b.length === 0, JSON.stringify(b));
    } },

    // ── site visit extraction ──
    { name: 'siteVisitFrom finds a MANDATORY site visit + its date', run: () => {
      const r = siteVisitFrom('A mandatory site visit will be held on August 12, 2026 at the facility.');
      return ok(r && r.required && r.mandatory && r.date === '2026-08-12', JSON.stringify(r));
    } },

    { name: 'siteVisitFrom understands "NO site visit will be offered" (the Eglin case)', run: () => {
      const r = siteVisitFrom('Due to operational constraints, no Government-facilitated site visit will be offered for this requirement.');
      return ok(r && r.required === false, JSON.stringify(r));
    } },

    { name: 'siteVisitFrom NEVER invents a date when none is stated', run: () => {
      const r = siteVisitFrom('A site visit is required prior to submission.');
      return ok(r && r.required === true && r.date === null, JSON.stringify(r));
    } },

    { name: 'siteVisitFrom returns null when the text says nothing about a visit', run: () =>
      ok(siteVisitFrom('Janitorial services for Building 3.') === null && siteVisitFrom('') === null) },
  ],
};
