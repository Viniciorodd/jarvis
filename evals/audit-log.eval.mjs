// Regression suite for the Failure & Audit Ledger (pods/audit-log.mjs). Pins the event→failure mapping
// (which failures get logged + which fix hint they carry), the fold-by-id / resolve lifecycle, the
// open-queue ordering, the by-source summary, and the ref+kind dedup on sync. All IO uses a temp dir so
// the real ledger is never touched.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  classifyFailure, recordFailure, readFailures, resolveFailure,
  openFailures, summarize, syncFromEvents,
} from '../pods/audit-log.mjs';

const ok = (pass, detail = '') => ({ pass, detail });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'audit-eval-'));

export default {
  agent: 'audit-log',
  cases: [
    { name: 'classifyFailure: email.failed w/ RODGATE_GMAIL_USER → send-failed + creds fix hint', run: () => {
      const r = classifyFailure({ id: 'e1', kind: 'action', action: 'email.failed', status: 'error',
        rationale: 'Send not done: RODGATE_GMAIL_USER not set', payload: { to: 'co@usace.army.mil', sent: false } });
      return ok(r && r.source === 'gov-send' && r.kind === 'send-failed' && r.severity === 'error'
        && /RODGATE_GMAIL_USER \+ RODGATE_GMAIL_APP_PASSWORD/.test(r.fixHint) && r.ref === 'e1' && r.subject === 'co@usace.army.mil',
        JSON.stringify(r));
    } },

    { name: 'classifyFailure: compliance.check FAIL → compliance-fail + no-fabrication fix hint', run: () => {
      const r = classifyFailure({ id: 'c1', kind: 'action', action: 'compliance.check', status: 'error',
        rationale: 'Compliance FAIL: missing past performance section', payload: { noticeId: 'N-9', verdict: 'FAIL' } });
      return ok(r && r.source === 'compliance' && r.kind === 'compliance-fail' && r.severity === 'error'
        && /NO-BID or teaming decision — YOURS to make, never auto-written/.test(r.fixHint) && r.subject === 'N-9',
        JSON.stringify(r));
    } },

    { name: 'classifyFailure: facts.violation → facts-violation + SELF-certified-only fix hint', run: () => {
      const r = classifyFailure({ id: 'f1', kind: 'action', action: 'facts.violation', status: 'error',
        rationale: 'Claimed 8(a) — false', payload: { noticeId: 'N-3' } });
      return ok(r && r.source === 'facts' && r.kind === 'facts-violation' && r.severity === 'error'
        && /SELF-certified SDB \/ Minority \/ Hispanic-owned SMALL business ONLY/.test(r.fixHint)
        && /NEVER claim 8\(a\), HUBZone, SDVOSB, or WOSB/.test(r.fixHint), JSON.stringify(r));
    } },

    { name: 'classifyFailure: a non-failure event (scan/done) → null', run: () =>
      ok(classifyFailure({ id: 's1', kind: 'action', action: 'scan', status: 'done' }) === null
        && classifyFailure({ action: 'compliance.check', payload: { verdict: 'PASS' } }) === null
        && classifyFailure({ action: 'email.sent', payload: { to: 'a@b.com' } }) === null) },

    { name: 'recordFailure/readFailures fold-by-id latest-wins + resolveFailure flips status', run: () => {
      const dir = tmp();
      const rec = classifyFailure({ id: 'e2', action: 'email.failed', status: 'error', rationale: 'Send not done: timeout', payload: { to: 'x@y.com' } });
      const put = recordFailure(rec, { dir });
      const id = put.failure.id;
      let all = readFailures({ dir });
      const beforeOpen = all.length === 1 && all[0].status === 'open';
      resolveFailure(id, 'retried, it sent', { dir });
      all = readFailures({ dir });
      // two lines on disk, but folded to ONE record, now resolved
      const lines = fs.readFileSync(path.join(dir, 'failures.jsonl'), 'utf8').trim().split('\n').length;
      return ok(beforeOpen && all.length === 1 && all[0].status === 'resolved'
        && all[0].resolvedNote === 'retried, it sent' && lines === 2, JSON.stringify({ beforeOpen, all, lines }));
    } },

    { name: 'openFailures excludes resolved + returns newest-first', run: () => {
      const dir = tmp();
      recordFailure({ kind: 'send-failed', source: 'gov-send', severity: 'error', subject: 'old', ts: '2026-07-01T00:00:00Z', ref: 'r1' }, { dir });
      const mid = recordFailure({ kind: 'send-failed', source: 'gov-send', severity: 'error', subject: 'mid', ts: '2026-07-05T00:00:00Z', ref: 'r2' }, { dir });
      recordFailure({ kind: 'compliance-fail', source: 'compliance', severity: 'error', subject: 'new', ts: '2026-07-09T00:00:00Z', ref: 'r3' }, { dir });
      resolveFailure(mid.failure.id, 'fixed', { dir });
      const open = openFailures(readFailures({ dir }));
      return ok(open.length === 2 && open[0].subject === 'new' && open[1].subject === 'old', JSON.stringify(open.map((f) => f.subject)));
    } },

    { name: 'summarize: openCount + bySource counts (resolved excluded)', run: () => {
      const dir = tmp();
      recordFailure({ kind: 'send-failed', source: 'gov-send', severity: 'error', subject: 'a', ref: 'a1' }, { dir });
      recordFailure({ kind: 'send-failed', source: 'gov-send', severity: 'error', subject: 'b', ref: 'a2' }, { dir });
      const c = recordFailure({ kind: 'compliance-fail', source: 'compliance', severity: 'error', subject: 'c', ref: 'a3' }, { dir });
      resolveFailure(c.failure.id, 'done', { dir });
      const s = summarize(readFailures({ dir }));
      return ok(s.openCount === 2 && s.bySource['gov-send'] === 2 && !s.bySource['compliance']
        && s.recent.length === 2 && s.recent[0].fixHint !== undefined, JSON.stringify(s));
    } },

    { name: 'syncFromEvents dedups by ref+kind (same failure event twice → one record)', run: () => {
      const dir = tmp();
      const ev = { id: 'dup1', kind: 'action', action: 'email.failed', status: 'error', rationale: 'Send not done: SMTP 535', payload: { to: 'q@r.com', sent: false } };
      const noise = { id: 'n1', kind: 'action', action: 'scan', status: 'done' };
      const first = syncFromEvents({ dir, events: [ev, noise, ev] }); // same event twice in one batch
      const second = syncFromEvents({ dir, events: [ev] });           // and again on a later sync
      const all = readFailures({ dir });
      return ok(first.added === 1 && second.added === 0 && all.length === 1
        && all[0].kind === 'send-failed' && /App Password/.test(all[0].fixHint), JSON.stringify({ first, second, all }));
    } },
  ],
};
