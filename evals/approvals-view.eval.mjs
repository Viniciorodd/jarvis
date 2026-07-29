// Regression suite for the approval-queue view (pods/approvals-view.mjs). This is the list the operator reads
// first thing every morning, so the bar is: every row must NAME something, and the same ask must never be
// listed twice. Both were violated live on 2026-07-29 — 25 rows, 12 of them titled "your approval", 11 of
// those the identical morning-brief step.

import { approvalSubject, approvalKey, collapseApprovals } from '../pods/approvals-view.mjs';

const ok = (pass, detail = '') => ({ pass, detail });
const BOILER = 'Treated as irreversible — gated for your approval (doctrine §9 rule 2).';
const cos = (over = {}) => ({ id: 'x', pod: 'chief-of-staff', action: 'submit', rationale: BOILER, payload: { assignee: { nickname: 'Elle' }, summary: 'Read the Gov Pipeline Board before reporting status.', source: 'scheduler:morning-brief' }, ...over });

export default {
  agent: 'approvals-view',
  cases: [
    { name: 'THE BUG: doctrine boilerplate never becomes the title ("your approval" ×12)', run: () => {
      const t = approvalSubject({ pod: 'chief-of-staff', action: 'submit', rationale: BOILER, payload: {} });
      return ok(!/your approval/i.test(t) && t.length > 0, t);
    } },

    { name: 'a gated step is labelled by WHO + what it wants to do when it has nothing else', run: () => {
      const t = approvalSubject({ actor: 'MAILROOM-01', action: 'submit', rationale: BOILER, payload: { assignee: { nickname: 'Elle' } } });
      return ok(/Elle/.test(t) && /submit/.test(t), t);
    } },

    { name: 'payload.summary is preferred over mining the rationale', run: () =>
      ok(/Gov Pipeline Board/.test(approvalSubject(cos())), approvalSubject(cos())) },

    { name: 'an explicit payload.title always wins', run: () =>
      ok(approvalSubject({ rationale: BOILER, payload: { title: 'B100 Deep Clean' } }) === 'B100 Deep Clean') },

    { name: 'a REAL rationale still yields its real subject (no regression)', run: () => {
      const t = approvalSubject({ action: 'send', rationale: 'Send teaming intro to IronClad Janitorial (sub).' });
      return ok(/IronClad/.test(t), t);
    } },

    { name: 'the live case: 12 identical morning-brief gates collapse to ONE row', run: () => {
      const rows = collapseApprovals(Array.from({ length: 12 }, (_, i) => cos({ id: 'id' + i })));
      return ok(rows.length === 1 && rows[0].count === 12 && rows[0].ids.length === 12, JSON.stringify(rows.map((r) => ({ n: r.count, t: r.title }))));
    } },

    { name: 'collapsing NEVER loses an id — acting on the row can still resolve every one', run: () => {
      const rows = collapseApprovals([cos({ id: 'a' }), cos({ id: 'b' }), cos({ id: 'c' })]);
      return ok(rows[0].ids.join(',') === 'a,b,c', JSON.stringify(rows[0].ids));
    } },

    { name: 'genuinely DIFFERENT approvals are never merged away', run: () => {
      const rows = collapseApprovals([
        { id: '1', pod: 'gov', action: 'submit', payload: { title: 'B100 Deep Clean' } },
        { id: '2', pod: 'gov', action: 'submit', payload: { title: 'Marienville Ranger District' } },
        { id: '3', pod: 'gov', action: 'send', payload: { title: 'B100 Deep Clean' } },
      ]);
      return ok(rows.length === 3, JSON.stringify(rows.map((r) => r.title + '/' + r.action)));
    } },

    { name: 'order is stable (the queue must not reshuffle under him between polls)', run: () => {
      const src = [{ id: '1', payload: { title: 'Alpha' } }, { id: '2', payload: { title: 'Beta' } }, { id: '3', payload: { title: 'Alpha' } }];
      return ok(collapseApprovals(src).map((r) => r.title).join(',') === 'Alpha,Beta', JSON.stringify(collapseApprovals(src).map((r) => r.title)));
    } },

    { name: 'no row is ever left unnamed, even from a totally empty record', run: () => {
      const t = approvalSubject({});
      return ok(typeof t === 'string' && t.trim().length > 0, JSON.stringify(t));
    } },

    { name: 'empty / garbage input does not throw', run: () =>
      ok(collapseApprovals().length === 0 && collapseApprovals(null).length === 0 && typeof approvalKey({}) === 'string') },
  ],
};
