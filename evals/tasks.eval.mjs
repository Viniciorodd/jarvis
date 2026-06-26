// Regression suite for the vault task engine (control-plane/tasks.mjs). These pin the deterministic
// parse/format/filter logic the cockpit relies on — if any regress, the operator could see the wrong
// "today + overdue", lose a task on add, or fail to check one off. Pure functions only (no file I/O).

import {
  parseTaskLine, isOpenDueByToday, todayAndOverdue, formatTaskLine, completeLine, extractTasks,
} from '../control-plane/tasks.mjs';

const ok = (pass, detail = '') => ({ pass, detail });

export default {
  agent: 'tasks',
  cases: [
    { name: 'parses a full task line (text/due/priority/tags)', run: () => {
      const t = parseTaskLine('- [ ] Buy paint for 463 2nd 📅 2026-07-02 🔼 #real-estate');
      return ok(t && !t.done && t.text === 'Buy paint for 463 2nd' && t.due === '2026-07-02' && t.priority === 'medium' && t.tags.join() === 'real-estate',
        t ? JSON.stringify({ text: t.text, due: t.due, priority: t.priority, tags: t.tags }) : 'null');
    } },
    { name: 'parses a done task with a ✅ done-date', run: () => {
      const t = parseTaskLine('- [x] Sent the proposal ✅ 2026-06-20');
      return ok(t && t.done === true && t.doneDate === '2026-06-20' && t.text === 'Sent the proposal');
    } },
    { name: 'accepts "*" bullets, ignores non-task lines', run: () => {
      return ok(parseTaskLine('* [ ] star bullet task') !== null
        && parseTaskLine('## A heading') === null
        && parseTaskLine('just a paragraph') === null
        && parseTaskLine('- a plain bullet, no checkbox') === null);
    } },
    { name: 'strips recurrence (🔁) out of the display text', run: () => {
      const t = parseTaskLine('- [ ] water plants 🔁 every week 📅 2026-06-26 #home');
      return ok(t && t.text === 'water plants' && t.recurring === true && t.due === '2026-06-26' && t.tags.join() === 'home',
        t ? t.text : 'null');
    } },
    { name: 'extracts multiple tags', run: () => {
      const t = parseTaskLine('- [ ] triage mail 🔼 #money #personal');
      return ok(t && t.tags.length === 2 && t.tags.includes('money') && t.tags.includes('personal'));
    } },
    { name: 'isOpenDueByToday: overdue + due-today true, future + undated + done false', run: () => {
      const today = '2026-06-25';
      return ok(isOpenDueByToday({ done: false, due: '2026-06-20' }, today) === true
        && isOpenDueByToday({ done: false, due: '2026-06-25' }, today) === true
        && isOpenDueByToday({ done: false, due: '2026-07-01' }, today) === false
        && isOpenDueByToday({ done: false, due: null }, today) === false
        && isOpenDueByToday({ done: true, due: '2026-06-20' }, today) === false);
    } },
    { name: 'todayAndOverdue filters + sorts by due then priority', run: () => {
      const tasks = [
        { done: false, due: '2026-07-10', text: 'future' },
        { done: false, due: '2026-06-24', text: 'overdue-low', priority: 'low' },
        { done: false, due: '2026-06-25', text: 'today-highest', priority: 'highest' },
        { done: false, due: '2026-06-24', text: 'overdue-high', priority: 'high' },
        { done: true, due: '2026-06-01', text: 'done' },
        { done: false, due: null, text: 'no-date' },
      ];
      const got = todayAndOverdue(tasks, '2026-06-25').map((t) => t.text);
      return ok(got.join(',') === 'overdue-high,overdue-low,today-highest', got.join(','));
    } },
    { name: 'formatTaskLine builds a valid checkbox with due/priority/tags', run: () => {
      const line = formatTaskLine('call the CO', { due: '2026-07-01', priority: 'high', tags: ['gov-contracting', '#calls'] });
      return ok(line === '- [ ] call the CO ⏫ 📅 2026-07-01 #gov-contracting #calls', line);
    } },
    { name: 'formatTaskLine ignores a malformed due date', run: () => {
      return ok(formatTaskLine('do thing', { due: 'next tuesday' }) === '- [ ] do thing');
    } },
    { name: 'formatTaskLine round-trips through parseTaskLine', run: () => {
      const line = formatTaskLine('ship it', { due: '2026-06-30', priority: 'medium', tags: ['gov'] });
      const t = parseTaskLine(line);
      return ok(t && t.text === 'ship it' && t.due === '2026-06-30' && t.priority === 'medium' && t.tags.join() === 'gov');
    } },
    { name: 'completeLine flips [ ]→[x] and stamps a done-date', run: () => {
      return ok(completeLine('- [ ] thing 📅 2026-07-02', '2026-06-25') === '- [x] thing 📅 2026-07-02 ✅ 2026-06-25');
    } },
    { name: 'completeLine never double-stamps ✅ and is a no-op on a non-open line', run: () => {
      return ok(completeLine('- [ ] thing ✅ 2026-06-19', '2026-06-25') === '- [x] thing ✅ 2026-06-19'
        && completeLine('- [x] already done', '2026-06-25') === '- [x] already done'
        && completeLine('not a task', '2026-06-25') === 'not a task');
    } },
    { name: 'extractTasks skips ```tasks``` query blocks', run: () => {
      const lines = ['# ✅ Tasks', '```tasks', 'not done', 'due before tomorrow', '```', '- [ ] real task 📅 2026-07-01', 'prose'];
      const got = extractTasks(lines, 'Tasks.md');
      return ok(got.length === 1 && got[0].text === 'real task' && got[0].file === 'Tasks.md', JSON.stringify(got.map((g) => g.text)));
    } },
  ],
};
