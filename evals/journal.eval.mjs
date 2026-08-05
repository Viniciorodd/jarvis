// Regression suite for the log (pods/journal.mjs).
//
// His two real examples are the spec: "i wish it was raining today" and "nobody cares". Four words, no
// insight, no audience. Every rule here exists so those survive exactly as typed.

import { entryLine, parseLine, parseMonth, insertEntry, newMonth, monthFile, stats,
  placeKey, nameFor, rememberPlace, feed } from '../pods/journal.mjs';

const ok = (pass, detail = '') => ({ pass, detail });

export default {
  agent: 'journal',
  cases: [
    // ── his actual entries ─────────────────────────────────────────────────────────────────────────
    { name: 'his real entry round-trips exactly', run: () => {
      const line = entryLine({ time: '09:42', place: 'Nanticoke', text: 'i wish it was raining today' });
      const back = parseLine(line);
      return ok(back.text === 'i wish it was raining today' && back.time === '09:42' && back.place === 'Nanticoke',
        line + ' → ' + JSON.stringify(back));
    } },

    { name: 'a two-word entry is a valid entry', run: () => {
      // "nobody cares." There is no minimum length. A journal with a word count is a journal he stops using.
      const back = parseLine(entryLine({ time: '14:10', text: 'nobody cares' }));
      return ok(back.text === 'nobody cares' && back.place === '');
    } },

    { name: '🚨 nothing he writes is ever refused', run: () => {
      // The crisis list stops the system turning his worst night into a GOAL. It must never stop him writing
      // the sentence. A journal that refuses the entry you most needed to make would be the cruellest bug
      // in this codebase.
      const hard = ['i want to die', 'nobody cares', 'i hate all of this', 'i am so tired of trying'];
      const lost = hard.filter((t) => !parseLine(entryLine({ time: '03:00', text: t })));
      return ok(lost.length === 0, 'REFUSED: ' + JSON.stringify(lost));
    } },

    { name: 'his own dashes survive — the split is on the FIRST separator only', run: () => {
      const t = 'today was long — longer than it needed to be — and i am done';
      return ok(parseLine(entryLine({ time: '22:15', text: t })).text === t);
    } },

    { name: 'a multi-line thought becomes one entry, not three', run: () =>
      ok(parseLine(entryLine({ time: '08:00', text: 'one\ntwo\nthree' })).text === 'one two three') },

    { name: 'an empty entry produces nothing at all', run: () =>
      ok(entryLine({ time: '09:00', text: '   ' }) === '' && entryLine() === '') },

    // ── the file ───────────────────────────────────────────────────────────────────────────────────
    { name: 'the first entry of a month builds the file around it', run: () => {
      const md = insertEntry('', { date: '2026-08-05', time: '09:42', text: 'i wish it was raining today' });
      const e = parseMonth(md);
      return ok(e.length === 1 && e[0].date === '2026-08-05' && /# Log — August 2026/.test(md), md);
    } },

    { name: 'a second entry the same day joins that day, in the order he wrote them', run: () => {
      let md = insertEntry('', { date: '2026-08-05', time: '09:42', text: 'i wish it was raining today' });
      md = insertEntry(md, { date: '2026-08-05', time: '14:10', text: 'nobody cares' });
      const e = parseMonth(md);
      return ok(e.length === 2 && e[0].time === '09:42' && e[1].time === '14:10'
        && (md.match(/^## 2026-08-05$/gm) || []).length === 1, md);
    } },

    { name: '⚠ a new day goes on TOP, so opening the file lands on today', run: () => {
      let md = insertEntry('', { date: '2026-08-05', time: '09:42', text: 'first day' });
      md = insertEntry(md, { date: '2026-08-06', time: '08:00', text: 'second day' });
      const heads = (md.match(/^## (\d{4}-\d{2}-\d{2})$/gm) || []).map((h) => h.slice(3));
      return ok(heads[0] === '2026-08-06' && heads[1] === '2026-08-05', JSON.stringify(heads));
    } },

    { name: 'entries land under the RIGHT day when days interleave', run: () => {
      let md = insertEntry('', { date: '2026-08-05', time: '09:00', text: 'monday morning' });
      md = insertEntry(md, { date: '2026-08-06', time: '08:00', text: 'tuesday' });
      md = insertEntry(md, { date: '2026-08-05', time: '21:00', text: 'monday night' });
      const e = parseMonth(md);
      const mon = e.filter((x) => x.date === '2026-08-05').map((x) => x.text);
      return ok(mon.join('|') === 'monday morning|monday night', JSON.stringify(e));
    } },

    { name: 'hand-edited junk in the file is skipped, never guessed at', run: () => {
      // He will open this in Obsidian and type in it. A stray line is not an entry.
      const md = newMonth('2026-08-01') + '\n## 2026-08-05\n\nsome loose prose he typed\n- a plain bullet\n'
        + '- **09:42** — a real one\n';
      const e = parseMonth(md);
      return ok(e.length === 1 && e[0].text === 'a real one', JSON.stringify(e));
    } },

    { name: 'the month file is named for the month', run: () =>
      ok(monthFile('2026-08-05') === '2026-08.md') },

    // ── stats, for the main menu ───────────────────────────────────────────────────────────────────
    { name: 'counts today, this week and all time', run: () => {
      const e = [
        { date: '2026-08-05', time: '09:00', text: 'a' }, { date: '2026-08-05', time: '10:00', text: 'b' },
        { date: '2026-08-03', time: '09:00', text: 'c' }, { date: '2026-07-01', time: '09:00', text: 'd' },
      ];
      const s = stats(e, '2026-08-05');
      return ok(s.today === 2 && s.week === 3 && s.total === 4 && s.days === 3, JSON.stringify(s));
    } },

    { name: 'the streak counts consecutive days', run: () => {
      const e = ['2026-08-05', '2026-08-04', '2026-08-03'].map((d) => ({ date: d, time: '09:00', text: 'x' }));
      return ok(stats(e, '2026-08-05').streak === 3, String(stats(e, '2026-08-05').streak));
    } },

    { name: '⚠ an empty morning does not break the streak', run: () => {
      // At 9am he has not written yet. A counter that resets every morning punishes him for waking up.
      const e = ['2026-08-04', '2026-08-03'].map((d) => ({ date: d, time: '09:00', text: 'x' }));
      return ok(stats(e, '2026-08-05').streak === 2, String(stats(e, '2026-08-05').streak));
    } },

    { name: 'a real gap does break it', run: () => {
      const e = ['2026-08-02', '2026-08-01'].map((d) => ({ date: d, time: '09:00', text: 'x' }));
      return ok(stats(e, '2026-08-05').streak === 0, String(stats(e, '2026-08-05').streak));
    } },

    // ── place ──────────────────────────────────────────────────────────────────────────────────────
    { name: 'a place he named once is recognised when he comes back', run: () => {
      const p = rememberPlace({}, 41.2033, -76.0002, 'Home');
      return ok(nameFor(p, 41.2034, -76.0001) === 'Home', JSON.stringify(p));
    } },

    { name: 'the next street over is NOT home', run: () =>
      ok(nameFor(rememberPlace({}, 41.2033, -76.0002, 'Home'), 41.2400, -76.0400) === '') },

    { name: 'coordinates are rounded before they are stored as a key', run: () =>
      // Never an exact fix as the identifier — arriving from a different direction is still the same place.
      ok(placeKey(41.20331, -76.00021) === placeKey(41.20339, -76.00028)) },

    { name: 'a missing or nonsense fix names nothing', run: () =>
      ok(placeKey(undefined, undefined) === '' && nameFor({}, 'x', 'y') === ''
        && Object.keys(rememberPlace({}, 41.2, -76, '')).length === 0) },

    // ── the feed ───────────────────────────────────────────────────────────────────────────────────
    { name: 'the feed reads newest first', run: () => {
      const e = [
        { date: '2026-08-05', time: '09:00', text: 'morning' },
        { date: '2026-08-06', time: '08:00', text: 'next day' },
        { date: '2026-08-05', time: '21:00', text: 'night' },
      ];
      return ok(feed(e).map((x) => x.text).join('|') === 'next day|night|morning');
    } },

    { name: 'empty / garbage input does not throw', run: () =>
      ok(parseMonth().length === 0 && feed().length === 0 && stats().total === 0
        && insertEntry('', {}) === '' && !parseLine('just some text')) },
  ],
};
