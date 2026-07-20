// Regression suite for the pre-approval draft check (pods/gov/draft-check.mjs). The bug: a malformed outreach
// draft (no To:/Subject:) reached the operator's approval gate, so an approval was spent on something that
// could never send. The guarantees pinned here: checkGateDraft calls a send gate UNSENDABLE exactly when the
// executor's own parser would (no drift), leaves non-send gates alone, and pruneUnsendableGates auto-passes the
// unsendable ones (+ re-queues a fix task) while never touching a valid one.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isSendGateWithFile, checkGateDraft, pruneUnsendableGates } from '../pods/gov/draft-check.mjs';

const ok = (pass, detail = '') => ({ pass, detail });
const VALID = 'To: a@b.com\nSubject: Teaming\n------------------------------------------------\nHi — quote please.\n';
const NOHDR = '<!-- sub outreach -->\nSend janitorial outreach (SOW + ask for past performance + quote) for Mount Dora.\n';
const gate = (over = {}) => ({ id: 'g1', pod: 'gov', action: 'send', payload: { file: 'gov-drafts/x.md', trade: 'janitorial', noticeId: 'n1' }, ...over });

// A fake control-plane store over a temp gov-drafts dir.
function fakeStore(files, pending) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'draftchk-'));
  fs.mkdirSync(path.join(dir, 'gov-drafts'), { recursive: true });
  for (const [rel, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, rel), content);
  const events = [];
  const resolved = () => new Set(events.filter((e) => e.kind === 'approval.decision').map((e) => e.ref));
  return { dir, _events: events, appendEvent: (e) => { events.push(e); return e; }, pendingApprovals: () => pending.filter((g) => !resolved().has(g.id)) };
}

export default {
  agent: 'gov-draft-check',
  cases: [
    { name: 'isSendGateWithFile: true for a gov send gate w/ a file; false for submit / no-file',
      run: () => ok(isSendGateWithFile(gate()) && !isSendGateWithFile(gate({ action: 'submit' })) && !isSendGateWithFile(gate({ payload: {} }))) },
    { name: 'checkGateDraft: a proper To:/Subject:/body draft is SENDABLE',
      run: () => { const c = checkGateDraft(gate(), VALID); return ok(c.relevant && c.sendable && !c.reason); } },
    { name: 'checkGateDraft: a header-less description draft is UNSENDABLE (the bug)',
      run: () => { const c = checkGateDraft(gate(), NOHDR); return ok(c.relevant && !c.sendable && /To:|Subject/i.test(c.reason), c.reason); } },
    { name: 'checkGateDraft: a missing file is UNSENDABLE, not assumed-fine',
      run: () => { const c = checkGateDraft(gate(), null); return ok(c.relevant && !c.sendable && /missing|unreadable/i.test(c.reason)); } },
    { name: 'checkGateDraft: a non-send gate is left alone (relevant:false)',
      run: () => ok(checkGateDraft(gate({ action: 'submit' }), NOHDR).relevant === false) },

    { name: 'prune: auto-passes the unsendable gate + re-queues a fix task; leaves the valid one',
      run: async () => {
        const s = fakeStore({ 'gov-drafts/bad.md': NOHDR, 'gov-drafts/good.md': VALID },
          [gate({ id: 'bad', payload: { file: 'gov-drafts/bad.md', trade: 'janitorial', noticeId: 'n1' } }),
           gate({ id: 'good', payload: { file: 'gov-drafts/good.md', trade: 'janitorial', noticeId: 'n2' } })]);
        const r = await pruneUnsendableGates({ store: s, dir: s.dir });
        const passed = s._events.some((e) => e.kind === 'approval.decision' && e.ref === 'bad' && e.action === 'pass');
        const goodUntouched = !s._events.some((e) => e.kind === 'approval.decision' && e.ref === 'good');
        const fixTask = s._events.some((e) => e.action === 'draft.incomplete');
        return ok(r.pruned === 1 && passed && goodUntouched && fixTask, `pruned=${r.pruned} passed=${passed} goodUntouched=${goodUntouched} fixTask=${fixTask}`);
      } },
    { name: 'prune: no unsendable gates → nothing changes',
      run: async () => {
        const s = fakeStore({ 'gov-drafts/good.md': VALID }, [gate({ id: 'good', payload: { file: 'gov-drafts/good.md' } })]);
        const r = await pruneUnsendableGates({ store: s, dir: s.dir });
        return ok(r.pruned === 0 && s._events.length === 0, `pruned=${r.pruned} events=${s._events.length}`);
      } },
  ],
};
