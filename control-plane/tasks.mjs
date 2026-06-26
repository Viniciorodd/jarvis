// Vault task engine — reads/writes the operator's Obsidian "Second Brain" task checkboxes so the
// cockpit can show "today + overdue" and add/complete tasks. The VAULT is the source of truth for
// tasks (plain Markdown, synced across Mac/iPhone/iPad/PC); this module only parses + edits those
// checkboxes. No LLM here — pure deterministic string work (doctrine #1: code disposes).
//
// Honors the Obsidian "Tasks" plugin format used in the vault (see "✅ Tasks.md"):
//   - [ ] do the thing 📅 2026-07-02 🔼 #gov-contracting
//   📅 due · ⏳ scheduled · 🛫 start · ➕ created · ✅ done-date · priority 🔺⏫🔼🔽⏬ · 🔁 recurrence · #tags
//
// The pure parse/format/filter functions are exported + eval-pinned (evals/tasks.eval.mjs); the file
// I/O wraps them and preserves each file's existing line endings so edits stay diff-clean.
//
// CLI:  node control-plane/tasks.mjs today           # list today+overdue
//       node control-plane/tasks.mjs add "text" [#tag] [📅 2026-07-01]
//       node control-plane/tasks.mjs capture "a freeform thought"
//       node control-plane/tasks.mjs scan            # dump all open tasks (JSON)

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

// ── where the vault lives (override with VAULT_DIR) ───────────────────────────────────────────────
export const VAULT_DIR = process.env.VAULT_DIR || path.join(os.homedir(), 'Documents', 'Second Brain');
const CAPTURE_FILE = '⚡ Quick Capture.md';      // fast adds land here, per the vault contract
const CAPTURE_INBOX_MARKER = '## Inbox (new captures)';
// Folders we never scan for tasks (archives, trash, vcs, plugin internals, review piles + the raw
// Things import). The vault's own docs treat 🗂️ Things Import as the "full untouched library".
const SKIP_DIRS = new Set(['.git', '.obsidian', '.trash', 'node_modules', 'old', '🧹 Review & Delete', '🗂️ Things Import', '09 - Archive']);
// Individual "holding pen" files that are NOT the live task set — raw exports + triage/someday piles.
// Without this, the cockpit's "today + overdue" floods with stale recurring items dated back to 2018
// (e.g. Things3 Export.md), which kills the whole point of a calm screen. The curated working set
// (✅ Tasks.md, ⚡ Quick Capture.md, From Things — Active (promoted).md, project/daily notes) stays in.
const SKIP_FILES = new Set(['Things3 Export.md', 'From Things — Review & Decide.md', '📥 Harvested To-Dos.md']);

// ── PURE: dates ──────────────────────────────────────────────────────────────────────────────────
// Local YYYY-MM-DD (the vault's due dates are local calendar days, so don't use UTC here).
export function todayStr(d = new Date()) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ── PURE: parse one line into a task (or null if it isn't a checkbox) ──────────────────────────────
const PRIORITY = { '🔺': 'highest', '⏫': 'high', '🔼': 'medium', '🔽': 'low', '⏬': 'lowest' };
const DATE_SIGNIFIERS = '📅⏳🛫➕✅';
const PRIORITY_SIGNIFIERS = '🔺⏫🔼🔽⏬';
export function parseTaskLine(line) {
  const m = /^(\s*[-*]\s+)\[([ xX])\]\s+(.*)$/.exec(line);
  if (!m) return null;
  const done = m[2].toLowerCase() === 'x';
  const body = m[3];
  const due = (body.match(/📅\s*(\d{4}-\d{2}-\d{2})/) || [])[1] || null;
  const scheduled = (body.match(/⏳\s*(\d{4}-\d{2}-\d{2})/) || [])[1] || null;
  const doneDate = (body.match(/✅\s*(\d{4}-\d{2}-\d{2})/) || [])[1] || null;
  let priority = null;
  for (const sig of Object.keys(PRIORITY)) if (body.includes(sig)) { priority = PRIORITY[sig]; break; }
  const recurring = /🔁/.test(body);
  const tags = [...body.matchAll(/(?:^|\s)#([A-Za-z0-9_/-]+)/g)].map((x) => x[1]);
  // Human-readable text = strip every emoji field + tags, leaving just the words.
  const text = body
    .replace(new RegExp(`[${DATE_SIGNIFIERS}]\\s*\\d{4}-\\d{2}-\\d{2}`, 'g'), ' ')
    .replace(new RegExp(`🔁\\s*[^${DATE_SIGNIFIERS}${PRIORITY_SIGNIFIERS}#]*`, 'g'), ' ')   // recurrence rule
    .replace(new RegExp(`[${PRIORITY_SIGNIFIERS}]`, 'g'), ' ')
    .replace(/(?:^|\s)#[A-Za-z0-9_/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { done, text, due, scheduled, doneDate, priority, recurring, tags };
}

// ── PURE: filters + ordering ──────────────────────────────────────────────────────────────────────
// "Today & overdue" = open AND has a due date on or before today (matches the vault's Tasks query).
// ISO date strings compare lexicographically, so plain <= is correct here.
export function isOpenDueByToday(task, today = todayStr()) {
  return !task.done && !!task.due && task.due <= today;
}
const PRIORITY_RANK = { highest: 0, high: 1, medium: 2, low: 3, lowest: 4, [null]: 5 };
export function todayAndOverdue(tasks, today = todayStr()) {
  return tasks
    .filter((t) => isOpenDueByToday(t, today))
    .sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : (PRIORITY_RANK[a.priority] ?? 5) - (PRIORITY_RANK[b.priority] ?? 5)));
}

// ── PURE: format a new task line, complete an existing one ────────────────────────────────────────
const PRIORITY_SIG = { highest: '🔺', high: '⏫', medium: '🔼', low: '🔽', lowest: '⏬' };
export function formatTaskLine(text, { due = '', priority = '', tags = [] } = {}) {
  let line = `- [ ] ${String(text).trim()}`;
  if (PRIORITY_SIG[priority]) line += ` ${PRIORITY_SIG[priority]}`;
  if (due && /^\d{4}-\d{2}-\d{2}$/.test(due)) line += ` 📅 ${due}`;
  for (const t of tags) { const tag = String(t).replace(/^#/, '').trim(); if (tag) line += ` #${tag}`; }
  return line;
}
// Flip [ ] → [x] and stamp a ✅ done-date (idempotent; leaves non-open lines untouched).
export function completeLine(line, doneDate = todayStr()) {
  const m = /^(\s*[-*]\s+)\[ \]\s+(.*)$/.exec(line);
  if (!m) return line;
  let rest = m[2];
  if (doneDate && !/✅\s*\d{4}-\d{2}-\d{2}/.test(rest)) rest = `${rest.trimEnd()} ✅ ${doneDate}`;
  return `${m[1]}[x] ${rest}`;
}

// ── PURE: extract tasks from a file's lines (skips ```fenced``` query blocks, tracks headings) ─────
function idFor(file, raw) { return crypto.createHash('sha1').update(`${file}|${raw}`).digest('hex').slice(0, 12); }
// A heading whose text matches this marks the tasks beneath it as "parked" (not part of the live set) —
// e.g. ⚡ Quick Capture's "💡 Someday / build ideas (parked — NOT active)" section.
const PARKED_HEADING = /someday|parked|not active|build ideas|review & delete|done recently/i;
export function extractTasks(lines, file = '') {
  const out = [];
  let inFence = false, section = '', parked = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    const h = /^#{1,6}\s+(.*)$/.exec(line);
    if (h) { section = h[1].trim(); parked = PARKED_HEADING.test(section); continue; }
    const t = parseTaskLine(line);
    if (!t) continue;
    out.push({ ...t, file, line: i, raw: line, section, parked, id: idFor(file, line + '|' + line) });
  }
  return out;
}

// ── PURE: the "curated active" set — undated working tasks worth showing when nothing's due ────────
// Files that ARE the live working set even when their tasks carry no tag. Everything else only counts
// as active if it carries a project tag (which keeps untagged Notion templates + journals out).
const CURATED_FILES = new Set(['From Things — Active (promoted).md', '⚡ Quick Capture.md', '✅ Tasks.md']);
export function isCuratedActive(task) {
  if (task.done || task.due || task.parked) return false;        // dated → shows in today+overdue instead
  const base = String(task.file).split('/').pop();
  return CURATED_FILES.has(base) || (task.tags && task.tags.length > 0);
}
export function curatedActive(tasks) {
  return tasks
    .filter(isCuratedActive)
    .sort((a, b) => (PRIORITY_RANK[a.priority] ?? 5) - (PRIORITY_RANK[b.priority] ?? 5));
}

// ── I/O: walk the vault, scan, edit ───────────────────────────────────────────────────────────────
function walk(dir, acc) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name), acc); }
    else if (e.isFile() && e.name.toLowerCase().endsWith('.md') && !SKIP_FILES.has(e.name)) acc.push(path.join(dir, e.name));
  }
  return acc;
}

// Every open + recently-done task in the vault, each tagged with its file + raw line for write-back.
export function scanTasks({ vaultDir = VAULT_DIR } = {}) {
  const out = [];
  for (const file of walk(vaultDir, [])) {
    let content;
    try { content = fs.readFileSync(file, 'utf8'); } catch { continue; }
    const rel = path.relative(vaultDir, file).replace(/\\/g, '/');
    for (const t of extractTasks(content.split(/\r?\n/), rel)) {
      t.id = idFor(rel, t.raw);     // stable id keyed on file + line text (survives line shifts)
      out.push(t);
    }
  }
  return out;
}

// The two lists the cockpit's ✅ Tasks panel renders: what's due now, and the curated active backlog.
export function cockpitTasks({ vaultDir = VAULT_DIR, today = todayStr() } = {}) {
  const all = scanTasks({ vaultDir });
  return { today, dueToday: todayAndOverdue(all, today), active: curatedActive(all) };
}

function eolOf(content) { return /\r\n/.test(content) ? '\r\n' : '\n'; }

// Complete a task by (file + exact raw line) or (id). Returns { changed, file }.
export function completeTask({ file, raw, id, vaultDir = VAULT_DIR, doneDate = todayStr() } = {}) {
  let abs = file ? path.join(vaultDir, file) : null;
  // If only an id was given, locate the matching task across the vault.
  if (!raw && id) {
    const hit = scanTasks({ vaultDir }).find((t) => t.id === id);
    if (!hit) return { changed: false, file: file || null, reason: 'id not found' };
    abs = path.join(vaultDir, hit.file); raw = hit.raw; file = hit.file;
  }
  if (!abs || raw == null) return { changed: false, file: file || null, reason: 'need file+raw or id' };
  let content;
  try { content = fs.readFileSync(abs, 'utf8'); } catch { return { changed: false, file, reason: 'file unreadable' }; }
  const eol = eolOf(content);
  const lines = content.split(/\r?\n/);
  let changed = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === raw) { lines[i] = completeLine(lines[i], doneDate); changed = lines[i] !== raw; break; }
  }
  if (changed) fs.writeFileSync(abs, lines.join(eol));
  return { changed, file };
}

// Find a file anywhere in the vault by its basename (reorg-proof — the vault moves files between
// numbered folders). Returns the absolute path or null.
function findInVault(vaultDir, basename) {
  for (const f of walk(vaultDir, [])) if (path.basename(f) === basename) return f;
  return null;
}

// Append a line into ⚡ Quick Capture's Inbox (or end of file if the marker is gone). Returns { file, line }.
// Locates the real Quick Capture wherever the vault put it (currently 01 - To-Do/) so captures never
// land in a stray duplicate at the root.
export function appendCapture(line, { vaultDir = VAULT_DIR } = {}) {
  const abs = findInVault(vaultDir, CAPTURE_FILE) || path.join(vaultDir, '01 - To-Do', CAPTURE_FILE);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  let content;
  try { content = fs.readFileSync(abs, 'utf8'); }
  catch { content = `# ⚡ Quick Capture\n\n${CAPTURE_INBOX_MARKER}\n`; }
  const eol = eolOf(content);
  const idx = content.indexOf(CAPTURE_INBOX_MARKER);
  if (idx >= 0) {
    const nl = content.indexOf('\n', idx);
    const at = nl >= 0 ? nl + 1 : content.length;
    content = content.slice(0, at) + line + eol + content.slice(at);
  } else {
    content = content.replace(/\s*$/, '') + eol + line + eol;
  }
  fs.writeFileSync(abs, content);
  return { file: CAPTURE_FILE, line };
}

// Structured add (from the Tasks panel) and freeform capture (from the ⚡ box) — both land as a
// checkbox in Quick Capture's Inbox so the vault's Tasks rollups pick them up.
export function addTask(text, opts = {}) { return appendCapture(formatTaskLine(text, opts), opts); }
export function capture(text, opts = {}) {
  const t = String(text).trim();
  return appendCapture(/^[-*]\s+\[[ xX]\]/.test(t) ? t : formatTaskLine(t, opts), opts);
}

// Best-effort trace to the control-plane event store (doctrine §11). Never blocks or throws.
async function trace(action, rationale) {
  const cp = (process.env.CONTROL_PLANE_URL || 'http://localhost:8787').replace(/\/$/, '');
  try {
    await fetch(cp + '/events', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'action', actor: 'OPERATOR-01', pod: 'cockpit', action, status: 'ok', rationale }),
    });
  } catch { /* control-plane may be down in dev — tracing is best-effort */ }
}

// ── CLI ───────────────────────────────────────────────────────────────────────────────────────────
if (process.argv[1] && process.argv[1].endsWith('tasks.mjs')) {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === 'today') {
    const { dueToday, active } = cockpitTasks();
    console.log(`Vault: ${VAULT_DIR}`);
    console.log('\n🔥 Today & overdue:');
    console.log(dueToday.length
      ? dueToday.map((t) => `  • ${t.text}  (due ${t.due}${t.priority ? ', ' + t.priority : ''})  [${t.file}]`).join('\n')
      : '  Nothing due today or overdue. 🎉');
    console.log(`\n⚡ Active (no date) — top 15 of ${active.length}:`);
    console.log(active.slice(0, 15).map((t) => `  • ${t.text}${t.priority ? '  [' + t.priority + ']' : ''}${t.tags.length ? '  #' + t.tags.join(' #') : ''}`).join('\n') || '  (none)');
  } else if (cmd === 'add' || cmd === 'capture') {
    const text = rest.join(' ').trim();
    if (!text) { console.error(`usage: node control-plane/tasks.mjs ${cmd} "text"`); process.exit(1); }
    const r = (cmd === 'add' ? addTask : capture)(text);
    await trace(`tasks.${cmd}`, `"${text}" → ${r.file}`);
    console.log(`✓ added to ${r.file}:  ${r.line}`);
  } else if (cmd === 'scan') {
    console.log(JSON.stringify(scanTasks(), null, 2));
  } else {
    console.log('usage: node control-plane/tasks.mjs [today | add "…" | capture "…" | scan]');
  }
}
