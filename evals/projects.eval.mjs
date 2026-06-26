// Regression suite for the per-business activity log (control-plane/projects.mjs). Pins the
// format ⇄ parse round-trip so the report stays readable in Obsidian AND parseable by Jarvis.

import { formatLogLine, parseLogLine } from '../control-plane/projects.mjs';

const ok = (pass, detail = '') => ({ pass, detail });

export default {
  agent: 'projects',
  cases: [
    { name: 'done → checked task with a ✅ date, round-trips', run: () => {
      const line = formatLogLine('done', 'Shipped the gov board', '2026-06-26');
      const e = parseLogLine(line);
      return ok(line === '- [x] Shipped the gov board ✅ 2026-06-26' && e.type === 'done' && e.done === true && e.text === 'Shipped the gov board' && e.date === '2026-06-26', line);
    } },
    { name: 'todo → open checkbox (Obsidian Tasks compatible)', run: () => {
      const line = formatLogLine('todo', 'Publish the Fiverr gigs', '2026-06-26');
      const e = parseLogLine(line);
      return ok(line === '- [ ] Publish the Fiverr gigs' && e.type === 'todo' && e.done === false && e.text === 'Publish the Fiverr gigs', line);
    } },
    { name: 'idea → 💡 bullet with date, round-trips', run: () => {
      const e = parseLogLine(formatLogLine('idea', 'Bundle janitorial + grounds', '2026-06-26'));
      return ok(e.type === 'idea' && e.text === 'Bundle janitorial + grounds' && e.date === '2026-06-26', JSON.stringify(e));
    } },
    { name: 'blocker → ⛔ bullet, parsed as blocker', run: () => {
      const e = parseLogLine(formatLogLine('blocker', 'Waiting on the CO reply', '2026-06-26'));
      return ok(e.type === 'blocker' && /Waiting on the CO/.test(e.text), JSON.stringify(e));
    } },
    { name: 'non-log lines parse to null', run: () => {
      return ok(parseLogLine('## Recent') === null && parseLogLine('plain prose') === null && parseLogLine('') === null);
    } },
  ],
};
