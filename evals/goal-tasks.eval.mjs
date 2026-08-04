// Regression suite for generated to-dos (pods/goal-tasks.mjs).
//
// This is the file that stands between a confident language model and his actual task list. A goal engine
// that generates to-dos is one bad prompt away from telling him to day-trade his way to the down payment,
// so the boundaries live in code and are pinned here.

import { gateTask, needsHim, groundTasks, vaultLine, dueIn, invented } from '../pods/goal-tasks.mjs';

const ok = (pass, detail = '') => ({ pass, detail });

const GOAL = { id: 'g_biz', t: 'Buy a business doing $1M/yr', tier: 'operating' };

export default {
  agent: 'goal-tasks',
  cases: [
    // ── 🚨 the safety gate, in front of this path too ──────────────────────────────────────────────
    { name: '🚨 crisis content can never become a task', run: () => {
      const leaks = ['I want to die', 'I want to kill myself', 'give up on everything'].filter((t) => gateTask(t).ok);
      return ok(leaks.length === 0 && gateTask('I want to die').why === 'crisis', JSON.stringify(leaks));
    } },

    // ── his boundaries, enforced in CODE ───────────────────────────────────────────────────────────
    { name: '⚠ a generated task may never cross one of his own lines', run: () => {
      const through = ['Open a prop firm account to grow the down payment',
        'Fix and flip a house in Nanticoke for the capital',
        'Start a new business selling candles on the side',
        'Claim 8(a) status to win the set-aside',
        'Spend $400 on a lead list'].filter((t) => gateTask(t).ok);
      return ok(through.length === 0, 'GOT THROUGH: ' + JSON.stringify(through));
    } },

    { name: '⚠ the refusal names the rule, so a drop can be explained', run: () =>
      ok(gateTask('Day trade the open for extra capital').why === 'trading is off',
        gateTask('Day trade the open for extra capital').why) },

    { name: 'the work he SHOULD do passes clean', run: () => {
      const blocked = ['Call three primes about subcontracting this week',
        'Pull your credit report from annualcreditreport.com',
        'Send the Fort Indiantown Gap proposal',
        'Ask the bookkeeper for two years of filed returns'].filter((t) => !gateTask(t).ok);
      return ok(blocked.length === 0, 'WRONGLY BLOCKED: ' + JSON.stringify(blocked));
    } },

    // ── dream tier is never planned ────────────────────────────────────────────────────────────────
    { name: '⚠ no task is ever generated for a dream-tier goal', run: () =>
      ok(!gateTask('Tour three castles in Scotland', { tier: 'dream' }).ok
        && gateTask('Tour three castles in Scotland', { tier: 'true' }).ok) },

    // ── L-009: NO FABRICATED CONTACTS ─────────────────────────────────────────────────────────────
    // Live run, free-tier llama-3.3-70b: "Contact John the financial advisor". There is no John. A task
    // naming an invented person looks exactly like a commitment, and he would burn an afternoon on it.
    { name: '🚨 an invented person is refused (the real failure we caught)', run: () => {
      const r = gateTask('Contact John the financial advisor about collateral');
      return ok(!r.ok && /invented a contact/.test(r.why) && invented('Contact John the financial advisor') === 'John', r.why);
    } },

    { name: 'organisations and roles are still addressable', run: () => {
      const blocked = ['Call the SBA office about 7(a) collateral requirements',
        'Contact Farm Credit about their land loan terms',
        'Ask your accountant what filing 2024 and 2025 would cost',
        'Email the county assessor for the parcel valuation'].filter((t) => !gateTask(t).ok);
      return ok(blocked.length === 0, 'WRONGLY BLOCKED: ' + JSON.stringify(blocked));
    } },

    { name: 'a task that merely mentions a name is not blocked — only invented CONTACTS', run: () =>
      // The rule targets "go talk to <invented person>", not every capitalised word in a sentence.
      ok(gateTask('Review the Nanticoke property deed for the collateral figure').ok) },

    // ── thinness: passes every other rule and still says nothing ───────────────────────────────────
    { name: '⚠ a task that names no target is refused', run: () => {
      // Live run again: "Pull credit report", "Call accountant". Which report? Which accountant? About what?
      const through = ['Pull credit report', 'Call accountant', 'Write business summary',
        'Check equipment values'].filter((t) => gateTask(t).ok);
      return ok(through.length === 0, 'GOT THROUGH: ' + JSON.stringify(through));
    } },

    // ── vagueness: the failure mode that LOOKS like output ─────────────────────────────────────────
    { name: '⚠ advice dressed as an action is refused', run: () => {
      // These are what a model writes when it does not know what he should do, and they are worse than an
      // empty list because they read as progress.
      const through = ['Consider your options for financing', 'Think about what the business needs',
        'Explore different funding avenues', 'Stay focused on the goal',
        'Work on your credit'].filter((t) => gateTask(t).ok);
      return ok(through.length === 0, 'GOT THROUGH: ' + JSON.stringify(through));
    } },

    { name: 'a question is not a task', run: () =>
      ok(!gateTask('What is your current credit score?').ok) },

    { name: 'too short or too long is refused', run: () =>
      ok(!gateTask('Call bank').ok && !gateTask('x'.repeat(200)).ok) },

    // ── irreversible steps are FLAGGED, not hidden ─────────────────────────────────────────────────
    { name: 'an irreversible step is marked his to press, not refused', run: () => {
      // "call the bank" is a chore. "sign the loan" is a decision. Both are legitimate to show; only one
      // should ever look routine.
      return ok(needsHim('Sign the SBA loan documents') && gateTask('Sign the SBA loan documents').ok
        && !needsHim('Call the bank to ask about their SBA terms'));
    } },

    // ── grounding a whole round ────────────────────────────────────────────────────────────────────
    { name: 'a generation round keeps the good and reports the dropped', run: () => {
      const r = groundTasks([
        'Pull your credit report from annualcreditreport.com',
        'Day trade to build the down payment',
        'Consider your financing options',
        'Ask your accountant to file the 2025 return',
      ], { goal: GOAL, cap: 'credit_score' });
      return ok(r.kept.length === 2 && r.dropped.length === 2
        && r.dropped.some((d) => d.why === 'trading is off')
        && r.dropped.some((d) => /vague/.test(d.why)), JSON.stringify(r));
    } },

    { name: 'duplicates are collapsed', run: () => {
      const r = groundTasks(['Pull your credit report today', 'Pull your credit report today'], { goal: GOAL });
      return ok(r.kept.length === 1 && r.dropped[0].why === 'duplicate');
    } },

    { name: 'a round is capped at four — more than a week is a wish list', run: () => {
      const many = Array.from({ length: 9 }, (_, i) => 'Call prime number ' + i + ' about subcontracting');
      return ok(groundTasks(many, { goal: GOAL }).kept.length === 4);
    } },

    { name: 'each kept task carries the capability and goal it serves', run: () => {
      const r = groundTasks(['Pull your credit report from annualcreditreport.com'], { goal: GOAL, cap: 'credit_score' });
      return ok(r.kept[0].cap === 'credit_score' && r.kept[0].goalId === 'g_biz' && r.kept[0].goal === GOAL.t);
    } },

    // ── the vault line ─────────────────────────────────────────────────────────────────────────────
    { name: 'an accepted task reads like one he typed himself', run: () =>
      // His vault is Markdown checkboxes with Obsidian date syntax; anything else would stand out as foreign.
      ok(vaultLine({ text: 'Pull your credit report' }, '2026-08-11')
        === '- [ ] Pull your credit report 📅 2026-08-11 #jarvis',
        vaultLine({ text: 'Pull your credit report' }, '2026-08-11')) },

    { name: 'a task with no date still lands cleanly', run: () =>
      ok(vaultLine({ text: 'Call three primes' }) === '- [ ] Call three primes #jarvis') },

    { name: 'due dates are computed, not read off the clock', run: () =>
      ok(dueIn(7, '2026-08-04') === '2026-08-11' && dueIn(0, '2026-08-04') === '2026-08-04') },

    { name: 'empty / garbage input does not throw', run: () =>
      ok(!gateTask().ok && groundTasks().kept.length === 0 && vaultLine() === '' && dueIn(7, 'nonsense') === '') },
  ],
};
