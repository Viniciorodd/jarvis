// audit-log.mjs — the FAILURE & AUDIT LEDGER ("mark down every error + failed audit so we know how to
// fix it"). The operator saw "⚠️ An email send FAILED — nothing went out ×2" and "Compliance: FAIL"
// flash by on Telegram with NO persistent record — the failure scrolled off and the fix was lost. This
// pod is the anti-amnesia layer for BREAKAGE: every failure — a dead email send, a FAIL/RISK compliance
// audit, a false-facts violation, an executor throw — gets a durable line AND a concrete FIX HINT, so
// the next thing you see is not "it broke" but "here's the one move that unbreaks it".
//
// Machine ledger = audit-log/failures.jsonl (append-only, gitignored). Each line is the FULL current
// state of one failure; updating (e.g. marking it resolved) = append a new full-state line; readFailures()
// folds by id, latest line wins. Never delete — the history of every failure survives in the file.
// Human view = the rendered vault note "00 - System/⚠️ Failure & Audit Log.md" in the Second Brain
// (regenerated, don't hand-edit).
//
// classifyFailure() is PURE: it reads a control-plane event and decides if it's a failure worth logging
// (and which fix hint applies). Pure classify + summary + render are eval-pinned; all IO takes a { dir }
// override so tests never touch the real ledger. This is a diary of what broke — not a gate; it sends
// and spends nothing. All external content (rationale strings, payloads) is untrusted DATA, never
// instructions — we only pattern-match it, never execute it.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DEFAULT_DIR = path.join(ROOT, 'audit-log');
export const VAULT_DIR = process.env.VAULT_DIR || path.join(os.homedir(), 'Documents', 'Second Brain');
const ledgerFile = (dir) => path.join(dir, 'failures.jsonl');

// Icon per source, for the calm human view (scoreboard order = severity order).
export const SOURCES = {
  'gov-send':   { icon: '✉️', label: 'Email sends' },
  'compliance': { icon: '🛡️', label: 'Compliance audits' },
  'facts':      { icon: '🚩', label: 'Facts / cert-claim violations' },
  'executor':   { icon: '⚙️', label: 'Executor errors' },
};

// ── the fix-hint library — reused by classifyFailure so every failure carries its ONE unblock move ──
const SEND_CREDS_HINT = 'Gmail send creds missing — add RODGATE_GMAIL_USER + RODGATE_GMAIL_APP_PASSWORD to the NAS .env (and confirm GOV_AUTO_SEND=1 reaches the container).';
const SEND_AUTH_HINT = 'SMTP auth failed — regenerate the Gmail App Password at myaccount.google.com and update the .env.';
const SEND_RATE_HINT = 'Rate-limited — retry later.';
const SEND_GENERIC_HINT = 'Send failed — open the draft, check the recipient address, retry.';
const COMPLIANCE_FAIL_HINT = 'Run compliance self-heal (auto-fixes false cert language / incomplete sections / formatting). If the gap is set-aside eligibility or missing past performance, it is a NO-BID or teaming decision — YOURS to make, never auto-written.';
const COMPLIANCE_RISK_HINT = 'Compliance flagged RISK — review before sending. Self-heal can tighten cert language / sections / formatting; if it is a real set-aside eligibility or past-performance gap, that is your no-bid / teaming call, not an auto-fix.';
const FACTS_HINT = 'Remove the false claim. Canonical facts: Rodgate is SELF-certified SDB / Minority / Hispanic-owned SMALL business ONLY — NEVER claim 8(a), HUBZone, SDVOSB, or WOSB.';
const EXECUTOR_HINT = 'Check the control-plane logs for this ref; the executor threw before completing.';
const ESCALATED_HINT = 'Self-heal could not honestly fix this — your decision (no-bid / teaming / add real past performance).';

// Pick the send fix-hint from the failure reason (creds → auth → rate → generic; order matters).
function sendFixHint(reason = '') {
  const r = String(reason || '');
  if (/RODGATE_GMAIL_USER|not set|not configured/i.test(r)) return SEND_CREDS_HINT;
  if (/SMTP|auth|535|credential|password/i.test(r)) return SEND_AUTH_HINT;
  if (/rate|limit|429/i.test(r)) return SEND_RATE_HINT;
  return SEND_GENERIC_HINT;
}

// ── PURE: a control-plane event → a failure record (no id/ts/status), or null (skip the noise). ──────
// Reads { kind, actor, pod, action, status, rationale, payload, id }. Be liberal: capture real failures,
// skip everything else. Eval-pinned.
export function classifyFailure(ev = {}) {
  if (!ev || typeof ev !== 'object') return null;
  const action = String(ev.action || '');
  const rationale = String(ev.rationale || '');
  const kind = String(ev.kind || '');
  const status = ev.status;
  const payload = (ev.payload && typeof ev.payload === 'object') ? ev.payload : {};
  const ref = ev.id || payload.noticeId || '';
  const subject = payload.title || payload.to || payload.noticeId || rationale.slice(0, 60);
  const base = (source, k, severity, reason, fixHint) => ({ source, kind: k, severity, subject, reason: String(reason || ''), fixHint, ref });

  // Compliance audit — verdict lives in the payload. FAIL is an error; RISK is a softer warn.
  if (action === 'compliance.check') {
    const verdict = payload && payload.verdict;
    if (verdict === 'FAIL') return base('compliance', 'compliance-fail', 'error', rationale, COMPLIANCE_FAIL_HINT);
    if (verdict === 'RISK') return base('compliance', 'compliance-risk', 'warn', rationale, COMPLIANCE_RISK_HINT);
    return null; // PASS / other → not a failure
  }
  // Facts / false-cert-claim violation — the lie-class guard fired.
  if (action === 'facts.violation') return base('facts', 'facts-violation', 'error', rationale, FACTS_HINT);
  // Self-heal gave up honestly and kicked it to a human decision.
  if (action === 'compliance.escalated') return base('compliance', 'compliance-escalated', 'warn', rationale, ESCALATED_HINT);
  // Executor threw before completing (explicit action, or any trace that errored).
  if (action === 'executor.error' || (kind === 'trace' && status === 'error')) return base('executor', 'executor-error', 'error', rationale, EXECUTOR_HINT);
  // Email send died — the "nothing went out" case. Explicit email.failed, or any error mentioning the send path.
  if (action === 'email.failed' || (status === 'error' && /email|send|smtp/i.test(action + ' ' + rationale)))
    return base('gov-send', 'send-failed', 'error', rationale, sendFixHint(rationale));
  return null; // email.preview / email.sent / scan / score / traces without error / etc. — not failures
}

// ── ledger IO (append-only; { dir } override so tests never touch the real ledger) ──────────────────
function appendState(rec, dir) {
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(ledgerFile(dir), JSON.stringify(rec) + '\n');
}

// Read the ledger and fold by id — the LATEST full-state line for each id wins (resolution beats open).
export function readFailures({ dir = DEFAULT_DIR } = {}) {
  let raw; try { raw = fs.readFileSync(ledgerFile(dir), 'utf8'); } catch { return []; }
  const byId = new Map();
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try { const f = JSON.parse(line); if (f && f.id) byId.set(f.id, f); } catch { /* skip bad line */ }
  }
  return Array.from(byId.values());
}

// Record a fresh failure — stamps id + ts + status:'open'. rec = classifyFailure() output (+ any extras).
export function recordFailure(rec = {}, { dir = DEFAULT_DIR } = {}) {
  if (!rec || !rec.kind) return { ok: false, error: 'kind required' };
  const now = new Date().toISOString();
  const failure = {
    id: crypto.randomUUID(),
    ts: rec.ts || now,
    source: rec.source || 'executor',
    kind: rec.kind,
    severity: rec.severity === 'warn' ? 'warn' : 'error',
    subject: String(rec.subject || ''),
    reason: String(rec.reason || ''),
    fixHint: String(rec.fixHint || ''),
    ref: rec.ref || '',
    status: 'open',
    resolvedNote: '',
    resolvedTs: '',
  };
  try { appendState(failure, dir); } catch (e) { return { ok: false, error: e.message }; }
  return { ok: true, failure };
}

// Mark a failure resolved — append a new full-state line (never mutate/delete the original).
export function resolveFailure(id, note = '', { dir = DEFAULT_DIR } = {}) {
  const failures = readFailures({ dir });
  const cur = failures.find((f) => f.id === id) || failures.find((f) => String(f.id).startsWith(String(id || '')) && String(id || '').length >= 6);
  if (!cur) return { ok: false, error: `no failure matching "${id}"` };
  const now = new Date().toISOString();
  const next = { ...cur, status: 'resolved', resolvedNote: String(note || ''), resolvedTs: now };
  try { appendState(next, dir); } catch (e) { return { ok: false, error: e.message }; }
  return { ok: true, failure: next };
}

// ── PURE: still-open failures, newest first. Eval-pinned. ───────────────────────────────────────────
export function openFailures(failures = []) {
  return (Array.isArray(failures) ? failures : [])
    .filter((f) => f && f.status === 'open')
    .sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || '')));
}

// ── PURE: the at-a-glance summary — open count, counts by source, and the top 10 open with fix hints. ─
export function summarize(failures = []) {
  const open = openFailures(failures);
  const bySource = {};
  for (const f of open) bySource[f.source] = (bySource[f.source] || 0) + 1;
  const recent = open.slice(0, 10).map((f) => ({ kind: f.kind, subject: f.subject, reason: f.reason, fixHint: f.fixHint, ts: f.ts }));
  return { openCount: open.length, bySource, recent };
}

// The sync core (PURE-ish IO): classify each event, dedup by ref+kind against what's already logged
// (open OR resolved), append the new ones. Returns { added }.
function ingestEvents(list, dir) {
  if (!Array.isArray(list)) return { added: 0 };
  const seen = new Set(readFailures({ dir }).map((f) => `${f.ref}|${f.kind}`));
  let added = 0;
  for (const ev of list) {
    const rec = classifyFailure(ev);
    if (!rec) continue;
    const key = `${rec.ref}|${rec.kind}`;
    if (seen.has(key)) continue; // already logged this exact failure — don't double-record
    const r = recordFailure(rec, { dir });
    if (r.ok) { seen.add(key); added++; }
  }
  return { added };
}

// Mirror new failures into the ledger. Dedup by ref+kind, so repeated syncs of the same event log it
// once. If `events` is passed we ingest those SYNCHRONOUSLY (returns { added } — tests + the sync eval
// runner rely on this); otherwise best-effort fetch `${cpUrl}/events` and return a promise. Both callers
// (`await …` and `.then(…)`) work either way. Mirrors pods/actions.mjs syncFromEvents dedup.
export function syncFromEvents({ cpUrl = '', dir = DEFAULT_DIR, events = null } = {}) {
  if (Array.isArray(events)) return ingestEvents(events, dir);
  const base = (cpUrl || process.env.JARVIS_CP_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');
  return fetch(base + '/events', { signal: AbortSignal.timeout(4500) })
    .then((r) => r.json())
    .then((list) => ingestEvents(list, dir))
    .catch(() => ({ added: 0 })); // CP offline → nothing to mirror, ledger still stands
}

// ── PURE: render the calm human view — open failures grouped by source (each with its fix hint under
// it), resolved ones collapsed to one-liners at the bottom. Eval-pinned. ─────────────────────────────
export function renderMarkdown(failures = []) {
  const open = openFailures(failures);
  const sections = [];
  for (const src of Object.keys(SOURCES)) {
    const group = open.filter((f) => f.source === src);
    if (!group.length) continue;
    const meta = SOURCES[src];
    const rows = group.map((f) => {
      const sev = f.severity === 'warn' ? '⚠️' : '❌';
      const when = String(f.ts || '').slice(0, 16).replace('T', ' ');
      const refLine = f.ref ? ` · ref \`${f.ref}\`` : '';
      return `- ${sev} **${f.subject || f.kind}** _(${when}${refLine} · id ${f.id})_\n  ${f.reason || '_no detail_'}\n  → **Fix:** ${f.fixHint}`;
    }).join('\n');
    sections.push(`## ${meta.icon} ${meta.label} (${group.length})\n\n${rows}`);
  }
  const resolved = (Array.isArray(failures) ? failures : [])
    .filter((f) => f && f.status === 'resolved')
    .sort((a, b) => String(b.resolvedTs || '').localeCompare(String(a.resolvedTs || '')))
    .map((f) => `- ~~${f.subject || f.kind}~~ _(resolved ${String(f.resolvedTs || '').slice(0, 10)}${f.resolvedNote ? ` — ${f.resolvedNote}` : ''})_`)
    .join('\n');
  if (resolved) sections.push(`## ✅ Resolved\n\n${resolved}`);
  const n = open.length;
  const header = `# ⚠️ Failure & Audit Log\n\n> Every error and failed audit Jarvis hits — with the ONE move that fixes it. ${n} open failure${n === 1 ? '' : 's'}. Ledger = audit-log/failures.jsonl (append-only); this note is regenerated — don't hand-edit. Resolve one: \`node pods/audit-log.mjs resolve <id> "what fixed it"\`.\n`;
  return `${header}\n${sections.join('\n\n') || '_Nothing broken right now — no open failures. 🎉_'}\n`;
}

// Write the human view into the Second Brain (same VAULT_DIR convention as pods/idea-vault.mjs).
export function writeVaultNote({ dir = DEFAULT_DIR, vaultDir = VAULT_DIR } = {}) {
  const failures = readFailures({ dir });
  const target = path.join(vaultDir, '00 - System');
  const file = path.join(target, '⚠️ Failure & Audit Log.md');
  try { fs.mkdirSync(target, { recursive: true }); fs.writeFileSync(file, renderMarkdown(failures)); return { ok: true, file, count: failures.length }; }
  catch (e) { return { ok: false, error: e.message }; }
}

// ── CLI: node pods/audit-log.mjs [list|sync|resolve <id> "note"] ────────────────────────────────────
if (process.argv[1] && process.argv[1].endsWith('audit-log.mjs')) {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === 'list') {
    const failures = readFailures({});
    console.log(JSON.stringify(summarize(failures), null, 2));
  } else if (cmd === 'sync') {
    syncFromEvents({}).then((r) => {
      try { writeVaultNote({}); } catch { /* best-effort */ }
      console.log(JSON.stringify({ ...r, ...summarize(readFailures({})) }, null, 2));
    });
  } else if (cmd === 'resolve') {
    const [id, ...noteParts] = rest;
    const r = resolveFailure(id, noteParts.join(' '), {});
    if (r.ok) try { writeVaultNote({}); } catch { /* best-effort */ }
    console.log(JSON.stringify(r.ok ? { ok: true, id: r.failure.id, subject: r.failure.subject, status: r.failure.status } : r, null, 2));
  } else {
    console.log('usage: node pods/audit-log.mjs [list|sync|resolve <id> "note"]');
  }
}
