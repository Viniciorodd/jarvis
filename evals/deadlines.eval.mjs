// Regression suite for the gov deadline radar (pure dueReminders). Pins the "remind before a bid closes,
// once" logic so it can't silently regress. Run via `node evals/run.mjs`.

import { dueReminders } from '../pods/gov/deadlines.mjs';

const NOW = new Date('2026-06-20T12:00:00Z');
const score = (noticeId, recommendation, deadline, extra = {}) => ({
  action: 'bid.score', payload: { noticeId, recommendation, deadline, title: noticeId + ' work', ...extra },
});
const reminded = (noticeId, deadline, stage = 'soon') => ({ action: 'deadline.reminded', payload: { noticeId, deadline, stage } });
const ids = (rows) => rows.map((r) => r.noticeId);

export default {
  agent: 'Gov Deadline Radar',
  cases: [
    { name: 'bid closing in 2 days is reminded', run: () => {
      const r = dueReminders([score('A', 'bid', '2026-06-22T17:00:00Z')], NOW);
      return { pass: ids(r).join() === 'A', detail: ids(r).join() };
    } },
    { name: 'bid closing in 15 days is NOT reminded', run: () => {
      const r = dueReminders([score('B', 'bid', '2026-07-05T17:00:00Z')], NOW);
      return { pass: r.length === 0, detail: `${r.length}` };
    } },
    { name: 'already-closed bid is NOT reminded', run: () => {
      const r = dueReminders([score('C', 'bid', '2026-06-18T17:00:00Z')], NOW);
      return { pass: r.length === 0, detail: `${r.length}` };
    } },
    { name: 'no-bid closing soon is NOT reminded', run: () => {
      const r = dueReminders([score('D', 'no-bid', '2026-06-21T17:00:00Z')], NOW);
      return { pass: r.length === 0, detail: `${r.length}` };
    } },
    { name: 'simulated (SIM-) notice is skipped', run: () => {
      const r = dueReminders([score('SIM-1', 'bid', '2026-06-21T17:00:00Z')], NOW);
      return { pass: r.length === 0, detail: `${r.length}` };
    } },
    { name: 'bid→no-bid flip drops out (latest score wins)', run: () => {
      const r = dueReminders([score('G', 'bid', '2026-06-22T17:00:00Z'), score('G', 'no-bid', '2026-06-22T17:00:00Z')], NOW);
      return { pass: r.length === 0, detail: ids(r).join() };
    } },
    { name: 'does not re-send the SAME stage twice', run: () => {
      const r = dueReminders([score('F', 'bid', '2026-06-21T12:00:00Z'), reminded('F', '2026-06-21T12:00:00Z', 'final')], NOW);
      return { pass: r.length === 0, detail: ids(r).join() };
    } },
    { name: 'still sends FINAL notice even after the SOON ping went out', run: () => {
      const r = dueReminders([score('K', 'bid', '2026-06-21T12:00:00Z'), reminded('K', '2026-06-21T12:00:00Z', 'soon')], NOW);
      return { pass: r.length === 1 && r[0].stage === 'final', detail: `${ids(r).join()}/${r[0] && r[0].stage}` };
    } },
    { name: '5-day-out bid is staged "soon" (not final)', run: () => {
      const r = dueReminders([score('M', 'bid', '2026-06-25T12:00:00Z')], NOW);
      return { pass: r.length === 1 && r[0].stage === 'soon', detail: r[0] && r[0].stage };
    } },
    { name: 'sorts soonest-first', run: () => {
      const r = dueReminders([score('A', 'bid', '2026-06-22T17:00:00Z'), score('H', 'bid', '2026-06-20T20:00:00Z')], NOW);
      return { pass: ids(r).join() === 'H,A', detail: ids(r).join() };
    } },
  ],
};
