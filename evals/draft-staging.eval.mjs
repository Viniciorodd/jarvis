// Draft-staging (MAILROOM-01): the morning triage stages review-ready REPLY drafts into Gmail Drafts for
// the emails that need one — draft-only, never sends (doctrine §2). This pins the pure reply-subject rule +
// appendGmailDraft's input guard (the rest — LLM reply gen + IMAP append — is I/O, verified live vs Gmail).
// replySubject is imported via triage.mjs to confirm its re-export from compose.mjs stays intact.

import { replySubject } from '../pods/inbox/triage.mjs';
import { appendGmailDraft } from '../pods/inbox/compose.mjs';

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
    { name: 'appendGmailDraft refuses (never touches IMAP) with no recipient or no body',
      run: async () => {
        const a = await appendGmailDraft({ to: '', body: 'hi' });
        const b = await appendGmailDraft({ account: 'personal', to: 'a@b.com', body: '' });
        return ok(a.ok === false && a.error === 'missing to/body' && b.ok === false && b.error === 'missing to/body', JSON.stringify({ a, b }));
      } },
  ],
};
