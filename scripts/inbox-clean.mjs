// inbox-clean — the cleanup executor (Phase 2). DRY-RUN BY DEFAULT.
//
//   node scripts/inbox-clean.mjs                  → DRY RUN on Rodgate: prints the exact plan,
//                                                   changes NOTHING.
//   node scripts/inbox-clean.mjs --execute        → performs archive/trash + mark-read.
//   node scripts/inbox-clean.mjs --account personal [--execute]
//
// Rules = "MODERATE" tier (the user's choice):
//   personal (from a real person) ......... KEEP, never touched
//   promo / marketing JUNK ................ TRASH (recoverable 30 days) + listed to unsubscribe
//   DEAL-FLOW (biz-for-sale / real-estate listings he WANTS — personal acct only):
//       treated like opportunities → keep recent, archive/trash the stale ones,
//       and NEVER put on the unsubscribe list (he stays subscribed to the pipeline).
//   opportunity/procurement  >60 days ..... TRASH (past-due)
//   opportunity/procurement  30–60 days ... ARCHIVE (out of inbox, stays in All Mail)
//   opportunity/procurement  <30 days ..... KEEP (recent, may be live)
//   other notifications      >30 days ..... ARCHIVE
//   other notifications      <30 days ..... KEEP
// Nothing is permanently erased. Unsubscribe is listed here but executed in a separate step.
// Personal account scans the FULL mailbox by default (to bring the 35k count down); Rodgate scans 2,500.

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
// Personal inbox is huge (35k) and the whole point is to bring it down — scan it all by default.
const MAX = Number(getFlag('max', ACCOUNT === 'personal' ? 60000 : 2500));
const EXECUTE = argv.includes('--execute');

const USER = ACCOUNT === 'personal' ? env('PERSONAL_GMAIL_USER') : env('RODGATE_GMAIL_USER');
const PASS = (ACCOUNT === 'personal' ? env('PERSONAL_GMAIL_APP_PASSWORD') : env('RODGATE_GMAIL_APP_PASSWORD')).replace(/\s+/g, '');
if (!USER || !PASS) { console.error(`No creds for account "${ACCOUNT}". Set the matching *_GMAIL_USER / *_GMAIL_APP_PASSWORD in .env.`); process.exit(1); }

const NOTIFY = /^(no-?reply|noreply|do-?not-?reply|donotreply|notifications?|alerts?|updates?|mailer-daemon|bounce|postmaster|info|support|news|newsletter|hello|team|account)s?@/i;
const OPP = /(sources sought|solicit|combined synopsis|presolicit|\brf[qpi]\b|\bifb\b|set-?aside|naics|opportunit|award|amendment|pre-?proposal|industry day|sam\.gov|beta\.sam|gsa|contract)/i;
const GOVDOMAIN = /\.(gov|mil)$/i;
const PROMO_HINT = /(unsubscribe|newsletter|deal|sale|% off|promo|coupon|webinar|limited time|sponsored)/i;
// Gov/state bid pipelines — NEVER unsubscribe (Rodgate's opportunity sources).
const PROCUREMENT = /(bonfire|bidmatch|prismcompliance|wvsa|bidnet|demandstar|periscope|govwin|govspend|govtribe|mygovwatch|bidsync|ionwave|planetbids|publicpurchase|openg ov|costars|emarketplace|\.gov|\.mil|sam\.gov)/i;
// DEAL-FLOW (personal account): business-for-sale + real-estate listing pipelines he WANTS to stay on.
// These get treated like opportunities (keep recent, clean the stale) and are kept OFF the unsubscribe list.
const DEALFLOW = /(bizbuysell|bizquest|businessbroker|business-?for-?sale|businessesforsale|dealstream|biznexus|sunbelt|transworld|murphybusiness|crexi|loopnet|costar|realestate|real-?estate|realtor|realty|zillow|redfin|trulia|eastcoastbusiness|nashvillerealestate|hoffergroup|simplesolutionpropert|broker)/i;
// PROTECTED = financial / tax / legal / login-security / signature mail. Never trashed (archive at most).
const PROTECTED_DOMAIN = /(bank|brex\.com|axosbank|login\.gov|irs\.gov|accounts\.google\.com|paypal|stripe|intuit|quickbooks|chase\.com|wellsfargo|bankofamerica|americanexpress|capitalone|discover\.com|docusign|hellosign|adobe(sign)?)/i;
const PROTECTED_SUBJ = /(invoice|receipt|statement|tax|1099|w-?9|payment|refund|security alert|password|verif(y|ication)|one-?time|otp|confirm your email|your account|legal|contract|docusign|sign(ed|ature)|deposit|wire)/i;
const isProtected = (subject, domain) => PROTECTED_DOMAIN.test(domain) || PROTECTED_SUBJ.test(subject);

const ageDays = (d) => d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : 9999;
function classify(from, subject) {
  const domain = (from.split('@')[1] || '');
  // On the personal account, his business/RE deal-flow counts as opportunity (kept fresh, cleaned stale).
  if (ACCOUNT === 'personal' && DEALFLOW.test(domain)) return 'opportunity';
  if (GOVDOMAIN.test(domain) || OPP.test(subject)) return 'opportunity';
  if (PROMO_HINT.test(subject)) return 'promo';
  if (NOTIFY.test(from)) return 'notification';
  return 'personal';
}
function planAction(cat, age, hasUnsub) {
  if (cat === 'personal') return 'keep';
  if (cat === 'promo' || (hasUnsub && cat !== 'opportunity')) return 'trash';
  if (cat === 'opportunity') return age > 60 ? 'trash' : (age > 30 ? 'archive' : 'keep');
  if (cat === 'notification') return age > 30 ? 'archive' : 'keep';
  return 'keep';
}

const client = new ImapFlow({ host: 'imap.gmail.com', port: 993, secure: true, auth: { user: USER, pass: PASS }, logger: false });
try { await client.connect(); }
catch (e) { console.error('IMAP connect failed:', e.message, '\nEnable IMAP in Gmail settings and check the app password.'); process.exit(1); }

const mbox = await client.mailboxOpen('INBOX', { readOnly: !EXECUTE });
const total = mbox.exists;
const start = Math.max(1, total - MAX + 1);

const buckets = { keep: [], archive: [], trash: [] };
const samples = { archive: [], trash: [] };
let protectedSaved = 0;
const unsub = new Map(); // domain -> { count, target }

let scanned = 0;
if (total > 0) {
  for await (const m of client.fetch(`${start}:*`, { uid: true, envelope: true, flags: true, headers: ['list-unsubscribe'] })) {
    if (++scanned % 5000 === 0) process.stdout.write(`\r  scanning… ${scanned}/${Math.min(MAX, total)}   `);
    const from = (m.envelope?.from?.[0]?.address || '').toLowerCase();
    const domain = from.split('@')[1] || '(none)';
    const subject = m.envelope?.subject || '';
    const age = ageDays(m.envelope?.date);
    const hdr = (m.headers || '').toString();
    const unsubMatch = hdr.match(/list-unsubscribe:\s*(.+)/i);
    const cat = classify(from, subject);
    let action = planAction(cat, age, !!unsubMatch);
    if (action === 'trash' && isProtected(subject, domain)) { action = 'archive'; protectedSaved++; }
    buckets[action].push(m.uid);
    if (action !== 'keep' && samples[action].length < 6) samples[action].push(`  ${String(age) + 'd'} · ${domain} · ${subject.slice(0, 64)}`);
    // unsubscribe targets: junk only — never a procurement source, never his deal-flow pipeline
    if (unsubMatch && cat === 'promo' && !PROCUREMENT.test(domain) && !DEALFLOW.test(domain)) {
      const cur = unsub.get(domain) || { count: 0, target: unsubMatch[1].trim() };
      cur.count++; unsub.set(domain, cur);
    }
  }
}

const bar = '─'.repeat(72);
console.log(`\n${bar}\n${EXECUTE ? 'EXECUTING' : 'DRY RUN — nothing will change'} · ${USER} · INBOX ${total} msgs · scanned ${Math.min(MAX, total)}\n${bar}`);
console.log(`KEEP in inbox: ${buckets.keep.length}`);
console.log(`ARCHIVE (→ All Mail, marked read): ${buckets.archive.length}`);
console.log(`TRASH (→ Trash, recoverable 30d):  ${buckets.trash.length}`);
console.log(`(protected from trash → archived instead: ${protectedSaved} financial/security/legal msgs)`);
if (samples.archive.length) console.log(`\n sample ARCHIVE:\n${samples.archive.join('\n')}`);
if (samples.trash.length) console.log(`\n sample TRASH:\n${samples.trash.join('\n')}`);
if (unsub.size) {
  console.log(`\n UNSUBSCRIBE candidates (junk only — listed, not executed here):`);
  for (const [d, v] of [...unsub.entries()].sort((a, b) => b[1].count - a[1].count)) console.log(`  ${d} — ${v.count} msgs`);
}
console.log(bar);

if (!EXECUTE) {
  console.log('Dry run. Review the plan above. Re-run with --execute to apply (archive + trash + mark-read).');
  await client.logout();
  process.exit(0);
}

// --- execute: mark read, then move (chunked — Gmail IMAP balks at huge UID sets) ---
async function act(uids, dest, label) {
  if (!uids.length) return;
  const CHUNK = 500;
  let done = 0;
  for (let i = 0; i < uids.length; i += CHUNK) {
    const batch = uids.slice(i, i + CHUNK);
    await client.messageFlagsAdd(batch, ['\\Seen'], { uid: true }).catch(() => {});
    await client.messageMove(batch, dest, { uid: true });
    done += batch.length;
    process.stdout.write(`\r  ${label}: ${done}/${uids.length} → ${dest}   `);
  }
  console.log('');
}
console.log('Applying…');
await act(buckets.archive, '[Gmail]/All Mail', 'Archived');
await act(buckets.trash, '[Gmail]/Trash', 'Trashed');
await client.logout();
console.log('Done. Inbox now holds ~' + buckets.keep.length + ' messages. Trash is recoverable for 30 days.');
console.log('Unsubscribe step is separate — run it once you OK the sender list above.');
