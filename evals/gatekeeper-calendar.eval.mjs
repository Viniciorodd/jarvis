// Regression suite for the ambient calendar watcher (pods/gatekeeper-calendar.mjs, PRD §3d).
//
// The PRD's own headline number is the spine: a "30-minute coffee" is really ~1.75 hours once you count
// driving and getting back into work. If this file can't prove that, the whole feature is just a nag.
//
// The other half is restraint. A watcher that comments on every event gets muted inside a week, and a muted
// watcher protects nothing — so `keep` must be the common answer and the alert must be SILENT on it.

import { meetingCost, couldBeEmail, collisions, evaluateEvent, eventAlert, REFOCUS_MIN } from '../pods/gatekeeper-calendar.mjs';

const ok = (pass, detail = '') => ({ pass, detail });
const at = (h, m = 0) => new Date(2026, 7, 6, h, m).toISOString();

export default {
  agent: 'gatekeeper-calendar',
  cases: [
    // ── the PRD's headline number ──
    { name: 'THE NUMBER: a 30-min coffee with a 25-min drive is ~1.75h, not 0.5', run: () => {
      const c = meetingCost({ minutes: 30, travelMinutesEachWay: 25 });
      return ok(c.breakdown.totalMin >= 100 && c.breakdown.totalMin <= 120, JSON.stringify(c.breakdown));
    } },

    { name: 'a VIRTUAL call still costs re-focus — it is not free because you did not drive', run: () => {
      const c = meetingCost({ minutes: 30, isVirtual: true });
      return ok(c.breakdown.travelMin === 0 && c.breakdown.refocusMin === REFOCUS_MIN && c.breakdown.totalMin > 30, JSON.stringify(c.breakdown));
    } },

    { name: 'travel is counted BOTH ways', run: () => {
      const one = meetingCost({ minutes: 30, travelMinutesEachWay: 20 });
      return ok(one.breakdown.travelMin === 40, String(one.breakdown.travelMin));
    } },

    // ── "could this be an email?" — conservative on purpose ──
    { name: 'a 60-min catch-up with no agenda is flagged', run: () =>
      ok(couldBeEmail({ summary: 'Coffee catch up', minutes: 60 }).likely) },

    { name: 'a real meeting with an AGENDA is never flagged', run: () =>
      ok(!couldBeEmail({ summary: 'Contract review — decide on scope', minutes: 60 }).likely) },

    { name: 'a group meeting is never flagged (that is not an email)', run: () =>
      ok(!couldBeEmail({ summary: 'Team sync', minutes: 60, attendees: 5 }).likely) },

    { name: 'a short call is left alone', run: () =>
      ok(!couldBeEmail({ summary: 'quick call', minutes: 15 }).likely) },

    // ── collisions make a decline TRUE, not an excuse ──
    { name: 'an event overlapping a protected block is detected', run: () => {
      const hits = collisions({ start: at(10), end: at(11) }, [{ start: at(9), end: at(12), summary: 'REDOS build block' }]);
      return ok(hits.length === 1 && /REDOS/.test(hits[0]), JSON.stringify(hits));
    } },

    { name: 'an event that does NOT overlap is not a collision', run: () =>
      ok(collisions({ start: at(14), end: at(15) }, [{ start: at(9), end: at(12), summary: 'block' }]).length === 0) },

    { name: 'a garbage date never invents a collision', run: () =>
      ok(collisions({ start: 'not a date' }, [{ start: at(9), end: at(12) }]).length === 0) },

    // ── the recommendation, and its restraint ──
    { name: 'RESTRAINT: an ordinary short call is KEEP — and says nothing', run: () => {
      const ev = evaluateEvent({ event: { summary: 'Quick sync', start: at(14), end: at(14, 20), location: '' } });
      return ok(ev.action === 'keep' && eventAlert({ summary: 'Quick sync', start: at(14) }, ev) === null, JSON.stringify(ev.action));
    } },

    { name: 'an event on a protected block says MOVE, and names what it hit', run: () => {
      const ev = evaluateEvent({
        event: { summary: 'Coffee w/ Marcus', start: at(10), end: at(11), location: 'Scranton' },
        protectedBlocks: [{ start: at(9), end: at(12), summary: 'REDOS build block' }],
      });
      return ok(ev.action === 'move' && /REDOS/.test(ev.why), JSON.stringify(ev));
    } },

    { name: 'a long agenda-less block says SHORTEN', run: () => {
      const ev = evaluateEvent({ event: { summary: 'Catch up', start: at(13), end: at(14), location: '' } });
      return ok(ev.action === 'shorten', JSON.stringify({ a: ev.action, w: ev.why }));
    } },

    { name: 'RECOVERY DEBT shifts the answer — it will cost more than it looks', run: () => {
      const ev = evaluateEvent({
        event: { summary: 'Site visit', start: at(10), end: at(12), location: 'Erie PA' },
        recoveryDaysOutstanding: 2,
      });
      return ok(ev.action === 'move' && /recovery day/i.test(ev.why), JSON.stringify(ev.why));
    } },

    { name: 'the headline carries the REAL cost, not the slot length', run: () => {
      const ev = evaluateEvent({ event: { summary: 'Coffee', start: at(10), end: at(10, 30), location: 'Wilkes-Barre' } });
      return ok(/h real cost/.test(ev.headline) && ev.cost.totalHours > 0.5, ev.headline);
    } },

    { name: 'a virtual event is recognised and charged no travel', run: () => {
      const ev = evaluateEvent({ event: { summary: 'Zoom with the CO', start: at(10), end: at(10, 30), location: 'https://zoom.us/j/123' } });
      return ok(ev.isVirtual && ev.cost.breakdown.travelMin === 0, JSON.stringify({ v: ev.isVirtual, t: ev.cost.breakdown.travelMin }));
    } },

    { name: 'the alert names the event, the cost, and ONE suggestion', run: () => {
      const e = { summary: 'Coffee w/ Marcus', start: at(10), end: at(11), location: 'Scranton' };
      const a = eventAlert(e, evaluateEvent({ event: e, protectedBlocks: [{ start: at(9), end: at(12), summary: 'REDOS block' }] }));
      return ok(/Marcus/.test(a) && /real cost/.test(a) && /Move it/.test(a), a);
    } },

    { name: 'empty / garbage input does not throw', run: () =>
      ok(evaluateEvent().action === 'keep' && eventAlert() === null && meetingCost().totalHours > 0
        && couldBeEmail().likely === false && collisions().length === 0) },
  ],
};
