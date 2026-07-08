// Regression suite for the Action Log / momentum ledger (pods/actions.mjs). Pins the event→achievement
// mapping (what gets mirrored vs. skipped), the spoken-action parser, and the summary counts.

import { classifyEvent, parseManualAction, summarize, TYPES } from '../pods/actions.mjs';

const ok = (pass, detail = '') => ({ pass, detail });

export default {
  agent: 'actions',
  cases: [
    { name: 'classifyEvent maps a submitted proposal / sent email / sources-sought', run: () => {
      const a = classifyEvent({ id: '1', action: 'proposal.submitted', pod: 'gov', payload: { title: 'West Point' }, ts: '2026-07-08T14:00:00Z' });
      const b = classifyEvent({ id: '2', action: 'email.sent', pod: 'gov', payload: { to: 'co@usace.army.mil' } });
      const c = classifyEvent({ id: '3', action: 'sources.sought', pod: 'gov', payload: { title: 'VA Custodial' } });
      return ok(a && a.type === 'submitted' && /West Point/.test(a.text) && a.sourceId === '1'
        && b && b.type === 'sent' && /co@usace/.test(b.text)
        && c && c.type === 'sources_sought', JSON.stringify([a, b, c]));
    } },
    { name: 'classifyEvent SKIPS the noise (scan/score/spend/trace)', run: () =>
      ok(classifyEvent({ action: 'scan.start' }) === null && classifyEvent({ action: 'bid.score' }) === null
        && classifyEvent({ action: 'spend.check' }) === null && classifyEvent({ action: 'proposal.draft' }) === null) },

    { name: 'parseManualAction: "log that I submitted the West Point proposal" → submitted', run: () => {
      const r = parseManualAction('log that I submitted the West Point proposal');
      return ok(r.ok && r.type === 'submitted' && /West Point proposal/.test(r.text) && r.source === 'you', JSON.stringify(r));
    } },
    { name: 'parseManualAction: outreach / sources-sought / registration verbs', run: () =>
      ok(parseManualAction('I reached out to JAN-PRO about teaming').type === 'outreach'
        && parseManualAction('answered the sources-sought for the VA job').type === 'sources_sought'
        && parseManualAction('just registered on PlanHub').type === 'registration') },
    { name: 'parseManualAction ignores questions + non-actions', run: () =>
      ok(parseManualAction('what did I submit this week?').ok === false
        && parseManualAction('should I reach out to them?').ok === false
        && parseManualAction('hello jarvis').ok === false) },
    { name: 'plain "log: X" works even without a known verb', run: () => {
      const r = parseManualAction('log: dropped the capability statement at the pre-bid meeting');
      return ok(r.ok && r.type === 'action' && /capability statement/.test(r.text), JSON.stringify(r));
    } },

    { name: 'summarize counts all-time + this-week by type', run: () => {
      const today = new Date('2026-07-08').toISOString().slice(0, 10);
      const old = new Date('2026-06-01').toISOString().slice(0, 10);
      const s = summarize([
        { type: 'submitted', date: today }, { type: 'submitted', date: old }, { type: 'outreach', date: today },
      ], new Date('2026-07-08T12:00:00Z'));
      return ok(s.total === 3 && s.byType.submitted === 2 && s.week.byType.submitted === 1 && s.week.total === 2, JSON.stringify(s));
    } },
    { name: 'every classified type is renderable (has an icon/label)', run: () =>
      ok(['submitted', 'sent', 'sources_sought', 'outreach', 'won', 'registration', 'meeting', 'action'].every((t) => TYPES[t] && TYPES[t].icon)) },
  ],
};
