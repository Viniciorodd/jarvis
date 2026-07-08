// actions.mjs — the ACTION LOG (momentum ledger). Gov contracting is slow: you send many to win one,
// so the metric is EFFORT, not just outcomes. Every meaningful action — yours OR Jarvis's — is recorded
// in the Second Brain so progress is visible before the wins land.
//
// Two capture paths, one ledger:
//   1. Jarvis's own actions — classifyEvent() maps a control-plane event (proposal submitted, email
//      sent, sub outreach, sources-sought answered, disposition) to an entry; the companion mirrors new
//      ones in (deduped by event id).
//   2. Your actions — parseManualAction() turns "log that I submitted the West Point proposal" / "I
//      reached out to JAN-PRO" into an entry (voice/chat), like the expense tracker.
//
// Machine ledger = actions/<year>.jsonl (append-only, gitignored). Human view = the rendered vault note
// "00 - System/🏆 Action Log.md" (regenerated on every append). Pure parser + classifier + summary are
// eval-pinned; money/identity are untouched here (this is a diary, not a gate).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DIR = path.join(ROOT, 'actions');
const ledgerFile = (year) => path.join(DIR, `${year}.jsonl`);

// The momentum categories (order = scoreboard order). Each: icon + a short label.
export const TYPES = {
  submitted:     { icon: '📤', label: 'Proposals submitted' },
  sources_sought:{ icon: '📋', label: 'Sources-sought answered' },
  outreach:      { icon: '🤝', label: 'Connections / outreach' },
  sent:          { icon: '✉️', label: 'Emails / quotes sent' },
  drafted:       { icon: '📝', label: 'Proposals drafted' },
  won:           { icon: '🏆', label: 'Wins' },
  registration:  { icon: '🗂️', label: 'Registrations / listings' },
  meeting:       { icon: '📞', label: 'Calls / meetings' },
  action:        { icon: '✅', label: 'Other actions' },
};

// ── PURE: a control-plane event → an achievement entry, or null (skip the noise). Eval-pinned. ──────
export function classifyEvent(ev = {}) {
  const a = String(ev.action || '').toLowerCase();
  const pod = ev.pod || '';
  const subj = (ev.payload && (ev.payload.title || ev.payload.to)) || cleanRationale(ev.rationale) || '';
  let type = null, text = '';
  if (a === 'proposal.submitted') { type = 'submitted'; text = `Submitted proposal — ${subj}`; }
  else if (a === 'email.sent') { type = 'sent'; text = `Sent email${ev.payload && ev.payload.to ? ' → ' + ev.payload.to : ''}${subj && !(ev.payload && ev.payload.to) ? ' — ' + subj : ''}`; }
  else if (/sources?[-_. ]?sought|^rfi/.test(a) || /sources[-_. ]?sought/i.test(subj)) { type = 'sources_sought'; text = `Answered sources-sought — ${subj}`; }
  else if (/outreach|reach[-_. ]?out|connect/.test(a)) { type = 'outreach'; text = `Reached out — ${subj}`; }
  else if (a === 'invoice.created') { type = 'sent'; text = `Invoiced a client — ${subj}`; }
  else if (a === 'disposition') { const won = /won/i.test(ev.rationale || ''); type = won ? 'won' : 'action'; text = `${won ? 'WON' : 'Updated'} — ${subj}`; }
  else return null; // proposal.draft, scan, score, spend.check, traces, etc. are not achievements
  return { type, text: text.replace(/\s+—\s*$/, '').trim(), ts: ev.ts || new Date().toISOString(), source: 'jarvis', sourceId: ev.id || '' };
}
function cleanRationale(r) { return String(r || '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100); }

// ── PURE: a spoken/typed statement → an achievement entry, or { ok:false }. Eval-pinned. ────────────
const Q = /^(what|did|should|shall|can|could|how|when|why|is|are|do|does|will|who|where)\b/i;
const VERB_TYPE = [
  [/\b(submitted|submit)\b/i, 'submitted'],
  [/\b(answered|responded to|replied to)\b.*\b(sources?[- ]?sought|rfi)\b|\bsources?[- ]?sought\b/i, 'sources_sought'],
  [/\b(reached out|reach out|connected with|dropped off|introduced|teamed|networked)\b/i, 'outreach'],
  [/\b(sent|emailed|quoted|delivered|submitted a quote)\b/i, 'sent'],
  [/\b(registered|signed up|listed|applied)\b/i, 'registration'],
  [/\b(called|met with|met|spoke with|talked to)\b/i, 'meeting'],
  [/\b(won|awarded)\b/i, 'won'],
];
export function parseManualAction(text) {
  const t = String(text || '').trim();
  if (!t || /\?\s*$/.test(t) || Q.test(t)) return { ok: false };
  const explicit = /^\s*(log|logged|done|track|record|note)\b[:\s]/i.test(t);
  let type = null;
  for (const [re, ty] of VERB_TYPE) if (re.test(t)) { type = ty; break; }
  if (!explicit && !type) return { ok: false };
  let body = t.replace(/^\s*(log|logged|done|track|record|note)\b(\s+that)?[:\s]+/i, '')
    .replace(/^\s*(i've|i have|i just|just|i)\s+/i, '').trim();
  if (!body) return { ok: false };
  body = body.charAt(0).toUpperCase() + body.slice(1);
  return { ok: true, type: type || 'action', text: body, source: 'you' };
}

// ── ledger IO + dedup ───────────────────────────────────────────────────────────────────────────────
export function readActions({ year = new Date().getFullYear() } = {}) {
  let raw; try { raw = fs.readFileSync(ledgerFile(year), 'utf8'); } catch { return []; }
  const out = [];
  for (const line of raw.split('\n')) { if (!line.trim()) continue; try { out.push(JSON.parse(line)); } catch { /* skip */ } }
  return out;
}
export function logAction(entry, { vaultDir = '' } = {}) {
  if (!entry || !entry.text) return { ok: false, error: 'text required' };
  const ts = entry.ts || new Date().toISOString();
  const day = ts.slice(0, 10);
  const existing = readActions({ year: day.slice(0, 4) });
  // dedup: jarvis events by sourceId; manual by same text+type+day (so a re-say doesn't double-log).
  if (entry.sourceId && existing.some((e) => e.sourceId === entry.sourceId)) return { ok: true, duplicate: true };
  if (!entry.sourceId && existing.some((e) => e.text === entry.text && e.type === entry.type && (e.ts || '').slice(0, 10) === day)) return { ok: true, duplicate: true };
  const rec = { id: crypto.randomUUID(), ts, date: day, type: TYPES[entry.type] ? entry.type : 'action', text: String(entry.text).slice(0, 200), source: entry.source || 'you', sourceId: entry.sourceId || '' };
  try { fs.mkdirSync(DIR, { recursive: true }); fs.appendFileSync(ledgerFile(day.slice(0, 4)), JSON.stringify(rec) + '\n'); }
  catch (e) { return { ok: false, error: e.message }; }
  if (vaultDir) try { renderVaultLog(vaultDir); } catch { /* vault render best-effort */ }
  return { ok: true, entry: rec };
}

// Mirror new Jarvis actions from a control-plane event list into the ledger. Returns how many were added.
export function syncFromEvents(events = [], { vaultDir = '' } = {}) {
  let added = 0;
  for (const ev of (Array.isArray(events) ? events : [])) {
    const c = classifyEvent(ev);
    if (!c) continue;
    const r = logAction(c, {}); // defer the vault render to one pass at the end
    if (r.ok && !r.duplicate) added++;
  }
  if (added && vaultDir) try { renderVaultLog(vaultDir); } catch { /* */ }
  return { added };
}

// ── PURE: momentum summary (all-time + this-week counts by type). Eval-pinned. ──────────────────────
export function summarize(list = [], now = new Date()) {
  const weekAgo = new Date(now.getTime() - 7 * 864e5).toISOString().slice(0, 10);
  const byType = {}, weekByType = {};
  for (const e of list) {
    byType[e.type] = (byType[e.type] || 0) + 1;
    if ((e.date || e.ts || '').slice(0, 10) >= weekAgo) weekByType[e.type] = (weekByType[e.type] || 0) + 1;
  }
  return { total: list.length, byType, week: { total: Object.values(weekByType).reduce((s, n) => s + n, 0), byType: weekByType } };
}

// ── render the human-readable vault note from the ledger ────────────────────────────────────────────
export function renderMarkdown(list = [], now = new Date()) {
  const s = summarize(list, now);
  const scoreLine = (ty) => { const c = s.byType[ty] || 0; const w = (s.week.byType[ty] || 0); return c ? `- ${TYPES[ty].icon} **${TYPES[ty].label}:** ${c}${w ? ` _(+${w} this week)_` : ''}` : ''; };
  const scoreboard = Object.keys(TYPES).map(scoreLine).filter(Boolean).join('\n') || '- _no actions logged yet_';
  // group by day, newest first, cap the rendered history (the JSONL keeps everything)
  const byDay = {};
  for (const e of list) (byDay[e.date || (e.ts || '').slice(0, 10)] ||= []).push(e);
  const days = Object.keys(byDay).sort().reverse().slice(0, 90);
  const body = days.map((d) => {
    const rows = byDay[d].sort((a, b) => (b.ts || '').localeCompare(a.ts || ''))
      .map((e) => `- ${(e.ts || '').slice(11, 16)} · ${TYPES[e.type] ? TYPES[e.type].icon : '✅'} ${e.text}${e.source === 'you' ? '' : ' _· Jarvis_'}`).join('\n');
    return `## ${d}\n${rows}`;
  }).join('\n\n');
  return `# 🏆 Action Log\n\n> Every meaningful action toward the business — yours and Jarvis's. In gov you send many to win one, so **momentum is the metric**: track the sends, the outreach, the sources-sought — not just the wins. Auto-mirrored from Jarvis + logged by voice ("log that I…"). Rendered from actions/<year>.jsonl; don't hand-edit.\n\n## Scoreboard (all-time)\n${scoreboard}\n\n---\n\n${body || '_Nothing logged yet — do something and tell Jarvis, or let it mirror your next send._'}\n`;
}
export function renderVaultLog(vaultDir) {
  if (!vaultDir) return { ok: false };
  const list = readActions({});
  const dir = path.join(vaultDir, '00 - System');
  try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, '🏆 Action Log.md'), renderMarkdown(list)); return { ok: true }; }
  catch (e) { return { ok: false, error: e.message }; }
}

// Convenience for the chat/voice path.
export function captureManual(text, { vaultDir = '' } = {}) {
  const p = parseManualAction(text);
  if (!p.ok) return { ok: false };
  const r = logAction(p, { vaultDir });
  if (!r.ok) return { ok: false, error: r.error };
  const spoken = r.duplicate ? `Already logged that one.` : `Logged it: ${p.text}. ✊ Keep the momentum.`;
  return { ok: true, entry: r.entry, spoken };
}

if (process.argv[1] && process.argv[1].endsWith('actions.mjs')) {
  const arg = process.argv.slice(2).join(' ');
  if (arg) console.log(JSON.stringify(captureManual(arg), null, 2));
  else console.log(JSON.stringify({ ...summarize(readActions({})), recent: readActions({}).slice(-10) }, null, 2));
}
