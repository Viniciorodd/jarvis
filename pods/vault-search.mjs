// vault-search.mjs — letting Jarvis actually READ the Second Brain, not just write to it.
//
// Operator, 2026-07-29: *"if we have our second brain in an obsidian vault, why cant jarvis not use that as a
// memory with the capability to write and read, create, move, organize, open, show and so on… when i sit down
// on my pc, i want to fill like tony stark, getting work done, having jarvis pull information for me."*
//
// Two things were missing, and neither was intelligence:
//   1. The vault was not in JARVIS_ROOTS, so every file tool refused it as outside the sandbox. Config, fixed.
//   2. There was NO content search anywhere. `scan`/`list_dir` show structure, `read_file` needs the exact
//      path — so "what do I know about X" was unanswerable. Jarvis could write into the vault and never read
//      back out of it. That is a filing cabinet, not a memory.
//
// This is the read half: grep-with-judgement over Markdown. Deterministic and rankable, so the model gets
// real excerpts to reason over instead of guessing what a note probably said. Pure functions are eval-pinned;
// only `searchVault` touches disk.

import fs from 'node:fs';
import path from 'node:path';

const SKIP_DIRS = new Set(['.obsidian', '.trash', '.smart-env', '.git', 'node_modules', '.jarvis-trash', '@eaDir']);

// PURE: split a query into meaningful terms. Short stopwords make everything match, so they are dropped.
const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'is', 'it', 'my', 'me', 'i', 'what', 'about', 'do', 'we', 'have', 'with', 'that', 'this']);
export function queryTerms(q = '') {
  if (q == null) return [];                                  // a default only covers undefined
  return String(q).toLowerCase().split(/[^a-z0-9'#$-]+/i).map((t) => t.trim()).filter((t) => t.length > 1 && !STOP.has(t));
}

// PURE: score one note against the terms. Title hits count for far more than body hits — in a personal vault
// the filename IS the subject, so "Ana medical" should surface "Ana — Medical.md" over a note that mentions
// her once in passing. Eval-pinned.
export function scoreNote({ name = '', text = '' }, terms = []) {
  if (!terms.length) return 0;
  const lname = name.toLowerCase(), ltext = text.toLowerCase();
  let score = 0, matched = 0;
  for (const t of terms) {
    const inName = lname.includes(t);
    const hits = ltext.split(t).length - 1;
    if (inName) score += 10;
    if (hits) score += Math.min(hits, 5);
    if (inName || hits) matched += 1;
  }
  if (!matched) return 0;
  // Every term present beats one term present many times — precision over volume.
  return score + (matched === terms.length ? 25 : 0) + matched * 3;
}

// PURE: the lines around the first real hit, so the model quotes the vault instead of paraphrasing from air.
export function excerptFor(text = '', terms = [], { radius = 1, max = 3 } = {}) {
  if (text == null) return [];
  const lines = String(text).split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length && out.length < max; i++) {
    const l = lines[i].toLowerCase();
    if (!terms.some((t) => l.includes(t))) continue;
    const chunk = lines.slice(Math.max(0, i - radius), i + radius + 1).join(' ').replace(/\s+/g, ' ').trim();
    if (chunk && !out.includes(chunk)) out.push(chunk.slice(0, 300));
  }
  return out;
}

// PURE: pick the note to OPEN for a name. Opening is a visible action, so the bar is far higher than for a
// search: a body-text match is not good enough. Live example (2026-08-01) — "zzz nonexistent note xyzzy"
// scored "📁 Book Notes" top, purely because the word "note" appears in it. Ranked search is supposed to
// always return its best guess; opening a wrong file and reporting success is the L-014 lie in a new costume.
//
// So a hit only qualifies if its TITLE earns it: an exact match after normalising, or a title containing
// every meaningful term. Anything else returns null plus candidates, so Jarvis can ask instead of guess.
const normName = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
export function pickNoteToOpen(query = '', results = []) {
  const list = Array.isArray(results) ? results : [];
  const terms = queryTerms(query);
  const wanted = normName(query);
  if (!wanted || !list.length) return { note: null, candidates: list.slice(0, 5).map((h) => h.name) };
  const exact = list.find((h) => normName(h.name) === wanted);
  if (exact) return { note: exact, exact: true, candidates: [] };
  const titled = list.find((h) => {
    const n = String(h.name || '').toLowerCase();
    return terms.length > 0 && terms.every((t) => n.includes(t));
  });
  if (titled) return { note: titled, exact: false, candidates: [] };
  return { note: null, candidates: list.slice(0, 5).map((h) => h.name) };
}

// I/O: walk the vault once and rank. Bounded on purpose — a personal vault is thousands of small files, and
// an unbounded read would stall the chat turn that is supposed to feel instant.
// Measured 2026-07-29 on the real Second Brain: 6,086 notes, ~2.5s for a COMPLETE scan. The old 4,000 default
// silently skipped 2,086 notes — i.e. it could answer "I don't know" about a note that exists, which is the
// worst possible failure for a memory. 20k leaves headroom as the vault grows; `capped` is reported so a
// future overflow is visible instead of quietly narrowing what Jarvis can remember.
export function searchVault(query, { vaultDir, limit = 6, maxFiles = 20000, maxBytes = 400000 } = {}) {
  const terms = queryTerms(query);
  if (!terms.length || !vaultDir) return { query, terms, results: [], scanned: 0, capped: false };
  const hits = [];
  let scanned = 0;
  const walk = (dir) => {
    if (scanned >= maxFiles) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (scanned >= maxFiles) return;
      if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      if (!e.name.toLowerCase().endsWith('.md')) continue;
      scanned += 1;
      let text = '';
      try { if (fs.statSync(full).size > maxBytes) continue; text = fs.readFileSync(full, 'utf8'); } catch { continue; }
      const score = scoreNote({ name: e.name, text }, terms);
      if (score > 0) hits.push({ file: full, name: e.name.replace(/\.md$/i, ''), score, excerpts: excerptFor(text, terms) });
    }
  };
  walk(vaultDir);
  hits.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return { query, terms, scanned, capped: scanned >= maxFiles, results: hits.slice(0, limit) };
}
