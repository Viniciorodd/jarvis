// Rollup regression suite for pods/narrate.mjs rollupNarrations — the anti-spam fix. The operator,
// verbatim: "instead of spamming me with scope-of-work pull, scope-of-work pull... just brief: X pulled
// Y amount of Z." One poll cycle's events must collapse into ONE message: same actor + same action
// family → one grouped line with a count + up to 3 titles (+K more); singletons keep their normal
// narration; 2+ lines get the "🤖 Team update — N actions" header; a single event stays the classic
// signed line with NO header. And CRITICALLY: the truth contract (evals/narrate-truth.eval.mjs)
// survives the rollup — a drafted outreach in a batch can never come out as "Reached out".

import { rollupNarrations, familyFor, titleList, narrationLine } from '../pods/narrate.mjs';

const ok = (pass, detail = '') => ({ pass, detail });
const LIES = /reached out|✉️ Sent an email/i;

// Real event shapes, straight from the emitters:
// pods/gov/worker.mjs sow.pull — NO payload.title; the title lives in the rationale.
const sowPull = (title) => ({
  id: 'ev-' + title, kind: 'action', actor: 'SAM-SCOUT', pod: 'gov', action: 'sow.pull', status: 'done',
  reversible: true, rationale: `SOW pulled for ${title} (2 attachment(s))`,
  payload: { noticeId: 'N-' + title, file: 'gov-drafts/sow-x.md', attachments: 2 },
});
const scanDone = (count) => ({
  kind: 'action', actor: 'SAM-SCOUT', pod: 'gov', action: 'scan.done', status: 'done',
  rationale: `${count} opportunities from SAM.gov`, payload: { count, feed: 'SAM.gov' },
});
// pods/gov/connector.mjs — the historical "Hector lied" shape: a DRAFT on disk, nothing sent.
const outreachDraft = (title) => ({
  kind: 'action', actor: 'CONNECT-01', pod: 'gov', action: 'sub.outreach.draft', reversible: true,
  rationale: 'plumbing outreach drafted (asks for past performance + quote)',
  payload: { noticeId: 'N1', trade: 'plumbing', file: 'gov-drafts/outreach-n1.md', ...(title ? { title } : {}) },
});
const evidencedSend = { kind: 'action', actor: 'GOV-SEND', pod: 'gov', action: 'email.sent',
  payload: { to: 'co@usace.army.mil', sent: true, messageId: '<x1@rodgate>', accepted: ['co@usace.army.mil'] } };

export default {
  agent: 'narrate-rollup',
  cases: [
    { name: '4 same-actor sow.pull events → ONE line: count 4, 3 titles listed, "+1 more", no header', run: () => {
      const text = rollupNarrations([sowPull('Alpha'), sowPull('Bravo'), sowPull('Charlie'), sowPull('Delta')]);
      return ok(!!text && !/\n/.test(text) && !/Team update/.test(text)
        && /Pulled the scope of work for 4 opportunities/.test(text)
        && /Alpha, Bravo, Charlie \+1 more/.test(text)
        && /^Gideon \(Gov Scout\): /.test(text), text || 'null');
    } },
    { name: 'mixed actions → grouped + singleton lines under the "🤖 Team update — N actions" header', run: () => {
      const text = rollupNarrations([scanDone(8), sowPull('Alpha'), sowPull('Bravo'), outreachDraft('Ft. Dix plumbing')]);
      return ok(!!text && /^🤖 Team update — 4 actions\n/.test(text)
        && /Pulled the scope of work for 2 opportunities — Alpha, Bravo/.test(text)
        && /Scanned SAM — 8 opportunities/.test(text)          // singleton keeps its normal narration
        && /Hector \(Procurement Lead\)/.test(text)
        && (text.match(/^• /gm) || []).length === 3, text || 'null');
    } },
    { name: 'single event → the plain classic narration + signature, no header, no bullet', run: () => {
      const ev = scanDone(12);
      const text = rollupNarrations([ev]);
      return ok(text === narrationLine(ev) && /\n— Gideon \(Gov Scout\)$/.test(text || '') && !/Team update|^•/m.test(text || ''), text || 'null');
    } },
    { name: 'TRUTH survives the rollup: drafted outreach in a batch (even grouped ×2) still says nothing-sent, never "Reached out"; an evidenced send may still say Sent', run: () => {
      const text = rollupNarrations([outreachDraft(''), outreachDraft(''), evidencedSend, sowPull('Alpha')]);
      const draftLine = (text || '').split('\n').find((l) => /outreach/i.test(l)) || '';
      return ok(!!text && /nothing sent/.test(draftLine) && !/Reached out/i.test(draftLine) && /×2/.test(draftLine)
        && /Sent an email → co@usace/.test(text), text || 'null');
    } },
    { name: 'empty / all-non-narratable input → null (no phantom pings)', run: () => {
      const a = rollupNarrations([]);
      const b = rollupNarrations(undefined);
      const c = rollupNarrations([{ kind: 'trace', action: 'bid.score' }, { kind: 'action', action: 'scan.start' }]);
      return ok(a === null && b === null && c === null, JSON.stringify([a, b, c]));
    } },
    { name: 'grouping helpers: gates group by TRUTH CLASS (familyFor="gate") and collapse with the gate language; titleList caps at 3 + honest remainder', run: () => {
      const gate = (t) => ({ kind: 'approval.request', actor: 'GOV-ANALYST', pod: 'gov', action: 'submit', status: 'pending', payload: { noticeId: t, title: t } });
      const fam = familyFor(gate('A')) === 'gate'
        && familyFor({ kind: 'action', action: 'email.send', payload: { dryRun: true } }) === 'dryrun'
        && familyFor({ kind: 'action', action: 'SOW.Pull' }) === 'sow.pull';
      const list = titleList([gate('A'), gate('B'), gate('C'), gate('D'), gate('E')]);
      const text = rollupNarrations([gate('A'), gate('B')]);
      return ok(fam && list === 'A, B, C +2 more'
        && !!text && /Drafted 2 actions — A, B — each waiting on YOUR approval \(nothing sent\)/.test(text)
        && !LIES.test(text), [list, text].join(' | '));
    } },
  ],
};
