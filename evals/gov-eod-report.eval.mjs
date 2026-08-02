// Regression suite for the end-of-day report (pods/gov/eod-report.mjs). He asked to be left alone during the
// day and told the truth at the end of it. So: the numbers must mean exactly what they say, and a nothing-
// happened day must stay SILENT — an evening "0, 0, 0" is the same noise he asked to stop, in a new hat.

import { eodStats, eodMessage } from '../pods/gov/eod-report.mjs';

const ok = (pass, detail = '') => ({ pass, detail });
const DAY = '2026-08-01';
const ev = (action, over = {}) => ({ ts: DAY + 'T14:00:00Z', action, ...over });

export default {
  agent: 'gov-eod-report',
  cases: [
    { name: 'counts outreach, follow-ups and quotes from the real event log', run: () => {
      const s = eodStats([
        ev('outreach.auto_sent'), ev('outreach.auto_sent'), ev('outreach.followup'),
        ev('sub.reply.parsed', { payload: { quote: '$2,400/mo' }, rationale: 'Acme: quote $2,400/mo' }),
      ], DAY);
      return ok(s.outreachSent === 2 && s.followUps === 1 && s.quotesIn === 1, JSON.stringify(s));
    } },

    { name: 'a reply with NO quote is not counted as a quote', run: () => {
      const s = eodStats([ev('sub.reply.parsed', { payload: {} }), ev('sub.reply.parsed', { payload: { quote: '$100' } })], DAY);
      return ok(s.quotesIn === 1, JSON.stringify({ quotesIn: s.quotesIn }));
    } },

    { name: 'opportunities scanned sums the real counts, not the number of scans', run: () => {
      const s = eodStats([ev('scan.done', { payload: { count: 40 } }), ev('scan.done', { payload: { count: 27 } })], DAY);
      return ok(s.scanned === 67, String(s.scanned));
    } },

    { name: 'YESTERDAY is not counted in today\'s report', run: () => {
      const s = eodStats([ev('outreach.auto_sent'), { ts: '2026-07-31T14:00:00Z', action: 'outreach.auto_sent' }], DAY);
      return ok(s.outreachSent === 1, String(s.outreachSent));
    } },

    { name: 'THE POINT: a day where nothing happened stays SILENT', run: () =>
      ok(eodMessage(eodStats([], DAY), { pendingApprovals: 0, stalled: [] }) === null) },

    { name: 'but a quiet day with something WAITING on him still reports', run: () => {
      const m = eodMessage(eodStats([], DAY), { pendingApprovals: 3 });
      return ok(m && /3 waiting on you/.test(m), String(m));
    } },

    { name: 'the quotes are named, not just counted', run: () => {
      const s = eodStats([ev('sub.reply.parsed', { payload: { quote: '$2,400/mo' }, rationale: 'Acme Facility: quote $2,400/mo' })], DAY);
      const m = eodMessage(s, {});
      return ok(/Acme Facility/.test(m) && /1 quote in/.test(m), m);
    } },

    { name: '"nothing waiting on you" is said out loud — that is the system working', run: () => {
      const m = eodMessage(eodStats([ev('outreach.auto_sent')], DAY), { pendingApprovals: 0 });
      return ok(/Nothing waiting on you/.test(m), m);
    } },

    { name: 'what is STALLED is named, so a dead bid cannot hide', run: () => {
      const m = eodMessage(eodStats([ev('outreach.auto_sent')], DAY), { stalled: ['B100 Deep Clean — no reply in 14d'] });
      return ok(/Stalled/.test(m) && /B100/.test(m), m);
    } },

    { name: 'his move is the LAST line — it is what he reads first on a phone', run: () => {
      const m = eodMessage(eodStats([ev('outreach.auto_sent')], DAY), { pendingApprovals: 2 });
      const lines = m.split('\n').filter(Boolean);
      return ok(/waiting on you/.test(lines[lines.length - 1]), lines[lines.length - 1]);
    } },

    { name: 'errors surface rather than being swallowed by a tidy summary', run: () => {
      const m = eodMessage(eodStats([ev('outreach.auto_sent'), ev('scan.done', { status: 'error' })], DAY), {});
      return ok(/1 error/.test(m), m);
    } },

    { name: 'empty / garbage input does not throw', run: () =>
      ok(eodStats().outreachSent === 0 && eodStats(null, DAY).quotesIn === 0 && eodMessage() === null && eodMessage({}, {}) === null) },
  ],
};
