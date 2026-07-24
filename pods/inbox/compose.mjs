// compose.mjs — the ONE place that writes a reply into Gmail Drafts. Both the scheduled morning triage
// (pods/inbox/triage.mjs → stageDrafts, a batch) and the on-demand "draft a reply to X" chat tool
// (companion/server.js → draft_gmail_reply, a single message) call appendGmailDraft — so the MailComposer +
// IMAP-append mechanics live here once, not in two places.
//
// DOCTRINE §2: this NEVER sends. It appends a `\Draft`-flagged RFC822 message to [Gmail]/Drafts over IMAP;
// the operator opens Gmail, reviews, edits, and sends himself. There is deliberately no send path here.
import { env } from '../lib.mjs';

// PURE: the reply subject — keep an existing "Re:" (case/space-insensitive), else prepend one. Eval-pinned.
export function replySubject(subject) {
  const s = String(subject || '').trim();
  if (!s) return 'Re: (no subject)';
  return /^re:/i.test(s) ? s : 'Re: ' + s;
}

// Append ONE review-ready reply draft to [Gmail]/Drafts (never sends). Best-effort: returns {ok:false,error}
// instead of throwing. Pass an already-connected imapflow `client` to reuse one connection across a batch;
// omit it and appendGmailDraft opens + closes its own. `userAddr` overrides the account's env address.
export async function appendGmailDraft({ account = 'personal', userAddr, to, subject, body, inReplyTo, client } = {}) {
  if (!to || !body) return { ok: false, error: 'missing to/body' };
  const addr = userAddr || (account === 'rodgate' ? env('RODGATE_GMAIL_USER') : env('PERSONAL_GMAIL_USER'));
  const pass = (account === 'rodgate' ? env('RODGATE_GMAIL_APP_PASSWORD') : env('PERSONAL_GMAIL_APP_PASSWORD') || '').replace(/\s+/g, '');
  if (!addr) return { ok: false, error: 'inbox-not-connected' };
  let MailComposer, ImapFlow;
  try { MailComposer = (await import('nodemailer/lib/mail-composer/index.js')).default; ({ ImapFlow } = await import('imapflow')); }
  catch { return { ok: false, error: 'draft deps unavailable' }; }
  const own = !client;
  if (own) {
    if (!pass) return { ok: false, error: 'inbox-not-connected' };
    client = new ImapFlow({ host: 'imap.gmail.com', port: 993, secure: true, auth: { user: addr, pass }, logger: false });
  }
  const subj = replySubject(subject);
  try {
    if (own) await client.connect();
    const mail = new MailComposer({ from: addr, to, subject: subj, inReplyTo: inReplyTo || undefined, references: inReplyTo || undefined, text: body });
    const raw = await new Promise((res, rej) => mail.compile().build((err, msg) => (err ? rej(err) : res(msg))));
    await client.append('[Gmail]/Drafts', raw, ['\\Draft']); // \Draft flag + Gmail Drafts mailbox — appears in Gmail, NEVER sent
    return { ok: true, to, subject: subj };
  } catch (e) { return { ok: false, error: e.message }; }
  finally { if (own) { try { await client.logout(); } catch { /* */ } } }
}
