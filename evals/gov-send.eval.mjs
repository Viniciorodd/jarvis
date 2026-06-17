// Regression suite for the gov emailer's PURE core (pods/gov/sender.mjs): the email-file parser and the
// executor gate. These guard an IRREVERSIBLE action — if approvalToSend regresses, approving the wrong
// thing could email it; if parseEmailFile regresses, a malformed message could go out. No network here.

import { parseEmailFile, approvalToSend } from '../pods/gov/sender.mjs';

const EMAIL = ['To: co@army.mil', 'Subject: Sources Sought Response — W911', '----------------------', '', 'Dear Contracting Officer,', 'Rodgate, LLC is pleased to respond.', ''].join('\n');
const req = (over = {}) => ({ kind: 'approval.request', pod: 'gov', action: 'send', payload: { file: 'gov-drafts/outreach-x.md' }, ...over });

export default {
  agent: 'gov-send',
  cases: [
    { name: 'parses To / Subject / body from a well-formed email file',
      run: () => { const p = parseEmailFile(EMAIL); return { pass: p.ok && p.to === 'co@army.mil' && /Sources Sought/.test(p.subject) && /pleased to respond/.test(p.body), detail: JSON.stringify(p) }; } },
    { name: 'rejects a file with no To: header (e.g. a raw proposal)',
      run: () => { const p = parseEmailFile('# Proposal\n\nSection 1: Technical Approach...'); return { pass: !p.ok, detail: p.reason }; } },
    { name: 'rejects a file missing the Subject line',
      run: () => { const p = parseEmailFile('To: a@b.com\n\nbody only'); return { pass: !p.ok, detail: p.reason }; } },
    { name: 'rejects an invalid recipient address',
      run: () => { const p = parseEmailFile('To: not-an-email\nSubject: hi\n----\nbody'); return { pass: !p.ok, detail: p.reason }; } },
    { name: 'tolerates a "Name <addr>" recipient',
      run: () => { const p = parseEmailFile('To: Leslie Duron <leslie@army.mil>\nSubject: hi\n----\nbody text'); return { pass: p.ok && /army\.mil/.test(p.to), detail: JSON.stringify(p) }; } },
    { name: 'approving a gov send WITH a file → executor sends that file',
      run: () => { const j = approvalToSend(req()); return { pass: !!j && j.file === 'gov-drafts/outreach-x.md', detail: JSON.stringify(j) }; } },
    { name: 'a gov SUBMIT (proposal) does NOT auto-email (goes out a portal, not as raw email)',
      run: () => { const j = approvalToSend(req({ action: 'submit' })); return { pass: j === null, detail: JSON.stringify(j) }; } },
    { name: 'a non-gov send is not handled by the gov executor',
      run: () => { const j = approvalToSend(req({ pod: 'fiverr' })); return { pass: j === null, detail: JSON.stringify(j) }; } },
    { name: 'a send with no file in the payload is a no-op',
      run: () => { const j = approvalToSend(req({ payload: {} })); return { pass: j === null, detail: JSON.stringify(j) }; } },
    { name: 'a non-approval event (e.g. a plain action) is ignored',
      run: () => { const j = approvalToSend(req({ kind: 'action' })); return { pass: j === null, detail: JSON.stringify(j) }; } },
  ],
};
