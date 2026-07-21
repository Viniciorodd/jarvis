// Regression suite for agent heartbeats (control-plane/heartbeats.mjs).
// The point: a scheduled agent that RESTS (no work) must still show a heartbeat — no silent clicks.

import { agentHeartbeats, heartbeatSummary } from '../control-plane/heartbeats.mjs';

const ok = (pass, detail = '') => ({ pass, detail });
const now = new Date('2026-07-20T12:00:00Z');
const events = [
  { actor: 'SAM-SCOUT', pod: 'gov', kind: 'trace', action: 'rest', status: 'done', rationale: 'idle — no new work', ts: '2026-07-20T11:30:00Z' },
  { actor: 'SAM-SCOUT', pod: 'gov', kind: 'action', action: 'scan', status: 'done', ts: '2026-07-20T08:00:00Z' }, // older; the rest is newer
  { actor: 'MAILROOM-01', pod: 'chief-of-staff', kind: 'action', action: 'brief', status: 'done', ts: '2026-07-20T07:00:00Z' },
  { actor: 'EXEC-01', pod: 'exec', kind: 'trace', action: 'rest', status: 'done', ts: '2026-07-18T18:00:00Z' }, // stale (>24h)
  { kind: 'trace', action: 'system', ts: '2026-07-20T11:59:00Z' }, // no actor → ignored
];

export default {
  agent: 'agent-heartbeats',
  cases: [
    { name: 'one heartbeat per actor (actor-less events ignored)',
      run: () => { const h = agentHeartbeats(events, now); return ok(h.length === 3 && h.every((x) => x.actor), h.map((x) => x.actor).join(',')); } },
    { name: 'a RESTED run still counts as a heartbeat (no silent clicks)',
      run: () => { const s = agentHeartbeats(events, now).find((x) => x.actor === 'SAM-SCOUT'); return ok(s && s.rested === true && s.action === 'rest', JSON.stringify(s)); } },
    { name: 'keeps the NEWEST event per actor (11:30 rest beats 08:00 scan)',
      run: () => { const s = agentHeartbeats(events, now).find((x) => x.actor === 'SAM-SCOUT'); return ok(s.lastRun === '2026-07-20T11:30:00Z' && s.minsAgo === 30, JSON.stringify(s)); } },
    { name: 'sorted freshest-first',
      run: () => { const h = agentHeartbeats(events, now); return ok(h[0].actor === 'SAM-SCOUT' && h[h.length - 1].actor === 'EXEC-01', h.map((x) => x.actor).join(',')); } },
    { name: 'summary: 2 of 3 active in 24h, 1 stale',
      run: () => { const s = heartbeatSummary(agentHeartbeats(events, now), 24); return ok(s.total === 3 && s.activeCount === 2 && s.staleCount === 1, JSON.stringify(s)); } },
  ],
};
