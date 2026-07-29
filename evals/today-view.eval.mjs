// Regression suite for the Today list (pods/today-view.mjs). This is the screen the operator opens every
// morning, and on 2026-07-29 it showed 140 undifferentiated tasks with raw Markdown and a broken emoji.
// The bar: readable text, dates before opinions, no silent truncation, and nothing invented or hidden.

import { cleanTaskText, taskScore, taskReason, rankToday } from '../pods/today-view.mjs';

const ok = (pass, detail = '') => ({ pass, detail });
const TODAY = '2026-07-29';

export default {
  agent: 'today-view',
  cases: [
    // ── the text he actually saw ──
    { name: 'THE BUG: wikilinks + bold render as words, not as Markdown', run: () => {
      const t = cleanTaskText('🤖 **GovCon autonomous outreach — hand [[PRD — GovCon Autonomous Outreach (agents send)]] to Claude Code.**');
      return ok(!/\*\*|\[\[|\]\]/.test(t) && /GovCon Autonomous Outreach/.test(t), t);
    } },

    { name: 'a piped wikilink shows its LABEL, not its file path', run: () =>
      ok(cleanTaskText('see [[00 - System/Jarvis/PRD — Foo.md|the outreach PRD]]') === 'see the outreach PRD', cleanTaskText('see [[00 - System/Jarvis/PRD — Foo.md|the outreach PRD]]')) },

    { name: 'THE BROKEN EMOJI: a lone surrogate is stripped, not rendered as a black diamond', run: () => {
      const t = cleanTaskText('\uDEA8 FIX JARVIS LYING');
      return ok(!/[\uD800-\uDFFF]/.test(t) && /FIX JARVIS LYING/.test(t), JSON.stringify(t));
    } },

    { name: 'a REAL emoji pair survives (we strip breakage, not personality)', run: () =>
      ok(cleanTaskText('🤖 ship it') === '🤖 ship it', cleanTaskText('🤖 ship it')) },

    { name: 'markdown links, code and html collapse to their text', run: () =>
      ok(cleanTaskText('call [Nancy](tel:123) re `DICOM` <b>now</b>') === 'call Nancy re DICOM now', cleanTaskText('call [Nancy](tel:123) re `DICOM` <b>now</b>')) },

    // ── ranking: a date is a commitment, a priority is an opinion ──
    { name: 'OVERDUE outranks everything', run: () =>
      ok(taskScore({ due: '2026-07-01' }, TODAY) < taskScore({ due: TODAY }, TODAY)) },

    { name: 'due today outranks a "highest priority" task with no date', run: () =>
      ok(taskScore({ due: TODAY }, TODAY) < taskScore({ priority: 'highest' }, TODAY)) },

    { name: 'among undated tasks, priority still decides', run: () =>
      ok(taskScore({ priority: 'highest' }, TODAY) < taskScore({ priority: 'low' }, TODAY)) },

    { name: 'every surfaced task can say WHY it is there', run: () =>
      ok(taskReason({ due: '2026-07-01' }, TODAY) === 'overdue'
        && taskReason({ due: TODAY }, TODAY) === 'due today'
        && taskReason({ scheduled: TODAY }, TODAY) === 'scheduled today'
        && taskReason({ priority: 'highest' }, TODAY) === 'highest priority') },

    // ── the list itself ──
    { name: 'THE LIVE CASE: 140 tasks become a readable handful, and it SAYS how many it hid', run: () => {
      const many = Array.from({ length: 140 }, (_, i) => ({ text: 'task ' + i, priority: 'normal' }));
      const r = rankToday(many, { today: TODAY, limit: 7 });
      return ok(r.items.length === 7 && r.total === 140 && r.hidden === 133, JSON.stringify({ n: r.items.length, total: r.total, hidden: r.hidden }));
    } },

    { name: 'completed tasks never appear', run: () => {
      const r = rankToday([{ text: 'done thing', done: true }, { text: 'open thing' }], { today: TODAY });
      return ok(r.items.length === 1 && r.items[0].text === 'open thing', JSON.stringify(r.items.map((i) => i.text)));
    } },

    { name: 'the same task in two vault files is listed ONCE', run: () => {
      const r = rankToday([{ text: '**Call Nancy**', file: 'a.md' }, { text: 'Call Nancy', file: 'b.md' }], { today: TODAY });
      return ok(r.items.length === 1 && r.total === 1, JSON.stringify(r.items.map((i) => i.text)));
    } },

    { name: 'the overdue item lands at the TOP of the real list', run: () => {
      const r = rankToday([
        { text: 'someday idea', priority: 'low' },
        { text: 'big rock', priority: 'highest' },
        { text: 'the overdue one', due: '2026-07-02' },
      ], { today: TODAY });
      return ok(r.items[0].text === 'the overdue one' && r.items[0].reason === 'overdue', JSON.stringify(r.items.map((i) => i.text)));
    } },

    { name: 'a task that is only Markdown punctuation is dropped, never shown blank', run: () => {
      const r = rankToday([{ text: '**  **' }, { text: 'real one' }], { today: TODAY });
      return ok(r.items.length === 1 && r.items[0].text === 'real one', JSON.stringify(r.items.map((i) => i.text)));
    } },

    { name: 'limit 0 means show everything (the "all →" view hides nothing)', run: () => {
      const r = rankToday(Array.from({ length: 30 }, (_, i) => ({ text: 't' + i })), { today: TODAY, limit: 0 });
      return ok(r.items.length === 30 && r.hidden === 0, JSON.stringify({ n: r.items.length, hidden: r.hidden }));
    } },

    { name: 'empty / garbage input does not throw', run: () =>
      ok(rankToday().items.length === 0 && rankToday(null).total === 0 && cleanTaskText() === '' && cleanTaskText(null) === '') },
  ],
};
