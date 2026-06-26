// projects.mjs — each business gets its own folder in the vault (04 - Projects/<folder>/) for REAL
// tracking, and a single Log.md that is the running report: done · to-dos · ideas · blockers. The log
// lives in the vault (so it shows in Obsidian) and is read/written by Jarvis (so it shows in the app) —
// one source, both places. Agents drop their files in <folder>/agents/. Pure format/parse logic is
// eval-pinned; the file I/O wraps it.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const VAULT_DIR = process.env.VAULT_DIR || path.join(os.homedir(), 'Documents', 'Second Brain');
const PROJECTS_DIR = '04 - Projects';
const RECENT_MARK = '## Recent';

// ── PURE: one log entry ⇄ one Markdown line ──────────────────────────────────────────────────────
// done → a checked task w/ date · todo → an open task (Obsidian Tasks picks it up) · idea/blocker/note
// → a bullet with an icon. So the report is native Markdown the operator can also edit by hand.
export function formatLogLine(type, text, date) {
  const t = String(text || '').trim();
  switch (type) {
    case 'done': return `- [x] ${t} ✅ ${date}`;
    case 'todo': return `- [ ] ${t}`;
    case 'idea': return `- 💡 ${t}  (${date})`;
    case 'blocker': return `- ⛔ ${t}  (${date})`;
    default: return `- 📝 ${t}  (${date})`;
  }
}
export function parseLogLine(line) {
  let m = /^\s*[-*]\s+\[([ xX])\]\s+(.*?)(?:\s*✅\s*(\d{4}-\d{2}-\d{2}))?\s*$/.exec(line);
  if (m) { const done = m[1].toLowerCase() === 'x'; return { type: done ? 'done' : 'todo', text: m[2].trim(), date: m[3] || '', done }; }
  m = /^\s*[-*]\s+(💡|⛔|📝)\s+(.*?)(?:\s*\((\d{4}-\d{2}-\d{2})\))?\s*$/.exec(line);
  if (m) { const type = m[1] === '💡' ? 'idea' : m[1] === '⛔' ? 'blocker' : 'note'; return { type, text: m[2].trim(), date: m[3] || '', done: false }; }
  return null;
}
export function todayStr(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ── I/O ──────────────────────────────────────────────────────────────────────────────────────────
export function projectDir(biz) { return path.join(VAULT_DIR, PROJECTS_DIR, biz.folder || biz.name); }
const LOG_FILE = (biz) => path.join(projectDir(biz), 'Log.md');
const writeIfMissing = (file, content) => { if (!fs.existsSync(file)) fs.writeFileSync(file, content); };

// Create the folder + standard files for a business (idempotent — never overwrites existing files).
export function ensureScaffold(biz, seed = {}) {
  const dir = projectDir(biz);
  fs.mkdirSync(path.join(dir, 'agents'), { recursive: true });
  writeIfMissing(path.join(dir, `${biz.name}.md`),
    `# ${biz.name}\n\n> This business's home in the vault. Tracking lives in [[Log]]; agent outputs in \`agents/\`.\n`);
  writeIfMissing(LOG_FILE(biz),
    `# ${biz.name} — Log\n\n> The running report: ✅ done · ☐ to-dos · 💡 ideas · ⛔ blockers. Written by you AND Jarvis — shows in both Obsidian and the app.\n\n${RECENT_MARK}\n`);
  writeIfMissing(path.join(dir, 'agents', 'README.md'),
    `# ${biz.name} — agent files\n\n> Each AI agent working this business drops its outputs/notes here (drafts, reports, scratch).\n`);
  if (biz.crm) writeIfMissing(path.join(dir, 'Contacts (CRM).md'), seed.crm || `# ${biz.name} — Contacts (CRM)\n\n| Name | Role | Contact | Notes |\n|---|---|---|---|\n`);
  return dir;
}

// Append an entry to the top of the log's Recent section. type: done|todo|idea|blocker|note.
export function appendLog(biz, { type = 'note', text = '', date = todayStr() } = {}) {
  ensureScaffold(biz);
  const file = LOG_FILE(biz);
  let content = fs.readFileSync(file, 'utf8');
  const eol = /\r\n/.test(content) ? '\r\n' : '\n';
  const line = formatLogLine(type, text, date);
  const idx = content.indexOf(RECENT_MARK);
  if (idx >= 0) {
    const nl = content.indexOf('\n', idx); const at = nl >= 0 ? nl + 1 : content.length;
    content = content.slice(0, at) + line + eol + content.slice(at);
  } else {
    content = content.replace(/\s*$/, '') + eol + RECENT_MARK + eol + line + eol;
  }
  fs.writeFileSync(file, content);
  return { ok: true, line };
}

// Read recent log entries (most-recent-first) for the app to render.
export function readLog(biz, { limit = 15 } = {}) {
  let content; try { content = fs.readFileSync(LOG_FILE(biz), 'utf8'); } catch { return []; }
  const out = [];
  for (const line of content.split(/\r?\n/)) { const e = parseLogLine(line); if (e && e.text) out.push(e); if (out.length >= limit) break; }
  return out;
}

// ── CRM (a Markdown table in Contacts (CRM).md — gov subs, real-estate tenants) ───────────────────
// PURE: parse a Markdown table → { headers, rows }; format one row.
export function parseCrm(content) {
  const tbl = String(content).split(/\r?\n/).filter((l) => /^\s*\|.*\|\s*$/.test(l));
  if (tbl.length < 2) return { headers: [], rows: [] };
  const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
  const headers = cells(tbl[0]);
  const rows = tbl.slice(1).filter((l) => !/^\s*\|[\s:|-]+\|\s*$/.test(l)).map(cells).filter((r) => r.some((c) => c));
  return { headers, rows };
}
export function crmRowLine(cells) { return '| ' + cells.map((c) => String(c == null ? '' : c).replace(/\|/g, '/').trim()).join(' | ') + ' |'; }

const CRM_FILE = (biz) => path.join(projectDir(biz), 'Contacts (CRM).md');
export function readCrm(biz) { try { return parseCrm(fs.readFileSync(CRM_FILE(biz), 'utf8')); } catch { return { headers: [], rows: [] }; } }
export function addCrmRow(biz, cells, seedCrm) {
  ensureScaffold(biz, { crm: seedCrm });
  const file = CRM_FILE(biz);
  let content = fs.readFileSync(file, 'utf8');
  const eol = /\r\n/.test(content) ? '\r\n' : '\n';
  fs.writeFileSync(file, content.replace(/\s*$/, '') + eol + crmRowLine(cells) + eol);
  return { ok: true };
}
