// Regression suite for the focus/time tracker (pods/focus.mjs). Pins the Forest CSV parser, the voice
// parser, period bucketing, and aggregation — the math behind the charts must be right.

import { splitCsvLine, parseForestCsv, parseFocusUtterance, parseFocusDate, sessionsOn, bucketKey, summarize, currentStreak } from '../pods/focus.mjs';

const ok = (pass, detail = '') => ({ pass, detail });
const NOW = new Date('2026-07-15T12:00:00'); // fixed "now" so relative dates are deterministic

export default {
  agent: 'focus',
  cases: [
    { name: 'splitCsvLine respects quoted fields with commas', run: () => {
      const f = splitCsvLine('2016-01-21T14:49:13.000-0500,2016-01-21T15:14:13.000-0500,Work,"note, with comma",Cedar,True');
      return ok(f.length === 6 && f[3] === 'note, with comma' && f[5] === 'True', JSON.stringify(f));
    } },
    { name: 'parseForestCsv → sessions with correct minutes + tag + success', run: () => {
      const csv = 'Start Time,End Time,Tag,Note,Tree Type,Is Success\n2016-01-21T14:49:13.000-0500,2016-01-21T15:14:13.000-0500,Unset,Reading,Cedar,True\n2016-01-28T15:20:27.000-0500,2016-01-28T15:34:23.000-0500,Study,,Cedar,False';
      const s = parseForestCsv(csv);
      return ok(s.length === 2 && s[0].minutes === 25 && s[0].tag === 'unset' && s[0].success === true && s[0].date === '2016-01-21'
        && s[1].minutes === 14 && s[1].tag === 'study' && s[1].success === false, JSON.stringify(s));
    } },
    { name: 'parseFocusUtterance: minutes, hours, hours+minutes, tag', run: () =>
      ok(parseFocusUtterance('I focused 90 minutes on gov proposals').minutes === 90
        && parseFocusUtterance('deep work 2 hours on the bid').minutes === 120
        && parseFocusUtterance('focused 1 hour and 30 min on gym').minutes === 90
        && parseFocusUtterance('studied 45 min on math').tag === 'math'
        && parseFocusUtterance('what did I focus on?').ok === false) },
    { name: 'parseFocusDate: ISO / US / month-name / relative + time (BACKDATING)', run: () => {
      const iso = parseFocusDate('logged 2026-07-13', NOW);
      const us = parseFocusDate('7/13/2026 30 min', NOW);
      const usShort = parseFocusDate('on 3/4 I read', NOW);       // no year → current year
      const mon = parseFocusDate('July 13, 2026 at 2am', NOW);
      const yest = parseFocusDate('yesterday 30 min', NOW);
      const ago = parseFocusDate('2 days ago', NOW);
      return ok(iso.date === '2026-07-13' && us.date === '2026-07-13' && usShort.date === '2026-03-04'
        && mon.date === '2026-07-13' && mon.start === '2026-07-13T02:00:00'
        && yest.date === '2026-07-14' && ago.date === '2026-07-13',
        JSON.stringify({ iso: iso.date, us: us.date, usShort: usShort.date, mon: mon.date, monStart: mon.start, yest: yest.date, ago: ago.date }));
    } },
    { name: 'parseFocusUtterance BACKDATES a pasted log to the stated date, not now', run: () => {
      const p = parseFocusUtterance('July 13 2026 at 2 AM, 30 minutes of reading', NOW);
      const noDate = parseFocusUtterance('focused 45 min on math', NOW);
      return ok(p.ok && p.minutes === 30 && p.tag === 'reading' && p.date === '2026-07-13' && p.start === '2026-07-13T02:00:00'
        && noDate.ok && noDate.date === '', JSON.stringify({ p, noDate }));
    } },
    { name: 'sessionsOn returns a day\'s sessions ordered by time', run: () => {
      const list = [
        { date: '2026-07-13', start: '2026-07-13T14:00:00', minutes: 60, tag: 'gov', source: 'voice' },
        { date: '2026-07-13', start: '2026-07-13T02:00:00', minutes: 30, tag: 'reading', source: 'manual' },
        { date: '2026-07-12', start: '', minutes: 20, tag: 'gym', source: 'manual' },
      ];
      const day = sessionsOn(list, '2026-07-13');
      return ok(day.length === 2 && day[0].tag === 'reading' && day[1].tag === 'gov', JSON.stringify(day.map((d) => d.tag)));
    } },
    { name: 'bucketKey groups day/week/month/quarter/year', run: () =>
      ok(bucketKey('2026-07-10', 'day') === '2026-07-10'
        && bucketKey('2026-07-10', 'month') === '2026-07'
        && bucketKey('2026-07-10', 'quarter') === '2026-Q3'
        && bucketKey('2026-01-10', 'quarter') === '2026-Q1'
        && bucketKey('2026-07-10', 'year') === '2026'
        && /^2026-W\d\d$/.test(bucketKey('2026-07-10', 'week'))) },
    { name: 'summarize totals + series + by-tag + success rate', run: () => {
      const sessions = [
        { date: '2026-07-08', minutes: 60, tag: 'gov', success: true },
        { date: '2026-07-08', minutes: 30, tag: 'gym', success: true },
        { date: '2026-07-09', minutes: 90, tag: 'gov', success: false },
      ];
      const s = summarize(sessions, { grouping: 'day' });
      return ok(s.totalMinutes === 180 && s.totalHours === 3 && s.sessions === 3 && s.activeDays === 2
        && s.successRate === 67 && s.series.length === 2 && s.topTags[0].tag === 'gov' && s.topTags[0].minutes === 150, JSON.stringify({ t: s.totalMinutes, sr: s.successRate, tt: s.topTags[0] }));
    } },
    { name: 'currentStreak counts consecutive days to the latest active day', run: () =>
      ok(currentStreak(['2026-07-08', '2026-07-09', '2026-07-10']) === 3
        && currentStreak(['2026-07-08', '2026-07-10']) === 1
        && currentStreak([]) === 0) },
  ],
};
