// gov-send — the manual, gated CLI for the Gov pod emailer. Thin wrapper over pods/gov/sender.mjs (the
// SAME code path the control-plane executor uses when you approve a send in HQ/Slack/the companion).
//
// Flow (human-in-the-loop, by design):
//   1. node scripts/gov-send.mjs <email-file>            → DRY RUN: prints the exact outgoing email +
//      posts a Slack preview. NOTHING is sent.
//   2. node scripts/gov-send.mjs <email-file> --send     → actually sends it.
//   Test the whole path first without emailing the government:
//   node scripts/gov-send.mjs <email-file> --to-self --send   → sends to your Rodgate inbox.
//
// Sends via Gmail SMTP using the dedicated Rodgate mailbox + App Password. Add to .env:
//   RODGATE_GMAIL_USER=rodgategroup@gmail.com
//   RODGATE_GMAIL_APP_PASSWORD=xxxxxxxxxxxxxxxx   (16-char app password, spaces ok)
//   GOV_REPLY_TO=RodGateGroup@gmail.com           (optional; defaults to the Rodgate mailbox)
//
// Email-file format: a `To:` line, a `Subject:` line, a row of dashes, then the body.
// (prompts/gov/boilerplate/READY-*.md + the connector's outreach files already match this.)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEmailFile, sendGovEmail } from '../pods/gov/sender.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')));
const fileArg = argv.find((a) => !a.startsWith('--'));
if (!fileArg) { console.error('Usage: node scripts/gov-send.mjs <email-file> [--send] [--to-self]'); process.exit(1); }
const DO_SEND = flags.has('--send');
const TO_SELF = flags.has('--to-self');

const filePath = path.isAbsolute(fileArg) ? fileArg : path.join(ROOT, fileArg);
let raw; try { raw = fs.readFileSync(filePath, 'utf8'); } catch { console.error('Cannot read', fileArg); process.exit(1); }
const parsed = parseEmailFile(raw);
if (!parsed.ok) { console.error('Not a sendable email file:', parsed.reason); process.exit(1); }

const bar = '─'.repeat(72);
console.log('\n' + bar);
console.log(DO_SEND ? (TO_SELF ? 'SENDING TEST (to self)' : 'SENDING — LIVE') : 'DRY RUN — nothing will be sent');
console.log(bar);
console.log('To:       ' + (TO_SELF ? '(your Rodgate inbox)' : parsed.to));
console.log('Subject:  ' + parsed.subject);
console.log(bar);
console.log(parsed.body);
console.log(bar + '\n');

const res = await sendGovEmail({ file: fileArg, toSelf: TO_SELF, dryRun: !DO_SEND });
if (!DO_SEND) {
  console.log('Dry run. Review above. To actually send, re-run with --send (add --to-self to test).');
  process.exit(res.ok ? 0 : 1);
}
if (res.sent) {
  console.log('✅ Sent. messageId:', res.messageId);
  console.log('   accepted:', (res.accepted || []).join(', '));
} else {
  console.error('Send failed:', res.reason);
  process.exit(1);
}
