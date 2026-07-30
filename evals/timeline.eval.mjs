// Regression suite for the unified timeline (pods/timeline.mjs). This is the audit trail — "what did Jarvis
// do, and why" — so the bar is: never invent a timestamp, never lose a row to a format quirk, and never
// return a confident answer for a period we have no record of.

import { fromEvent, fromChatLog, mergeTimeline, searchTimeline, renderTimeline, recentDays } from '../pods/timeline.mjs';

const ok = (pass, detail = '') => ({ pass, detail });

const CHAT = `
### 08:39:35
**You:** create a note called Gateway Test in my vault

**Jarvis:** Your note has been created.

_actions (from real tool results):_
  - ✅ created a vault note

### 09:02:11
**You:** what did we decide about Brick Ave

**Jarvis:** 81% Ramona / 19% Vinicio, ~Oct 2024.
`;

export default {
  agent: 'timeline',
  cases: [
    { name: 'a control-plane event becomes a row with its real rationale', run: () => {
      const r = fromEvent({ ts: '2026-07-28T12:05:51Z', kind: 'action', actor: 'CONNECT-01', pod: 'gov', action: 'outreach.auto_sent', rationale: 'Auto-sent sub-quote to Sub 5', cost_usd: 0.0012 });
      return ok(r.kind === 'agent' && r.who === 'CONNECT-01' && /Auto-sent/.test(r.what) && r.cost === 0.0012, JSON.stringify(r));
    } },

    { name: 'an approval request is tagged as an approval, an error as an error', run: () =>
      ok(fromEvent({ ts: 't', kind: 'approval.request' }).kind === 'approval'
        && fromEvent({ ts: 't', kind: 'action', status: 'error' }).kind === 'error') },

    { name: 'the chat log parses BOTH sides of every turn', run: () => {
      const rows = fromChatLog(CHAT, '2026-07-29');
      return ok(rows.length === 4 && rows.filter((r) => r.who === 'you').length === 2, JSON.stringify(rows.map((r) => r.who + ':' + r.what.slice(0, 24))));
    } },

    { name: 'chat rows carry a real timestamp built from the file date + turn time', run: () => {
      const rows = fromChatLog(CHAT, '2026-07-29');
      return ok(rows[0].ts === '2026-07-29T08:39:35', rows[0].ts);
    } },

    { name: 'the VERIFIED actions ride along with Jarvis\'s turn', run: () => {
      const j = fromChatLog(CHAT, '2026-07-29').find((r) => r.who === 'jarvis');
      return ok(!!j.actions && /created a vault note/.test(j.actions.join(' ')), JSON.stringify(j.actions));
    } },

    { name: 'merge puts newest first across BOTH sources', run: () => {
      const m = mergeTimeline(fromChatLog(CHAT, '2026-07-29'), [fromEvent({ ts: '2026-07-30T00:00:00Z', rationale: 'later thing' })]);
      return ok(m[0].what === 'later thing', m[0].what);
    } },

    { name: 'a row with NO timestamp is dropped, never given a fake one', run: () => {
      const m = mergeTimeline([{ ts: '', what: 'undated' }, { ts: '2026-07-29T01:00:00Z', what: 'real' }]);
      return ok(m.length === 1 && m[0].what === 'real', JSON.stringify(m));
    } },

    { name: 'search requires EVERY term (precision over recall)', run: () => {
      const rows = fromChatLog(CHAT, '2026-07-29');
      return ok(searchTimeline(rows, { q: 'brick ave' }).length === 1 && searchTimeline(rows, { q: 'brick zzz' }).length === 0);
    } },

    { name: 'filter by kind and by date', run: () => {
      const rows = mergeTimeline(fromChatLog(CHAT, '2026-07-29'), [fromEvent({ ts: '2026-07-20T00:00:00Z', rationale: 'old agent run' })]);
      return ok(searchTimeline(rows, { kind: 'agent' }).length === 1 && searchTimeline(rows, { since: '2026-07-29' }).length === 4);
    } },

    { name: 'NOTHING recorded says so plainly — never a confident empty answer', run: () =>
      ok(/Nothing recorded/.test(renderTimeline([])), renderTimeline([])) },

    { name: 'rendered lines are quotable: time, who, and what', run: () => {
      const line = renderTimeline(fromChatLog(CHAT, '2026-07-29')).split('\n')[0];
      return ok(/2026-07-29 08:39:35/.test(line) && /\[YOU\]/.test(line), line);
    } },

    { name: 'recentDays walks backwards from today, newest first', run: () => {
      const d = recentDays(3, new Date('2026-07-29T12:00:00'));
      return ok(d.length === 3 && d[0] === '2026-07-29' && d[2] === '2026-07-27', JSON.stringify(d));
    } },

    { name: 'empty / garbage input does not throw', run: () =>
      ok(mergeTimeline().length === 0 && fromChatLog('', '').length === 0 && searchTimeline(null).length === 0 && fromEvent().kind === 'agent') },
  ],
};
