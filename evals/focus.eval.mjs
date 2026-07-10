// Regression suite for the focus/time tracker (pods/focus.mjs). Pins the Forest CSV parser, the voice
// parser, period bucketing, and aggregation — the math behind the charts must be right.

import { splitCsvLine, parseForestCsv, parseFocusUtterance, bucketKey, summarize, currentStreak } from '../pods/focus.mjs';

const ok = (pass, detail = '') => ({ pass, detail });

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
