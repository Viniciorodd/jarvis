// Regression suite for the DEEPER draft-retrieval fix (pods/pending-intent.mjs + the router's retrieval
// branch). The trust bug: "pull me the 2 sub outreach" got re-classified into a NEW task and routed to Hector
// while 20 real drafts sat in the store — the system contradicted its own digest. The guarantees pinned here:
//   1) describePending affirms the items ALREADY EXIST and lists them (never denies / never invents);
//   2) routeCommand on a RETRIEVAL reads the store and returns outcome.type==='retrieval' — it does NOT append
//      an approval.request or an action (i.e. it creates NO new task);
//   3) a real CREATE ("draft a proposal") still routes normally.

import { wantsPending, describePending } from '../pods/pending-intent.mjs';
import { routeCommand } from '../pods/chief-of-staff/router.mjs';

const ok = (pass, detail = '') => ({ pass, detail });

// A minimal fake control-plane store: records appended events, returns fixture pending approvals.
function fakeStore(pending = []) {
  const events = [];
  return {
    appendEvent: (e) => { const rec = { id: 'e' + (events.length + 1), ...e }; events.push(rec); return rec; },
    pendingApprovals: () => pending,
    _events: events,
  };
}
const GATE = { id: 'g1', kind: 'approval.request', pod: 'gov', action: 'send', ts: '2026-07-18T08:00:00Z', rationale: 'Send janitorial outreach for Mount Dora', payload: { trade: 'janitorial', file: 'gov-drafts/outreach-x.md' } };

export default {
  agent: 'pending-intent',
  cases: [
    { name: 'describePending: empty → honest "nothing waiting"',
      run: () => ok(/nothing is waiting/i.test(describePending([]))) },
    { name: 'describePending: affirms items ALREADY EXIST + lists them',
      run: () => { const r = describePending([GATE]); return ok(/already exist/i.test(r) && /mount dora/i.test(r) && /janitorial/i.test(r), r.slice(0, 80)); } },

    { name: 'ROUTER: a retrieval READS the store — no new task created',
      run: async () => {
        const s = fakeStore([GATE]);
        const r = await routeCommand({ text: 'pull me the 2 sub outreach from hector so i can read it', store: s, anthropicKey: null });
        const madeTask = s._events.some((e) => e.kind === 'approval.request' || e.kind === 'action');
        return ok(r.outcome.type === 'retrieval' && r.outcome.count === 1 && !madeTask && /mount dora/i.test(r.reply),
          `outcome=${r.outcome.type} madeTask=${madeTask}`);
      } },
    { name: 'ROUTER: "show my pending" retrieves even with an empty store (honest, no task)',
      run: async () => {
        const s = fakeStore([]);
        const r = await routeCommand({ text: 'show my pending', store: s, anthropicKey: null });
        const madeTask = s._events.some((e) => e.kind === 'approval.request' || e.kind === 'action');
        return ok(r.outcome.type === 'retrieval' && !madeTask && /nothing is waiting/i.test(r.reply), `outcome=${r.outcome.type} madeTask=${madeTask}`);
      } },
    { name: 'ROUTER: a real CREATE still routes (does NOT hijack as retrieval)',
      run: async () => {
        const s = fakeStore([]);
        const r = await routeCommand({ text: 'draft a fresh proposal for the USACE janitorial bid', store: s, anthropicKey: null });
        return ok(r.outcome.type !== 'retrieval', `outcome=${r.outcome.type}`);
      } },
  ],
};
