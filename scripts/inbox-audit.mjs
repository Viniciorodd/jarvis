// inbox-audit — READ-ONLY Gmail inbox scanner for the cleanup butler (Phase 1).
// Connects over IMAP (same app password as the sender), classifies INBOX mail, and prints +
// writes a report. CHANGES NOTHING — no archiving, no deleting, no unsubscribing. That's Phase 2,
// and only after you approve the plan this produces.
//
//   node scripts/inbox-audit.mjs                 → audits the Rodgate mailbox (RODGATE_GMAIL_*)
//   node scripts/inbox-audit.mjs --account personal   → uses PERSONAL_GMAIL_USER / PERSONAL_GMAIL_APP_PASSWORD
//   node scripts/inbox-audit.mjs --max 2000      → scan more (default: most-recent 1000)
//
// Requires Gmail IMAP enabled: Gmail → Settings → Forwarding and POP/IMAP → Enable IMAP.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ImapFlow } from 'imapflow';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
function env(k, d = '') {
  if (process.env[k]) return process.env[k];
  try { const m = fs.readFileSync(path.join(ROOT, '.env'), 'utf8').match(new RegExp('^' + k + '=(.+)$', 'm')); if (m) return m[1].trim(); } catch { /* */ }
  return d;
}
const argv = process.argv.slice(2);
const getFlag = (n, d) => { const i = argv.indexOf('--' + n); return i > -1 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true) : d; };
const ACCOUNT = getFlag('account', 'rodgate');
const MAX = Number(getFlag('max', 1000));

const USER = ACCOUNT === 'personal' ? env('PERSONAL_GMAIL_USER') : env('RODGATE_GMAIL_USER');
const PASS = (ACCOUNT === 'personal' ? env('PERSONAL_GMAIL_APP_PASSWORD') : env('RODGATE_GMAIL_APP_PASSWORD')).replace(/\s+/g, '');
if (!USER || !PASS) { console.error(`No creds for account "${ACCOUNT}". Set ${ACCOUNT === 'personal' ? 'PERSONAL_GMAIL_USER/PERSONAL_GMAIL_APP_PASSWORD' : 'RODGATE_GMAIL_USER/RODGATE_GMAIL_APP_PASSWORD'} in .env.`); process.exit(1); }

const NOTIFY = /^(no-?reply|noreply|do-?not-?reply|donotreply|notifications?|alerts?|updates?|mailer-daemon|bounce|postmaster|info|support|news|newsletter|hello|team|account)s?@/i;
const OPP = /(sources sought|solicit|combined synopsis|presolicit|\brf[qpi]\b|\bifb\b|set-?aside|naics|opportunit|award|amendment|pre-?proposal|industry day|sam\.gov|beta\.sam|gsa|contract)/i;
const GOVDOMAIN = /\.(gov|mil)$/i;
const PROMO_HINT = /(unsubscribe|newsletter|deal|sale|% off|promo|coupon|webinar|sale ends|limited time|sponsored)/i;

const ageDays = (d) => d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : 9999;

const client = new ImapFlow({ host: 'imap.gmail.com', port: 993, secure: true, auth: { user: USER, pass: PASS }, logger: false });

try {
  await client.connect();
} catch (e) {
  console.error('IMAP connect failed:', e.message);
  console.error('If this says auth/login: enable IMAP in Gmail (Settings → Forwarding and POP/IMAP → Enable IMAP) and confirm the app password.');
  process.exit(1);
}

const mbox = await client.mailboxOpen('INBOX', { readOnly: true });
const total = mbox.exists;
const start = Math.max(1, total - MAX + 1);
console.log(`\nAuditing ${USER} · INBOX has ${total} messages · scanning most-recent ${Math.min(MAX, total)} (READ-ONLY)\n`);

const cats = { opportunity: [], notification: [], promo: [], personal: [] };
const senders = new Map();        // domain -> count
const unsubSenders = new Map();   // domain -> count (have List-Unsubscribe)

if (total > 0) {
  for await (const m of client.fetch(`${start}:*`, { envelope: true, flags: true, headers: ['list-unsubscribe'] })) {
    const from = (m.envelope?.from?.[0]?.address || '').toLowerCase();
    const domain = from.split('@')[1] || '(none)';
    const subject = m.envelope?.subject || '';
    const date = m.envelope?.date;
    const unseen = !(m.flags && m.flags.has('\\Seen'));
    const hasUnsub = !!(m.headers && m.headers.toString().toLowerCase().includes('list-unsubscribe'));

    senders.set(domain, (senders.get(domain) || 0) + 1);
    if (hasUnsub) unsubSenders.set(domain, (unsubSenders.get(domain) || 0) + 1);

    let cat;
    if (GOVDOMAIN.test(domain) || OPP.test(subject)) cat = 'opportunity';
    else if (hasUnsub || PROMO_HINT.test(subject)) cat = 'promo';
    else if (NOTIFY.test(from)) cat = 'notification';
    else cat = 'personal';
    cats[cat].push({ from, domain, subject, age: ageDays(date), unseen });
  }
}
await client.logout();

// --- summarize ---
const pct = (n) => total ? Math.round((n / Math.min(MAX, total)) * 100) : 0;
const scanned = cats.opportunity.length + cats.notification.length + cats.promo.length + cats.personal.length;
const olderThan = (arr, d) => arr.filter((x) => x.age > d).length;
const topN = (map, n) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

let out = `# Inbox audit — ${USER}\n_${new Date().toISOString().slice(0, 16).replace('T', ' ')} · scanned ${scanned} of ${total} · READ-ONLY (nothing changed)_\n\n`;
out += `## Categories\n`;
out += `| Category | Count | % | Older than 30d | Unread |\n|---|---|---|---|---|\n`;
for (const c of ['opportunity', 'notification', 'promo', 'personal']) {
  const a = cats[c];
  out += `| ${c} | ${a.length} | ${pct(a.length)}% | ${olderThan(a, 30)} | ${a.filter((x) => x.unseen).length} |\n`;
}
out += `\n**Likely-stale opportunities** (gov/opportunity mail older than 60d — probably past-due): ${olderThan(cats.opportunity, 60)}\n`;
out += `**Promo/newsletter older than 30d** (trash candidates): ${olderThan(cats.promo, 30)}\n\n`;
out += `## Top senders by volume\n`;
for (const [d, n] of topN(senders, 15)) out += `- ${d} — ${n}${unsubSenders.has(d) ? ' · _has unsubscribe_' : ''}\n`;
out += `\n## Top unsubscribe candidates (bulk senders with a List-Unsubscribe header)\n`;
for (const [d, n] of topN(unsubSenders, 15)) out += `- ${d} — ${n} messages\n`;

const dir = path.join(ROOT, 'reports');
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `inbox-audit-${ACCOUNT}-${new Date().toISOString().slice(0, 10)}.md`);
fs.writeFileSync(file, out);

console.log(out);
console.log(`\nReport saved: ${path.relative(ROOT, file)}  (read-only — no mail was touched)`);
