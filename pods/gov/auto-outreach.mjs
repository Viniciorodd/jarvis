// auto-outreach.mjs — the Phase 9 SEND PATH. Every candidate outreach runs the gauntlet in outreach-policy.mjs
// before anything leaves the building; anything the policy denies goes to the operator's approval queue exactly
// like today. DRY RUN IS THE DEFAULT — runAutoOutreach() prints what *would* send and sends nothing, so the
// operator can watch the machine's judgment before granting it the wire.
//
// Truthful narration (L-014): a send is only reported as sent when the SMTP layer hands back a real receipt
// (messageId/accepted). No receipt → "NOT sent — <reason>". Never a confabulated success.
// Three-place logging (L-003): every real send writes the local auto-send ledger + an event + the outreach file.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, emit } from './lib.mjs';
import { canAutoSend, contactEmail, policy } from './outreach-policy.mjs';
import { loadControl } from '../control-center.mjs';
import { renderTemplate } from './outreach-templates.mjs';

const DIR = path.join(ROOT, 'gov-outreach');
const LOG = path.join(DIR, 'auto-log.json');
const DRAFTS = path.join(ROOT, 'gov-drafts', 'auto');

const readJson = (p, f) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return f; } };
export function loadLog() { const d = readJson(LOG, []); return Array.isArray(d) ? d : []; }
function appendLog(entry) {
  try { fs.mkdirSync(DIR, { recursive: true }); const l = loadLog(); l.push(entry); fs.writeFileSync(LOG, JSON.stringify(l, null, 2)); } catch { /* best-effort */ }
}

// PURE: how many real auto-sends already went out on this date (for the daily cap). Eval-pinned.
export function sentToday(log = [], now = new Date()) {
  const day = new Date(now).toISOString().slice(0, 10);
  return log.filter((e) => e && e.sent && String(e.at || '').slice(0, 10) === day).length;
}
// PURE: when did we last auto-send to this address (for the per-recipient cooldown)? null if never.
export function lastToRecipient(log = [], email = '') {
  const e = String(email || '').toLowerCase();
  const hits = log.filter((x) => x && x.sent && String(x.to || '').toLowerCase() === e).map((x) => x.at).filter(Boolean).sort();
  return hits.length ? hits[hits.length - 1] : null;
}
// PURE: the operator's morning digest of what went out (PRD §4.10). Says so plainly when nothing sent.
export function digestText(log = [], forDate = new Date()) {
  const day = new Date(forDate).toISOString().slice(0, 10);
  const rows = log.filter((e) => e && e.sent && String(e.at || '').slice(0, 10) === day);
  if (!rows.length) return `🤖 Auto-outreach — nothing was sent on ${day}.`;
  return [`🤖 Auto-outreach — ${rows.length} sent on ${day}:`, ...rows.map((r) => `• ${r.template} → ${r.to}${r.subject ? ` — "${String(r.subject).slice(0, 60)}"` : ''}`)].join('\n');
}

// Write the rendered outreach to a sendable file (To:/Subject:/----/body) so the proven sender + its SMTP
// receipt evidence are reused, and there's a paper-trail artifact per send.
function writeOutreachFile(slug, to, subject, body) {
  fs.mkdirSync(DRAFTS, { recursive: true });
  const file = path.join(DRAFTS, `${slug}.md`);
  fs.writeFileSync(file, `To: ${to}\nSubject: ${subject}\n----\n${body}\n`);
  return path.relative(ROOT, file);
}

// The send path. `candidates` = [{ contact, templateKey, slots }]. DRY RUN BY DEFAULT.
// Returns { dryRun, tier, considered, sent, queued, results } — results carry the honest per-item outcome.
// `control` is injectable so the evals never depend on the real on-disk switch state — otherwise flipping a
// toggle in the UI would change what the test suite asserts, which is how a suite quietly stops meaning
// anything. Same lesson as the gateway usage ledger.
export async function runAutoOutreach({ dryRun = true, candidates = [], now = new Date(), control = null } = {}) {
  const p = policy();
  const log = loadLog();
  const ctl = control || loadControl();
  const results = [];
  let sent = 0, queued = 0;

  for (const c of Array.isArray(candidates) ? candidates : []) {
    const contact = c && c.contact;
    const to = contactEmail(contact);
    const label = (contact && (contact.name || contact.contact_name)) || to || 'unknown';
    let rendered;
    try { rendered = renderTemplate(c.templateKey, { contactName: (contact && (contact.contact_name || contact.name)) || 'there', ...(c.slots || {}) }); }
    catch (e) { results.push({ to, contact: label, allowed: false, sent: false, reason: e.message }); queued++; continue; }

    const decision = canAutoSend({
      templateKey: c.templateKey, body: rendered.body, recipient: contact,
      sentToday: sentToday(log, now), lastToRecipientAt: lastToRecipient(log, to), now,
      // Outreach is Hector's (CONNECT-01). Passing the Control Center state makes his on/off/tier switch a
      // real gate rather than a label — if the operator switched him off, this send cannot happen.
      agent: 'CONNECT-01', control: ctl,
    });

    if (!decision.allow) {
      // Denied → the operator's approval queue, exactly as today. Nothing sent, nothing hidden.
      results.push({ to, contact: label, template: c.templateKey, allowed: false, sent: false, reason: decision.reason });
      queued++;
      continue;
    }

    if (dryRun) {
      results.push({ to, contact: label, template: c.templateKey, allowed: true, sent: false, dryRun: true, subject: rendered.subject, reason: 'DRY RUN — this WOULD have sent' });
      continue;
    }

    // Real send via the proven sender (returns an SMTP receipt we require before claiming "sent").
    const slug = `${c.templateKey}-${(to || 'x').replace(/[^\w]+/g, '-')}-${Date.now().toString(36)}`;
    const file = writeOutreachFile(slug, to, rendered.subject, rendered.body);
    let r = { ok: false, sent: false, reason: 'sender unavailable' };
    try { const S = await import('./sender.mjs'); r = await S.sendGovEmail({ file, dryRun: false, fromAddr: rendered.from || '' }); } catch (e) { r = { ok: false, sent: false, reason: e.message }; }
    const reallySent = !!(r && r.sent);
    if (reallySent) {
      sent++;
      appendLog({ at: new Date(now).toISOString(), to, contact: label, template: c.templateKey, subject: rendered.subject, file, sent: true, messageId: r.messageId || '' });
      await emit({ kind: 'action', actor: 'CONNECT-01', pod: 'gov', action: 'outreach.auto_sent', status: 'done', rationale: `🤖 Auto-sent ${c.templateKey} to ${label}`, payload: { to, template: c.templateKey, file, messageId: r.messageId || '' } });
    } else {
      await emit({ kind: 'trace', actor: 'CONNECT-01', pod: 'gov', action: 'outreach.auto_failed', status: 'error', rationale: `Auto-send NOT sent to ${label}: ${r.reason || 'no SMTP receipt'}`, payload: { to, template: c.templateKey, file } });
    }
    results.push({ to, contact: label, template: c.templateKey, allowed: true, sent: reallySent, file, reason: reallySent ? 'sent (SMTP receipt received)' : `NOT sent — ${r.reason || 'no SMTP receipt'}` });
  }

  return { dryRun, tier: p.tier, killed: p.kill, considered: (candidates || []).length, sent, queued, results };
}
