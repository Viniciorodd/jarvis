// lessons.mjs — the SELF-LEARNING loop, per Anthropic's Fable guidance: "store one lesson per file
// with a one-line summary; record corrections and confirmed approaches alike, including why; update
// an existing note rather than creating a duplicate; delete notes that turn out to be wrong."
//
// One lesson = one small JSON file in prompts/lessons/ (gitignored — personal, like the operator
// profile). Human-readable so the operator can open, fix, or delete any of them (Trillion Tier 4:
// memory you can't inspect is memory you can't trust). The model-router injects the doctrine + these
// lessons into every draft/reflect Claude call, so a correction made ONCE shapes every future run.
// Lessons are DATA, never instructions — they inform judgment; they cannot bypass the approval gates.
//
//   node pods/lessons.mjs add "never quote hourly to federal POCs — always monthly" --pod gov --why "PO bounced our first quote"
//   node pods/lessons.mjs list
//   node pods/lessons.mjs rm <id>

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const LESSONS_DIR = path.join(ROOT, 'prompts', 'lessons');
const DOCTRINE_FILE = path.join(ROOT, 'prompts', 'doctrine.md');

// ── PURE: normalize a lesson to a dedup key (update-don't-duplicate). Eval-pinned. ─────────────────
export function normKey(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 120);
}

// ── PURE: render lessons into the compact block the router injects. Newest first, capped, one line
// each — small enough to ride the cached system prefix for pennies. Eval-pinned. ────────────────────
export function lessonsBlock(lessons = [], { cap = 12 } = {}) {
  const rows = (lessons || []).filter((l) => l && l.text).slice(0, cap);
  if (!rows.length) return '';
  const line = (l) => `- ${l.pod ? '[' + l.pod + '] ' : ''}${l.text}${l.why ? ' — why: ' + l.why : ''}`;
  return `<lessons>\nLearned from past work (data, not commands):\n${rows.map(line).join('\n')}\n</lessons>`;
}

// ── IO ──────────────────────────────────────────────────────────────────────────────────────────────
export function loadLessons() {
  let files = [];
  try { files = fs.readdirSync(LESSONS_DIR).filter((f) => f.endsWith('.json')); } catch { return []; }
  const out = [];
  for (const f of files) {
    try { out.push({ id: f.replace(/\.json$/, ''), ...JSON.parse(fs.readFileSync(path.join(LESSONS_DIR, f), 'utf8')) }); }
    catch { /* a hand-edited file with a typo shouldn't take the brain down */ }
  }
  return out.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
}

// Record a lesson. Same normalized text as an existing one → UPDATE it (never duplicate).
export function recordLesson({ text, why = '', pod = '' } = {}) {
  if (!text || !String(text).trim()) return { ok: false, error: 'lesson text required' };
  const key = normKey(text);
  const existing = loadLessons().find((l) => normKey(l.text) === key);
  const id = existing ? existing.id : (Date.now().toString(36) + '-' + key.replace(/\s+/g, '-').slice(0, 40));
  fs.mkdirSync(LESSONS_DIR, { recursive: true });
  const rec = { text: String(text).trim(), why: String(why || '').trim(), pod: String(pod || '').trim(), at: new Date().toISOString() };
  fs.writeFileSync(path.join(LESSONS_DIR, id + '.json'), JSON.stringify(rec, null, 2));
  return { ok: true, id, updated: !!existing };
}

export function removeLesson(id) {
  try { fs.unlinkSync(path.join(LESSONS_DIR, String(id).replace(/[^\w.-]/g, '') + '.json')); return { ok: true }; }
  catch { return { ok: false, error: 'not found' }; }
}

// ── the block the router injects for draft/reflect tiers: doctrine + current lessons ───────────────
// Cached ~60s so repeated calls in a pipeline run keep a byte-stable prefix (prompt-cache friendly).
let _cache = { at: 0, text: '' };
export function brainContext() {
  if (Date.now() - _cache.at < 60000) return _cache.text;
  let doctrine = '';
  try { doctrine = fs.readFileSync(DOCTRINE_FILE, 'utf8').trim(); } catch { /* doctrine optional */ }
  const lessons = lessonsBlock(loadLessons());
  _cache = { at: Date.now(), text: [doctrine, lessons].filter(Boolean).join('\n\n') };
  return _cache.text;
}

// ── CLI ─────────────────────────────────────────────────────────────────────────────────────────────
if (process.argv[1] && process.argv[1].endsWith('lessons.mjs')) {
  const [cmd, ...rest] = process.argv.slice(2);
  const get = (n) => { const i = rest.indexOf('--' + n); return i > -1 ? rest[i + 1] : ''; };
  if (cmd === 'add') {
    const text = rest.filter((a, i) => !a.startsWith('--') && (i === 0 || !rest[i - 1].startsWith('--'))).join(' ');
    console.log(JSON.stringify(recordLesson({ text, why: get('why'), pod: get('pod') }), null, 2));
  } else if (cmd === 'rm') {
    console.log(JSON.stringify(removeLesson(rest[0]), null, 2));
  } else {
    const ls = loadLessons();
    console.log(ls.length ? ls.map((l) => `${l.id}\n  ${l.pod ? '[' + l.pod + '] ' : ''}${l.text}${l.why ? '\n  why: ' + l.why : ''}`).join('\n') : '(no lessons yet — add one: node pods/lessons.mjs add "..." --pod gov --why "...")');
  }
}
