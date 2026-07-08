// Regression suite for voice expense tracking (pods/expenses.mjs). Money is parsed by CODE, never the
// LLM (doctrine #1) — these pin amount/description/date, the personal↔business book split, and totals.

import { parseExpense, categoryOf, detectBook, summarize, parseCorrection } from '../pods/expenses.mjs';

const NOW = new Date('2026-07-08T15:00:00Z');
const p = (t) => parseExpense(t, NOW);
const ok = (pass, detail = '') => ({ pass, detail });

export default {
  agent: 'expenses',
  cases: [
    { name: '"I spent $40 on gas today" → 40 / gas / today / personal (no cue)', run: () => {
      const r = p('Hey Jarvis, I spent $40 on gas today');
      return ok(r.ok && r.amount === 40 && r.description === 'gas' && r.date === '2026-07-08' && r.category === 'transport' && r.book === 'personal', JSON.stringify(r));
    } },
    { name: '"$40 on gas for the business" → business, description stays "gas" (cue stripped)', run: () => {
      const r = p('spent $40 on gas for the business');
      return ok(r.ok && r.amount === 40 && r.description === 'gas' && r.book === 'business', JSON.stringify(r));
    } },
    { name: '"$120 on office supplies for work" → business', run: () => {
      const r = p('paid $120 on office supplies for work');
      return ok(r.ok && r.amount === 120 && r.book === 'business' && /office supplies/i.test(r.description), JSON.stringify(r));
    } },
    { name: '"$60 on groceries for the family" → personal', run: () => {
      const r = p('spent $60 on groceries for the family yesterday');
      return ok(r.ok && r.book === 'personal' && r.date === '2026-07-07' && /groceries/i.test(r.description), JSON.stringify(r));
    } },
    { name: 'a clearly-business item auto-books business even with no cue: "$250 on the SAM registration"', run: () => {
      const r = p('spent $250 on the SAM registration');
      return ok(r.ok && r.amount === 250 && r.category === 'business' && r.book === 'business', JSON.stringify(r));
    } },
    { name: 'decimals + commas: "$1,250.50 on the bond for the LLC" → business', run: () => {
      const r = p('spent $1,250.50 on the bond for the LLC');
      return ok(r.ok && r.amount === 1250.5 && r.book === 'business', JSON.stringify(r));
    } },
    { name: 'detectBook: cues vs none', run: () =>
      ok(detectBook('for the business') === 'business' && detectBook('for the family') === 'personal' && detectBook('on gas') === '') },
    { name: 'no amount / no spend-context → not an expense', run: () =>
      ok(p('what did I spend this week?').ok === false && p('the meeting is at 40 Main St').ok === false && p('hello jarvis').ok === false) },
    { name: 'categoryOf maps common items', run: () =>
      ok(categoryOf('gas') === 'transport' && categoryOf('lunch') === 'food' && categoryOf('electric bill') === 'bills' && categoryOf('random thing') === 'other') },
    { name: 'parseCorrection: "mark that as business" / "that was personal" / "actually, business"', run: () =>
      ok(parseCorrection('actually, mark that last one as business').ok === true && parseCorrection('actually, mark that last one as business').book === 'business'
        && parseCorrection('that was personal').book === 'personal'
        && parseCorrection('no, that should be a business expense').book === 'business') },
    { name: 'parseCorrection ignores non-corrections + real expenses', run: () =>
      ok(parseCorrection('how was your day').ok === false
        && parseCorrection('spent $40 on gas for the business').ok === false
        && parseCorrection('mark the calendar').ok === false) },
    { name: 'summarize splits by book + category', run: () => {
      const s = summarize([{ amount: 40, category: 'transport', book: 'business' }, { amount: 10, category: 'food', book: 'personal' }, { amount: 5, category: 'food', book: 'personal' }]);
      return ok(s.count === 3 && s.total === 55 && s.byBook.business === 40 && s.byBook.personal === 15 && s.byCategory.food === 15, JSON.stringify(s));
    } },
  ],
};
