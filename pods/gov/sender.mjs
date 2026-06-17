// pods/gov/sender.mjs — the Gov pod's email SEND capability, refactored out of scripts/gov-send.mjs so both
// the CLI (manual two-step) and the control-plane EXECUTOR (auto-send on your approval) run one code path.
// Sends via the dedicated Rodgate mailbox over Gmail SMTP (app password — RODGATE_GMAIL_USER/APP_PASSWORD).
//
// Doctrine §9 rule 2: a send is irreversible, so it only happens behind an explicit human approval. The
// executor is additionally gated behind GOV_AUTO_SEND so auto-send is opt-in (off = it dry-runs + previews).
// nodemailer is imported dynamically so this module loads even where the dep is absent (it just can't send).

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, env } from './lib.mjs';

// Email-file format (matches prompts/gov/boilerplate/READY-*.md + the connector's outreach files):
//   To: someone@agency.mil
//   Subject: ...
//   ------------------------
//   body...
// PURE — returns { ok, to, subject, body } or { ok:false, reason }. Eval-tested.
export function parseEmailFile(raw) {
  const lines = String(raw || '').split(/\r?\n/);
  const toIdx = lines.findIndex((l) => /^To:\s*\S/.test(l));
  const subjIdx = lines.findIndex((l, i) => i > toIdx && /^Subject:\s*\S/.test(l));
  if (toIdx < 0 || subjIdx < 0) return { ok: false, reason: 'no "To:" + "Subject:" header — not a sendable email file' };
  const to = lines[toIdx].replace(/^To:\s*/, '').trim();
  const subject = lines[subjIdx].replace(/^Subject:\s*/, '').trim();
  let bodyStart = subjIdx + 1;
  const delim = lines.findIndex((l, i) => i > subjIdx && /^-{4,}\s*$/.test(l));
  if (delim > -1) bodyStart = delim + 1;
  const body = lines.slice(bodyStart).join('\n').trim();
  if (!to || !subject || !body) return { ok: false, reason: 'missing recipient, subject, or body' };
  const addr = to.replace(/^.*</, '').replace(/>.*$/, '').trim(); // tolerate "Name <a@b.com>"
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) return { ok: false, reason: `"${to}" is not a valid recipient` };
  return { ok: true, to, subject, body: body + '\n' };
}

// PURE: given an approval.request event, decide whether approving it should SEND an email, and which file.
// Conservative — gov pod only, an email action (NOT "submit": a federal proposal goes out a portal, not as
// raw email), and a draft file in the payload. Eval-tested; this is the gate on what the executor may touch.
const SENDABLE_ACTIONS = new Set(['send', 'email']);
export function approvalToSend(reqEvent) {
  if (!reqEvent || reqEvent.kind !== 'approval.request') return null;
  if (reqEvent.pod !== 'gov') return null;
  if (!SENDABLE_ACTIONS.has(String(reqEvent.action || '').toLowerCase())) return null;
  const file = reqEvent.payload && reqEvent.payload.file;
  if (!file || typeof file !== 'string') return null;
  return { file };
}

const resolveFile = (file) => (path.isAbsolute(file) ? file : path.join(ROOT, file));

async function slackPreview(label, to, subject, body) {
  const BOT = env('SLACK_BOT_TOKEN'); const CH = env('SLACK_APPROVALS_CHANNEL', '#approvals');
  if (!BOT) return;
  try {
    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8', authorization: 'Bearer ' + BOT },
      body: JSON.stringify({ channel: CH, text: `*${label} — Gov pod email*\n*To:* ${to}\n*Subject:* ${subject}\n\n\`\`\`${body.slice(0, 2800)}\`\`\``, unfurl_links: false }),
    });
  } catch { /* preview is best-effort */ }
}

// Send (or dry-run) a gov email file via the Rodgate mailbox. Returns a structured result; never throws.
export async function sendGovEmail({ file, toSelf = false, dryRun = false, slack = true } = {}) {
  let raw;
  try { raw = fs.readFileSync(resolveFile(file), 'utf8'); }
  catch { return { ok: false, sent: false, reason: `cannot read ${file}` }; }
  const parsed = parseEmailFile(raw);
  if (!parsed.ok) return { ok: false, sent: false, reason: parsed.reason };

  const USER = env('RODGATE_GMAIL_USER');
  const PASS = (env('RODGATE_GMAIL_APP_PASSWORD') || '').replace(/\s+/g, '');
  const REPLY_TO = env('GOV_REPLY_TO', USER || 'RodGateGroup@gmail.com');
  const to = toSelf ? (USER || REPLY_TO) : parsed.to;
  const ccAddr = (toSelf || !REPLY_TO || REPLY_TO.toLowerCase() === (USER || '').toLowerCase()) ? '' : REPLY_TO;
  const { subject, body } = parsed;

  if (dryRun) {
    if (slack) await slackPreview('PREVIEW (dry run)', to, subject, body);
    return { ok: true, sent: false, dryRun: true, to, subject, from: USER, body };
  }
  if (!USER || !PASS) return { ok: false, sent: false, to, subject, reason: 'RODGATE_GMAIL_USER / RODGATE_GMAIL_APP_PASSWORD not set' };

  let nodemailer;
  try { nodemailer = (await import('nodemailer')).default; }
  catch { return { ok: false, sent: false, to, subject, reason: 'nodemailer not available in this runtime' }; }
  try {
    const transport = nodemailer.createTransport({ service: 'gmail', auth: { user: USER, pass: PASS } });
    await transport.verify();
    const info = await transport.sendMail({ from: `"Rodgate, LLC" <${USER}>`, to, cc: ccAddr || undefined, replyTo: REPLY_TO, subject, text: body });
    if (slack) await slackPreview('✅ SENT', to, subject, body);
    return { ok: true, sent: true, to, subject, from: USER, messageId: info.messageId, accepted: info.accepted || [] };
  } catch (e) { return { ok: false, sent: false, to, subject, reason: 'SMTP: ' + e.message }; }
}
