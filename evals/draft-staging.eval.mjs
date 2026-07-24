// Draft-staging (MAILROOM-01): the morning triage stages review-ready REPLY drafts into Gmail Drafts for
// the emails that need one — draft-only, never sends (doctrine §2). This pins the pure reply-subject rule
// (the rest — LLM reply gen + IMAP append — is I/O, verified live against Gmail on 2026-07-24).

import { replySubject } from '../pods/inbox/triage.mjs';

const ok = (pass, detail = '') => ({ pass, detail });

export default {
  agent: 'draft-staging',
  cases: [
    { name: 'prepends Re: to a fresh subject',
      run: () => { const s = replySubject('Quote for the Erie job'); return ok(s === 'Re: Quote for the Erie job', s); } },
    { name: 'keeps an existing Re: (no double-Re:)',
      run: () => { const s = replySubject('Re: Quote for the Erie job'); return ok(s === 'Re: Quote for the Erie job', s); } },
    { name: 'existing Re: is case/space-insensitive',
      run: () => ok(replySubject('RE: hello') === 'RE: hello' && replySubject('re: hello') === 're: hello') },
    { name: 'empty / whitespace subject → a safe placeholder',
      run: () => ok(replySubject('') === 'Re: (no subject)' && replySubject('   ') === 'Re: (no subject)' && replySubject(null) === 'Re: (no subject)') },
    { name: 'trims surrounding whitespace before deciding',
      run: () => { const s = replySubject('  Payment terms  '); return ok(s === 'Re: Payment terms', s); } },
  ],
};
