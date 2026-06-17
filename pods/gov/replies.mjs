// Hector's inbound side — read subcontractor REPLIES from the Rodgate mailbox (gov only, never personal),
// extract each sub's quote + past performance, update the CRM, and write a "procurement package" the
// proposal drafter folds in. Uses the Rodgate Gmail app password over IMAP (same creds as gov-send / the
// inbox tooling). Dynamic imapflow import so the module loads even where the dep isn't present.

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, DRAFTS, env, emit, mirror, claude } from './lib.mjs';
import { loadSubs, saveSubs } from './connector.mjs';

const slug = (op) => String(op.noticeId || op.title || 'op').replace(/[^\w]+/g, '-').slice(0, 44);
export const procurementPath = (op) => path.join(ROOT, 'gov-drafts', `procurement-${slug(op)}.json`);

export async function readRodgateInbox({ days = 21, max = 25 } = {}) {
  const USER = env('RODGATE_GMAIL_USER');
  const PASS = (env('RODGATE_GMAIL_APP_PASSWORD') || '').replace(/\s+/g, '');
  if (!USER || !PASS) return { error: 'Rodgate mailbox not connected — set RODGATE_GMAIL_USER + RODGATE_GMAIL_APP_PASSWORD in .env.' };
  let ImapFlow;
  try { ({ ImapFlow } = await import('imapflow')); } catch { return { error: 'imapflow not available in this runtime (run on the PC or add the dep).' }; }
  const client = new ImapFlow({ host: 'imap.gmail.com', port: 993, secure: true, auth: { user: USER, pass: PASS }, logger: false });
  const out = [];
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      const since = new Date(Date.now() - days * 86400000);
      const uids = await client.search({ since }, { uid: true });
      for (const uid of (uids || []).slice(-max)) {
        const msg = await client.fetchOne(uid, { envelope: true, source: true }, { uid: true });
        if (!msg) continue;
        const from = ((msg.envelope && msg.envelope.from && msg.envelope.from[0] && msg.envelope.from[0].address) || '').toLowerCase();
        const subject = (msg.envelope && msg.envelope.subject) || '';
        const date = (msg.envelope && msg.envelope.date) || '';
        const raw = msg.source ? msg.source.toString('utf8') : '';
        const body = raw.split(/\r?\n\r?\n/).slice(1).join('\n\n').replace(/=\r?\n/g, '').slice(0, 4000);
        out.push({ from, subject, date, body });
      }
    } finally { lock.release(); }
  } catch (e) { return { error: 'IMAP read failed: ' + e.message }; }
  finally { try { await client.logout(); } catch { /* */ } }
  return { msgs: out };
}

async function parseReply(body) {
  const sys = 'A subcontractor replied to our request for a federal bid. Extract ONLY a JSON object: {"can_perform": boolean, "quote": "their price/rate or empty string", "past_performance": "one line summarizing the contracts/references they cited, or empty string"}. No prose, no fences.';
  const r = await claude(sys, String(body).slice(0, 3500), { tier: 'cheap', maxTokens: 300, agent: 'CONNECT-01' });
  try { const m = (r.text || '').match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null; } catch { return null; }
}

// Read Rodgate inbox → match replies to known subs → parse quote + past performance → update CRM →
// (if an opportunity is given) write the procurement package the drafter folds in. Read-only on email.
export async function gatherSubResponses({ op = null } = {}) {
  await mirror('CONNECT-01', 'work', 'Checking Rodgate inbox for sub replies…');
  const inbox = await readRodgateInbox({});
  if (inbox.error) {
    await emit({ kind: 'trace', actor: 'CONNECT-01', pod: 'gov', action: 'sub.replies.skip', status: 'error', rationale: inbox.error });
    await mirror('CONNECT-01', 'idle', inbox.error);
    return { ok: false, note: inbox.error };
  }
  const subs = loadSubs();
  const byEmail = new Map(subs.filter((s) => s.contact_email).map((s) => [s.contact_email.toLowerCase(), s]));
  let updated = 0; const found = [];
  for (const m of inbox.msgs) {
    const sub = byEmail.get(m.from);
    if (!sub) continue; // only parse replies from subs we actually reached out to
    const parsed = await parseReply(m.body);
    if (!parsed) continue;
    if (parsed.quote) sub.quote = parsed.quote;
    if (parsed.past_performance) sub.past_performance_notes = parsed.past_performance;
    sub.status = 'quoted'; sub.last_reply = m.date;
    updated++; found.push({ sub: sub.name, quote: sub.quote || '(none)', past_performance: parsed.past_performance || '' });
    await emit({ kind: 'action', actor: 'CONNECT-01', pod: 'gov', action: 'sub.reply.parsed', reversible: true, rationale: `${sub.name}: quote ${sub.quote || 'n/a'}; ${parsed.can_perform ? 'can perform' : 'capability unclear'}`, payload: { sub: sub.id, quote: sub.quote, past_performance: parsed.past_performance } });
  }
  saveSubs(subs);

  if (op && found.length) {
    const quoted = subs.filter((s) => s.status === 'quoted' && s.quote);
    if (quoted.length) {
      fs.mkdirSync(DRAFTS, { recursive: true });
      const best = quoted[0];
      fs.writeFileSync(procurementPath(op), JSON.stringify({ sub: best.name, quote: best.quote, past_performance: best.past_performance_notes || '', noticeId: op.noticeId, captured: new Date().toISOString() }, null, 2));
    }
  }
  await mirror('CONNECT-01', updated ? 'need' : 'idle', updated ? `${updated} sub repl${updated === 1 ? 'y' : 'ies'} parsed — quotes + past performance captured for the proposal` : 'No new sub replies in the Rodgate inbox');
  return { ok: true, updated, found };
}

if (process.argv[1] && process.argv[1].endsWith('replies.mjs')) {
  gatherSubResponses({}).then((r) => console.log(JSON.stringify(r, null, 2))).catch((e) => { console.error(e); process.exitCode = 1; });
}
