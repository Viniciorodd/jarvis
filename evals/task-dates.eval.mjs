// Regression suite for date proposals (pods/task-dates.mjs). These dates become commitments in the operator's
// vault, so the bar is: never invent a deadline he didn't ask for, never overload a day, never write a date
// onto a line we don't fully understand, and always prefer a date HE already wrote.

import { proposeDates, statedDate, setDueOnLine, horizonFor, nextWeekday, iso } from '../pods/task-dates.mjs';

const ok = (pass, detail = '') => ({ pass, detail });
const TODAY = '2026-07-29';           // a Wednesday
const t = (over = {}) => ({ id: 'x', text: 'a task', done: false, due: null, scheduled: null, ...over });

export default {
  agent: 'task-dates',
  cases: [
    // ── prefer HIS date ──
    { name: 'an explicit ISO date in the text wins', run: () =>
      ok(statedDate('file the 1065 by 2026-09-15', TODAY) === '2026-09-15', String(statedDate('file the 1065 by 2026-09-15', TODAY))) },

    { name: 'a written-out date is understood ("Aug 12")', run: () =>
      ok(statedDate('mandatory site visit Aug 12, 2026') === '2026-08-12', String(statedDate('mandatory site visit Aug 12, 2026'))) },

    { name: 'a slash date is understood (8/12)', run: () =>
      ok(statedDate('walkthrough 8/12', TODAY) === '2026-08-12', String(statedDate('walkthrough 8/12', TODAY))) },

    { name: 'VAGUE time language is NEVER turned into a date', run: () =>
      ok(statedDate('call them next week', TODAY) === null && statedDate('do this soon', TODAY) === null && statedDate('sometime in the fall', TODAY) === null) },

    { name: 'a task carrying his own date is proposed AS-IS and marked as his', run: () => {
      const [p] = proposeDates([t({ text: 'submit by 2026-08-20' })], { today: TODAY });
      return ok(p.due === '2026-08-20' && p.stated === true && /already wrote/.test(p.reason), JSON.stringify(p));
    } },

    { name: 'a date he wrote that has already PASSED is not reused as a future deadline', run: () => {
      const [p] = proposeDates([t({ text: 'was due 2026-01-05' })], { today: TODAY });
      return ok(p.stated === false && p.due > TODAY, JSON.stringify(p));
    } },

    // ── the horizon ──
    { name: 'priority sets the horizon: highest is days away, low is weeks', run: () =>
      ok(horizonFor('highest') < horizonFor('high') && horizonFor('high') < horizonFor('medium') && horizonFor('medium') < horizonFor('low')) },

    { name: 'highest-priority work lands inside its horizon', run: () => {
      const [p] = proposeDates([t({ priority: 'highest' })], { today: TODAY });
      const days = (new Date(p.due) - new Date(TODAY)) / 86400000;
      return ok(days > 0 && days <= horizonFor('highest') + 2, JSON.stringify({ due: p.due, days }));
    } },

    { name: 'nothing is ever proposed for TODAY (today is already spoken for)', run: () => {
      const rows = proposeDates(Array.from({ length: 10 }, (_, i) => t({ id: 'i' + i, priority: 'highest' })), { today: TODAY });
      return ok(rows.every((r) => r.due > TODAY), JSON.stringify(rows.map((r) => r.due)));
    } },

    // ── capacity: the whole point ──
    { name: 'THE POINT: 14 "highest" tasks do NOT all land on one day', run: () => {
      const rows = proposeDates(Array.from({ length: 14 }, (_, i) => t({ id: 'i' + i, priority: 'highest' })), { today: TODAY, perDay: 2 });
      const byDay = {};
      rows.forEach((r) => { byDay[r.due] = (byDay[r.due] || 0) + 1; });
      return ok(Object.keys(byDay).length > 1, JSON.stringify(byDay));
    } },

    { name: 'no weekend deadlines (a date he blows through teaches him to ignore them all)', run: () => {
      const rows = proposeDates(Array.from({ length: 12 }, (_, i) => t({ id: 'i' + i })), { today: TODAY });
      const bad = rows.filter((r) => [0, 6].includes(new Date(r.due + 'T12:00:00').getDay()));
      return ok(bad.length === 0, JSON.stringify(bad.map((b) => b.due)));
    } },

    { name: 'nextWeekday pushes Saturday and Sunday to Monday', run: () =>
      ok(iso(nextWeekday(new Date(2026, 6, 4))) === '2026-07-06' && iso(nextWeekday(new Date(2026, 6, 5))) === '2026-07-06') },

    { name: 'every proposal explains ITSELF (he is confirming, not obeying)', run: () => {
      const rows = proposeDates([t({ priority: 'high' }), t({ id: 'b' })], { today: TODAY });
      return ok(rows.every((r) => r.reason && r.reason.length > 8), JSON.stringify(rows.map((r) => r.reason)));
    } },

    // ── never touch what is already dated / done ──
    { name: 'tasks that ALREADY have a date or are done are left alone', run: () => {
      const rows = proposeDates([t({ due: '2026-08-01' }), t({ scheduled: '2026-08-02' }), t({ done: true }), t({ id: 'real' })], { today: TODAY });
      return ok(rows.length === 1 && rows[0].id === 'real', JSON.stringify(rows.map((r) => r.id)));
    } },

    // ── the write ──
    { name: 'setDueOnLine writes Obsidian-Tasks syntax onto an open checkbox', run: () =>
      ok(setDueOnLine('- [ ] call Nancy', '2026-08-03') === '- [ ] call Nancy 📅 2026-08-03', setDueOnLine('- [ ] call Nancy', '2026-08-03')) },

    { name: 'an existing 📅 is REPLACED, never duplicated', run: () => {
      const out = setDueOnLine('- [ ] call Nancy 📅 2026-01-01', '2026-08-03');
      return ok((out.match(/📅/g) || []).length === 1 && /2026-08-03/.test(out), out);
    } },

    { name: 'a COMPLETED task or a non-task line is never edited', run: () =>
      ok(setDueOnLine('- [x] done thing', '2026-08-03') === '- [x] done thing'
        && setDueOnLine('just a paragraph', '2026-08-03') === 'just a paragraph'
        && setDueOnLine('## a heading', '2026-08-03') === '## a heading') },

    { name: 'a malformed date is refused rather than written', run: () =>
      ok(setDueOnLine('- [ ] x', 'tomorrow') === '- [ ] x' && setDueOnLine('- [ ] x', '') === '- [ ] x') },

    { name: 'empty / garbage input does not throw', run: () =>
      ok(proposeDates().length === 0 && proposeDates(null).length === 0 && statedDate() === null && setDueOnLine() === '') },
  ],
};
