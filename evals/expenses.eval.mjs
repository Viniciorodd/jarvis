// Regression suite for voice expense tracking (pods/expenses.mjs). Money is parsed by CODE, never the
// LLM (doctrine #1) — these pin the amount/description/date extraction and the category + totals.

import { parseExpense, categoryOf, summarize } from '../pods/expenses.mjs';

const NOW = new Date('2026-07-08T15:00:00Z');
const p = (t) => parseExpense(t, NOW);
const ok = (pass, detail = '') => ({ pass, detail });

export default {
  agent: 'expenses',
  cases: [
    { name: '"I spent $40 on gas today" → 40 / gas / today / transport', run: () => {
      const r = p('Hey Jarvis, I spent $40 on gas today');
      return ok(r.ok && r.amount === 40 && r.description === 'gas' && r.date === '2026-07-08' && r.category === 'transport', JSON.stringify(r));
    } },
    { name: '"spent 120 on groceries yesterday" → 120 / groceries / yesterday / food', run: () => {
      const r = p('spent 120 on groceries yesterday');
      return ok(r.ok && r.amount === 120 && r.description === 'groceries' && r.date === '2026-07-07' && r.category === 'food', JSON.stringify(r));
    } },
    { name: '"paid 15 bucks for coffee" and "$45 on lunch" parse the amount + item', run: () => {
      const a = p('paid 15 bucks for coffee'); const b = p('$45 on lunch');
      return ok(a.ok && a.amount === 15 && a.description === 'coffee' && b.ok && b.amount === 45 && b.description === 'lunch', JSON.stringify([a, b]));
    } },
    { name: 'decimals + commas: "spent $1,250.50 on the SAM registration"', run: () => {
      const r = p('spent $1,250.50 on the SAM registration');
      return ok(r.ok && r.amount === 1250.5 && /sam registration/i.test(r.description) && r.category === 'business', JSON.stringify(r));
    } },
    { name: 'no amount or no spend-context → not an expense (ok:false)', run: () =>
      ok(p('what did I spend this week?').ok === false && p('the meeting is at 40 Main St').ok === false && p('hello jarvis').ok === false) },
    { name: 'categoryOf maps common items', run: () =>
      ok(categoryOf('gas') === 'transport' && categoryOf('lunch') === 'food' && categoryOf('electric bill') === 'bills' && categoryOf('random thing') === 'other') },
    { name: 'summarize rolls totals + by-category', run: () => {
      const s = summarize([{ amount: 40, category: 'transport' }, { amount: 10, category: 'food' }, { amount: 5, category: 'food' }]);
      return ok(s.count === 3 && s.total === 55 && s.byCategory.food === 15 && s.byCategory.transport === 40, JSON.stringify(s));
    } },
  ],
};
