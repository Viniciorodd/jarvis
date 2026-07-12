// idea-vault.mjs — the IDEA VAULT ("no idea worth doing ever gets left behind — even if I go in a
// coma"). The operator keeps losing good ideas to the churn — the Rodgate business-credit journey
// vanished for WEEKS — so this pod is the anti-amnesia layer: every idea gets a line in an
// append-only ledger, a revisit clock by status, and a resurface queue that drags the stale ones
// back into view before they die of neglect.
//
// Machine ledger = ideas-vault/ideas.jsonl (append-only, gitignored). Each line is the FULL current
// state of one idea; updating = append a new full-state line; readIdeas() folds by id, latest line
// wins. Never delete — the history of every idea survives in the file. Human view = the rendered
// vault note "00 - System/💡 Idea Vault.md" in the Second Brain (regenerated, don't hand-edit).
//
// Statuses: new | active | waiting | parked | done | dropped. Each open status has a revisit clock
// (REVISIT_DAYS); when lastTouched + clock passes, the idea shows up in resurfaceQueue() — stalest
// first — until you touchIdea() it ("keep it alive") or move it to done/dropped (which never
// resurface). Pure staleness math + rendering are eval-pinned; all IO takes a { dir } override so
// tests never touch the real ledger. This is a memory, not a gate — nothing here sends or spends.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DEFAULT_DIR = path.join(ROOT, 'ideas-vault');
export const VAULT_DIR = process.env.VAULT_DIR || path.join(os.homedir(), 'Documents', 'Second Brain');

export const STATUSES = ['new', 'active', 'waiting', 'parked', 'done', 'dropped'];
export const REVISIT_DAYS = { new: 7, active: 7, waiting: 14, parked: 30 }; // done/dropped never resurface
const CLOSED = new Set(['done', 'dropped']);
const ledgerFile = (dir) => path.join(dir, 'ideas.jsonl');
const normTitle = (t) => String(t || '').trim().toLowerCase();
const normTags = (tags) => (Array.isArray(tags) ? tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean) : []);

// ── ledger IO (append-only; { dir } override so tests never touch the real vault) ───────────────────
function appendState(idea, dir) {
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(ledgerFile(dir), JSON.stringify(idea) + '\n');
}

// Read the ledger and fold by id — the LATEST full-state line for each id wins.
export function readIdeas({ dir = DEFAULT_DIR } = {}) {
  let raw; try { raw = fs.readFileSync(ledgerFile(dir), 'utf8'); } catch { return []; }
  const byId = new Map();
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try { const i = JSON.parse(line); if (i && i.id) byId.set(i.id, i); } catch { /* skip bad line */ }
  }
  return Array.from(byId.values());
}

export function listIdeas({ status = '', dir = DEFAULT_DIR } = {}) {
  const all = readIdeas({ dir });
  return status ? all.filter((i) => i.status === status) : all;
}

// Add a new idea. fields = { title (required), detail, tags[], status, revisitDays, lastTouched, source, note }.
export function addIdea(fields = {}, { dir = DEFAULT_DIR } = {}) {
  const title = String(fields.title || '').trim();
  if (!title) return { ok: false, error: 'title required' };
  const now = new Date().toISOString();
  const status = STATUSES.includes(fields.status) ? fields.status : 'new';
  const idea = {
    id: fields.id || crypto.randomBytes(4).toString('hex'),
    ts: fields.ts || now,
    title,
    detail: String(fields.detail || ''),
    tags: normTags(fields.tags),
    status,
    lastTouched: fields.lastTouched || fields.ts || now,
    revisitDays: Number.isFinite(fields.revisitDays) ? fields.revisitDays : (REVISIT_DAYS[status] ?? null),
    source: fields.source || 'manual',
    log: Array.isArray(fields.log) ? fields.log : (fields.note ? [{ ts: now, note: String(fields.note) }] : []),
  };
  try { appendState(idea, dir); } catch (e) { return { ok: false, error: e.message }; }
  return { ok: true, idea };
}

// Find by exact id, or by a unique id prefix (CLI mercy — short ids are still typeable).
function findIdea(ideas, id) {
  const q = String(id || '').trim();
  if (!q) return null;
  const exact = ideas.find((i) => i.id === q);
  if (exact) return exact;
  const pref = ideas.filter((i) => String(i.id).startsWith(q));
  return pref.length === 1 ? pref[0] : null;
}

// Merge a patch into an idea and append the new full state. Always bumps lastTouched; a patch.note
// is appended to the idea's log. A status change resets revisitDays to the new status's default
// unless the patch sets revisitDays explicitly. id/ts/log are protected from the merge.
export function updateIdea(id, patch = {}, { dir = DEFAULT_DIR } = {}) {
  const ideas = readIdeas({ dir });
  const cur = findIdea(ideas, id);
  if (!cur) return { ok: false, error: `no idea matching "${id}"` };
  const now = new Date().toISOString();
  const { note, id: _id, ts: _ts, log: _log, ...rest } = patch;
  const next = { ...cur, ...rest };
  if (rest.status !== undefined && !STATUSES.includes(rest.status)) next.status = cur.status;
  if (rest.status && next.status !== cur.status && !Number.isFinite(rest.revisitDays))
    next.revisitDays = REVISIT_DAYS[next.status] ?? null;
  if (rest.tags !== undefined) next.tags = normTags(rest.tags);
  if (rest.title !== undefined) next.title = String(rest.title || '').trim() || cur.title;
  next.lastTouched = now;
  next.log = [...(Array.isArray(cur.log) ? cur.log : []), ...(note ? [{ ts: now, note: String(note) }] : [])];
  try { appendState(next, dir); } catch (e) { return { ok: false, error: e.message }; }
  return { ok: true, idea: next };
}

// "Keep it alive" — bump lastTouched and log why, so the idea leaves the resurface queue.
export function touchIdea(id, note = '', opts = {}) {
  return updateIdea(id, { note: note || 'touched — still alive' }, opts);
}

// ── PURE: the resurface queue. Ideas whose lastTouched + revisitDays has passed, stalest first,
// each with staleDays computed. done/dropped never resurface. Eval-pinned. ──────────────────────────
export function resurfaceQueue(ideas = [], nowIso = new Date().toISOString()) {
  const now = Date.parse(nowIso);
  const out = [];
  for (const i of (Array.isArray(ideas) ? ideas : [])) {
    if (!i || CLOSED.has(i.status)) continue;
    const days = Number.isFinite(i.revisitDays) ? i.revisitDays : (REVISIT_DAYS[i.status] ?? null);
    if (days == null) continue;
    const touched = Date.parse(i.lastTouched || i.ts || '');
    if (!Number.isFinite(touched)) continue;
    if (touched + days * 86400 * 1000 < now) out.push({ ...i, staleDays: Math.floor((now - touched) / 86400000) });
  }
  out.sort((a, b) => b.staleDays - a.staleDays || String(a.title).localeCompare(String(b.title)));
  return out;
}

// Seed the vault — idempotent BY TITLE (re-running adds nothing that's already there).
export function seedIfEmpty(seedArray = SEED, { dir = DEFAULT_DIR } = {}) {
  const have = new Set(readIdeas({ dir }).map((i) => normTitle(i.title)));
  let added = 0, skipped = 0;
  for (const s of (Array.isArray(seedArray) ? seedArray : [])) {
    if (!s || !s.title || have.has(normTitle(s.title))) { skipped++; continue; }
    const r = addIdea({ ...s, source: s.source || 'seed' }, { dir });
    if (r.ok) { added++; have.add(normTitle(s.title)); } else skipped++;
  }
  return { added, skipped };
}

// ── PURE: render the calm human view — grouped by status (active first), stale ideas flagged,
// done/dropped collapsed to one-liners at the bottom. Eval-pinned. ──────────────────────────────────
const GROUPS = [
  ['active',  '🔥 Active — in motion'],
  ['new',     '✨ New — not yet weighed'],
  ['waiting', '⏳ Waiting — blocked on something'],
  ['parked',  '🧊 Parked — later, on purpose'],
];
export function renderMarkdown(ideas = [], now = new Date()) {
  const nowIso = (now instanceof Date ? now : new Date(now)).toISOString();
  const stale = new Map(resurfaceQueue(ideas, nowIso).map((i) => [i.id, i.staleDays]));
  const sections = [];
  for (const [status, heading] of GROUPS) {
    const group = ideas.filter((i) => i.status === status)
      .sort((a, b) => String(a.lastTouched || '').localeCompare(String(b.lastTouched || ''))); // most-neglected first
    if (!group.length) continue;
    const rows = group.map((i) => {
      const flag = stale.has(i.id) ? ` · ⚠ **resurfacing — ${stale.get(i.id)}d untouched**` : '';
      const tags = (i.tags || []).length ? ` · ${i.tags.map((t) => '#' + t).join(' ')}` : '';
      const last = (Array.isArray(i.log) ? i.log : []).slice(-1)[0];
      const meta = `touched ${String(i.lastTouched || '').slice(0, 10)}${tags}${last ? ` · last note: ${last.note}` : ''} · id ${i.id}`;
      return `- **${i.title}**${flag}\n  ${i.detail}\n  _${meta}_`;
    }).join('\n');
    sections.push(`## ${heading}\n\n${rows}`);
  }
  const closed = ideas.filter((i) => CLOSED.has(i.status))
    .sort((a, b) => String(b.lastTouched || '').localeCompare(String(a.lastTouched || '')))
    .map((i) => `- ~~${i.title}~~ _(${i.status} ${String(i.lastTouched || '').slice(0, 10)})_`).join('\n');
  if (closed) sections.push(`## 🗄 Done & dropped\n\n${closed}`);
  const open = ideas.filter((i) => !CLOSED.has(i.status)).length;
  return `# 💡 Idea Vault\n\n> No idea worth doing gets left behind — even in a coma. ${open} open idea${open === 1 ? '' : 's'}, ${stale.size} resurfacing. Ledger = ideas-vault/ideas.jsonl (append-only); this note is regenerated — don't hand-edit. Due queue: \`node pods/idea-vault.mjs due\` · keep one alive: \`touch <id> "note"\`.\n\n${sections.join('\n\n') || '_Vault is empty — run `node pods/idea-vault.mjs seed`._'}\n`;
}

// Write the human view into the Second Brain (same VAULT_DIR convention as control-plane/tasks.mjs).
export function writeVaultNote({ dir = DEFAULT_DIR, vaultDir = VAULT_DIR } = {}) {
  const ideas = readIdeas({ dir });
  const target = path.join(vaultDir, '00 - System');
  const file = path.join(target, '💡 Idea Vault.md');
  try { fs.mkdirSync(target, { recursive: true }); fs.writeFileSync(file, renderMarkdown(ideas)); return { ok: true, file, count: ideas.length }; }
  catch (e) { return { ok: false, error: e.message }; }
}

// ── the built-in seed: every idea currently at risk of being forgotten (2026-07-12 sweep) ───────────
export const SEED = [
  { title: 'Rodgate business credit journey (EIN-based, no PG)', detail: 'From no business credit to a trustworthy profile: DUNS/D&B PAYDEX, Nav monitoring, net-30 tradelines (Uline/Quill/Grainger), business card once bankable. Feeds the GovCon financing plan. Operator forgot this for weeks - the exact reason this vault exists.', tags: ['rodgate', 'finance', 'credit'], status: 'active' },
  { title: 'GovCon financing plan + SCORE mentor intake', detail: 'Per vault brief Cowork-Code Brief - GovCon Financing Plan.md: EIN credit building vs federal-AR factoring vs SBA surety bond guarantee vs 7(a)/CAPLine; then fill the SCORE mentor form from it. Personal credit is being rebuilt - not a lever right now.', tags: ['gov', 'finance'], status: 'active' },
  { title: 'LinkedIn page for Rodgate', detail: 'Company page vs personal profile refresh undecided. From vault note A LinkedIn page..md.', tags: ['rodgate', 'marketing'], status: 'new' },
  { title: 'Post-loss debrief agent (request a debrief on EVERY lost bid)', detail: 'From vault note dont request a debrief.md + GovCon Tier Ladder: debrief discipline separates tiers. Being built into pods/gov/capture.mjs - keep alive until it runs on a real loss.', tags: ['gov', 'capture'], status: 'active' },
  { title: 'Register Brother Crew as Rodgate sub-vendor', detail: 'Brothers crew (drywall/texture/finish/paint) fills the CRM gap for 561210 full-scope (paint/minor repair) - bid full facility-support scope without cold-recruiting. From Gov contracting.md 2026-07-04.', tags: ['gov', 'subs'], status: 'new' },
  { title: 'Adapt Lifeline risk-engine as bid-win probability scorer', detail: 'Domain-agnostic explainable scoring engine (weighted factors, confidence, HTTP) from Lifeline - Architecture - reuse as bid scorer. From Gov contracting.md 2026-07-03.', tags: ['gov', 'jarvis'], status: 'parked' },
  { title: 'Bad-reviews product play + AppSumo launch', detail: 'Find a successful product, mine its bad reviews for pain points, market the fix to competitors angry customers; consider AppSumo as launch channel. From Knowledge vs Action.md 2026-07-11.', tags: ['sidehustle'], status: 'parked' },
  { title: 'Jarvis on Alexa (voice front door)', detail: 'Talk to Jarvis through Alexa/Echo devices. Operator said later on.', tags: ['jarvis'], status: 'parked' },
  { title: 'Hermes full capability into Jarvis', detail: 'Wire the Hermes AI + its capabilities into Jarvis. Parked by operator 2026-06-30.', tags: ['jarvis'], status: 'parked' },
  { title: 'Board write-back (append-only)', detail: 'Concept approved 2026-07-09; agents write status back to the board, append-only.', tags: ['jarvis'], status: 'parked' },
  { title: 'Outreach-at-scale gated batch drafting', detail: 'Primes/subs daily batch, council pre-review, operator approves from phone. Never auto-send.', tags: ['gov', 'outreach'], status: 'parked' },
  { title: 'GOV_AUTO_SEND=1 decision', detail: 'Operator config call: make Approve actually send gov outreach instead of dry-run. Blocked on trusting the pipeline (see Telegram false-completion fix 2026-07-12).', tags: ['gov', 'config'], status: 'waiting' },
  { title: 'Fiverr: switch notification email + publish gigs', detail: 'Point Fiverr notifications at RodGateGroup@gmail.com so the order watcher sees orders; publish the gig gallery; land first sale. HELD until USACE submitted.', tags: ['fiverr'], status: 'waiting' },
  { title: 'Tax pod operator homework', detail: 'Set local EIT rate (pods/tax/entities.json); property basis + in-service dates; confirm whether Brick Ave LLC 1065s were ever filed (2024/2025).', tags: ['tax'], status: 'waiting' },
  { title: 'Migrate gov-scout + gov-inbox-watch to the always-on MacBook', detail: 'Both Cowork scheduled tasks run on the Windows PC only while the Claude app is open. Recipe: 00 - System/automation/gov-inbox-watch (Cowork scheduled task).md', tags: ['gov', 'infra'], status: 'new' },
  { title: 'Langfuse container deploy', detail: '3-env-var change + compose service, visual tracing. Shim already wired.', tags: ['jarvis', 'infra'], status: 'parked' },
];

// ── CLI: node pods/idea-vault.mjs [list|due|seed|touch <id> "note"|add "title :: detail :: tags"] ───
if (process.argv[1] && process.argv[1].endsWith('idea-vault.mjs')) {
  const [cmd, ...rest] = process.argv.slice(2);
  const fmt = (i, extra = '') => `  [${i.id}] ${i.title}${extra}`;
  if (!cmd || cmd === 'list') {
    const all = readIdeas({});
    for (const st of STATUSES) {
      const group = all.filter((i) => i.status === st);
      if (!group.length) continue;
      console.log(`${st.toUpperCase()} (${group.length})`);
      for (const i of group) console.log(fmt(i, ` — touched ${String(i.lastTouched || '').slice(0, 10)}`));
    }
    if (!all.length) console.log('Vault is empty — run: node pods/idea-vault.mjs seed');
  } else if (cmd === 'due') {
    const q = resurfaceQueue(readIdeas({}));
    if (!q.length) console.log('Nothing due — every open idea has been touched recently.');
    for (const i of q) console.log(fmt(i, ` — ${i.staleDays}d untouched (${i.status})`));
  } else if (cmd === 'seed') {
    const r = seedIfEmpty(SEED, {});
    const w = writeVaultNote({});
    console.log(JSON.stringify({ ...r, vaultNote: w }, null, 2));
  } else if (cmd === 'touch') {
    const [id, ...noteParts] = rest;
    const r = touchIdea(id, noteParts.join(' '), {});
    if (r.ok) try { writeVaultNote({}); } catch { /* best-effort */ }
    console.log(JSON.stringify(r.ok ? { ok: true, id: r.idea.id, title: r.idea.title, lastTouched: r.idea.lastTouched } : r, null, 2));
  } else if (cmd === 'add') {
    const [title, detail = '', tags = ''] = rest.join(' ').split(/\s*::\s*/);
    const r = addIdea({ title, detail, tags: tags.split(',') }, {});
    if (r.ok) try { writeVaultNote({}); } catch { /* best-effort */ }
    console.log(JSON.stringify(r, null, 2));
  } else {
    console.log('usage: node pods/idea-vault.mjs [list|due|seed|touch <id> "note"|add "title :: detail :: tag1,tag2"]');
  }
}
