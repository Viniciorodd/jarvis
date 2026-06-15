// gov-send — the gated email sender for the Gov pod (pipeline v1).
//
// Flow (human-in-the-loop, by design):
//   1. node scripts/gov-send.mjs <email-file>            → DRY RUN: shows the exact outgoing
//      email + posts a preview to your Slack approvals channel. NOTHING is sent.
//   2. You review it. If good, re-run WITH --send to actually send it.
//      node scripts/gov-send.mjs <email-file> --send
//
// Test the whole path first without emailing the government:
//   node scripts/gov-send.mjs <email-file> --to-self --send   → sends to your Rodgate inbox.
//
// Sends via Gmail SMTP using a DEDICATED Rodgate mailbox + App Password (NOT your password,
// NOT OAuth — simplest reliable path). Add to .env:
//   RODGATE_GMAIL_USER=rodgategroup@gmail.com
//   RODGATE_GMAIL_APP_PASSWORD=xxxxxxxxxxxxxxxx   (16-char app password, spaces ok)
//   GOV_REPLY_TO=RodGateGroup@gmail.com           (optional; where replies go; defaults to the Rodgate mailbox)
//
// The email file format: a `To:` line, a `Subject:` line, a row of dashes, then the body.
// (prompts/gov/boilerplate/READY-*.md already matches this.)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nodemailer from 'nodemailer';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
function env(k, d = '') {
  if (process.env[k]) return process.env[k];
  try { const m = fs.readFileSync(path.join(ROOT, '.env'), 'utf8').match(new RegExp('^' + k + '=(.+)$', 'm')); if (m) return m[1].trim(); } catch { /* */ }
  return d;
}

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')));
const fileArg = argv.find((a) => !a.startsWith('--'));
const DO_SEND = flags.has('--send');
const TO_SELF = flags.has('--to-self');

if (!fileArg) { console.error('Usage: node scripts/gov-send.mjs <email-file> [--send] [--to-self]'); process.exit(1); }

const filePath = path.isAbsolute(fileArg) ? fileArg : path.join(ROOT, fileArg);
const raw = fs.readFileSync(filePath, 'utf8');

// --- parse To / Subject / body ---
const lines = raw.split(/\r?\n/);
const toIdx = lines.findIndex((l) => /^To:\s*\S/.test(l));
const subjIdx = lines.findIndex((l, i) => i > toIdx && /^Subject:\s*\S/.test(l));
if (toIdx < 0 || subjIdx < 0) { console.error('Could not find a "To:" and "Subject:" line in', fileArg); process.exit(1); }
let to = lines[toIdx].replace(/^To:\s*/, '').trim();
const subject = lines[subjIdx].replace(/^Subject:\s*/, '').trim();
// body = everything after the dashed delimiter that follows the Subject line
let bodyStart = subjIdx + 1;
const delim = lines.findIndex((l, i) => i > subjIdx && /^-{4,}\s*$/.test(l));
if (delim > -1) bodyStart = delim + 1;
const body = lines.slice(bodyStart).join('\n').trim() + '\n';

const USER = env('RODGATE_GMAIL_USER');
const PASS = env('RODGATE_GMAIL_APP_PASSWORD').replace(/\s+/g, ''); // app passwords are shown with spaces
const REPLY_TO = env('GOV_REPLY_TO', env('RODGATE_GMAIL_USER', 'RodGateGroup@gmail.com'));

if (TO_SELF) to = USER || REPLY_TO;
// CC a copy only if reply-to is a different mailbox than the sender (avoid CC-ing yourself).
const ccAddr = (TO_SELF || !REPLY_TO || REPLY_TO.toLowerCase() === (USER || '').toLowerCase()) ? '' : REPLY_TO;

// --- Slack preview (plain web API; no socket needed) ---
async function slackPreview(label) {
  const BOT = env('SLACK_BOT_TOKEN');
  const CH = env('SLACK_APPROVALS_CHANNEL', '#approvals');
  if (!BOT) return;
  const text = `*${label} — Gov pod email*\n*To:* ${to}\n*Subject:* ${subject}\n\n\`\`\`${body.slice(0, 2800)}\`\`\``;
  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8', authorization: 'Bearer ' + BOT },
    body: JSON.stringify({ channel: CH, text, unfurl_links: false }),
  }).then((r) => r.json()).then((d) => { if (!d.ok) console.error('  (Slack preview failed:', d.error + ')'); else console.error('  → preview posted to Slack', CH); })
    .catch((e) => console.error('  (Slack preview error:', e.message + ')'));
}

// --- print to console ---
const bar = '─'.repeat(72);
console.log('\n' + bar);
console.log(DO_SEND ? (TO_SELF ? 'SENDING TEST (to self)' : 'SENDING — LIVE') : 'DRY RUN — nothing will be sent');
console.log(bar);
console.log('From:     ' + (USER ? `Rodgate, LLC <${USER}>` : '(RODGATE_GMAIL_USER not set)'));
console.log('To:       ' + to);
console.log('Reply-To: ' + REPLY_TO + (ccAddr ? `   |  Cc: ${ccAddr}` : ''));
console.log('Subject:  ' + subject);
console.log(bar);
console.log(body);
console.log(bar + '\n');

if (!DO_SEND) {
  await slackPreview('PREVIEW (dry run)');
  console.log('Dry run. Review above. To actually send, re-run with --send (add --to-self to test).');
  process.exit(0);
}

if (!USER || !PASS) {
  console.error('Cannot send: set RODGATE_GMAIL_USER and RODGATE_GMAIL_APP_PASSWORD in .env first.');
  process.exit(1);
}

const transport = nodemailer.createTransport({ service: 'gmail', auth: { user: USER, pass: PASS } });
try {
  await transport.verify();
} catch (e) {
  console.error('SMTP login failed:', e.message);
  console.error('Check: 2-Step Verification is ON for the Rodgate Gmail, and the App Password is correct.');
  process.exit(1);
}

const info = await transport.sendMail({
  from: `"Rodgate, LLC" <${USER}>`,
  to,
  cc: ccAddr || undefined,
  replyTo: REPLY_TO,
  subject,
  text: body,
});

console.log('✅ Sent. messageId:', info.messageId);
console.log('   accepted:', info.accepted.join(', '));
await slackPreview('✅ SENT');
