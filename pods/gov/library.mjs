// library.mjs — Rodgate's PAST-PERFORMANCE & reusable-SNIPPET library. company.mjs holds canonical FACTS;
// this holds reusable PROSE (proposal sections that repeat every janitorial bid — QC plan, staffing,
// transition-in, safety) and the operator's real past-performance citations. Phase 4 (drafting) and the Bid
// Brief (Phase 7) call libraryFor(opp) to ground a proposal in real, curated content instead of generic AI text.
//
// Doctrine: retrieval is PURE + deterministic (tag/trade/NAICS overlap, eval-pinned) — CODE decides relevance,
// never the LLM. And it NEVER fabricates past performance (L-006): it returns only what the operator entered
// (or a stub from a real won disposition); an empty store returns [], never an invented citation.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inferTrade } from './pipeline.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const LIB_DIR = path.join(HERE, '..', '..', 'gov-library');
const SEED = path.join(LIB_DIR, 'snippets.seed.json');
const SNIPPETS = path.join(LIB_DIR, 'snippets.json');
const PASTPERF = path.join(LIB_DIR, 'past-performance.json');

const readJson = (p, fallback) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; } };
const clampNaics = (n) => String(n || '').replace(/[^0-9]/g, '').slice(0, 6);
const lc = (s) => String(s || '').toLowerCase();

// PURE: derive an opp's { trade, naics } for matching. Reuses pipeline.inferTrade (title → trade+NAICS);
// an explicit opp.naics wins over the inference.
export function inferTags(opp = {}) {
  const t = inferTrade(opp.title || '');
  const naics = clampNaics(opp.naics) || t.naics || '';
  return { trade: t.trade || '', naics };
}

// PURE: how relevant is a library item to an opp? exact NAICS (3) > trade match (2) > tag/topic overlap (1) > 0.
export function matchScore(item = {}, opp = {}) {
  const { trade, naics } = inferTags(opp);
  let score = 0;
  const itemNaics = Array.isArray(item.naics) ? item.naics.map(clampNaics) : [clampNaics(item.naics)];
  if (naics && itemNaics.includes(naics)) score += 3;
  const itemTrades = (Array.isArray(item.trade) ? item.trade : [item.trade]).map(lc).filter(Boolean);
  if (trade && itemTrades.includes(lc(trade))) score += 2;
  const hay = lc([...(item.tags || []), ...(item.topics || []), item.scope, item.title].filter(Boolean).join(' '));
  if (trade && hay.includes(lc(trade))) score += 1;
  return score;
}

// PURE: the past-performance records to cite for this opp — relevant first (matchScore desc), capped. If NONE
// match, fall back to the most-recent real records (some past performance beats none) — never a fabricated one.
export function pastPerformanceFor(records = [], opp = {}, { limit = 3 } = {}) {
  const list = Array.isArray(records) ? records.filter((r) => r && (r.title || r.agency)) : [];
  const scored = list.map((r) => ({ r, s: matchScore(r, opp) })).sort((a, b) => b.s - a.s);
  const relevant = scored.filter((x) => x.s > 0).map((x) => x.r);
  if (relevant.length) return relevant.slice(0, limit);
  // no tag match → most recent by periodEnd (string ISO sorts fine), still only REAL records
  return [...list].sort((a, b) => String(b.periodEnd || '').localeCompare(String(a.periodEnd || ''))).slice(0, limit);
}

const SECTION_ORDER = ['company-overview', 'quality-control-plan', 'staffing-plan', 'transition-in', 'safety-osha'];
// PURE: the reusable snippets for this opp — every `core` section, PLUS any non-core snippet whose trade/topics
// match the opp. Deduped by `key`, in a stable proposal order (known sections first, then the rest).
export function snippetsFor(snippets = [], opp = {}) {
  const seen = new Set();
  const out = [];
  for (const s of Array.isArray(snippets) ? snippets : []) {
    if (!s || !s.key || seen.has(s.key)) continue;
    if (s.core || matchScore(s, opp) > 0) { seen.add(s.key); out.push(s); }
  }
  return out.sort((a, b) => {
    const ai = SECTION_ORDER.indexOf(a.key), bi = SECTION_ORDER.indexOf(b.key);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });
}

// PURE: overlay runtime snippets on the seed — same `key` → the runtime (operator-edited) one wins. Eval-pinned.
export function mergeSnippets(seed = [], runtime = []) {
  const byKey = new Map();
  for (const s of Array.isArray(seed) ? seed : []) if (s && s.key) byKey.set(s.key, s);
  for (const s of Array.isArray(runtime) ? runtime : []) if (s && s.key) byKey.set(s.key, s);
  return [...byKey.values()];
}

// Load the merged library from disk. Never throws — a missing/corrupt runtime file degrades to the seed alone.
export function loadLibrary() {
  return { snippets: mergeSnippets(readJson(SEED, []), readJson(SNIPPETS, [])), pastPerformance: readJson(PASTPERF, []) };
}

// The one retrieval the UI + Phase 4 call: what to reuse for THIS opportunity.
export function libraryFor(opp = {}) {
  const { snippets, pastPerformance } = loadLibrary();
  return { pastPerformance: pastPerformanceFor(pastPerformance, opp), snippets: snippetsFor(snippets, opp) };
}

function nextId(prefix, list) { return `${prefix}-${Date.now().toString(36)}-${(list.length + 1)}`; }

// Append a past-performance record (best-effort, never throws). Returns the stored record (with id).
export function addPastPerformance(rec = {}) {
  try {
    const list = readJson(PASTPERF, []);
    const arr = Array.isArray(list) ? list : [];
    const stored = { id: rec.id || nextId('pp', arr), addedAt: new Date().toISOString(), ...rec };
    if (rec.id) { const i = arr.findIndex((x) => x.id === rec.id); if (i >= 0) arr[i] = { ...arr[i], ...stored }; else arr.push(stored); }
    else arr.push(stored);
    fs.mkdirSync(LIB_DIR, { recursive: true });
    fs.writeFileSync(PASTPERF, JSON.stringify(arr, null, 2));
    return stored;
  } catch (e) { return { error: e.message }; }
}

// Upsert a snippet override (best-effort). Returns the stored snippet.
export function addSnippet(snip = {}) {
  try {
    const list = readJson(SNIPPETS, []);
    const arr = Array.isArray(list) ? list : [];
    const stored = { id: snip.id || nextId('sn', arr), core: false, trade: [], topics: [], ...snip };
    const i = arr.findIndex((x) => x.key === stored.key);
    if (i >= 0) arr[i] = stored; else arr.push(stored);
    fs.mkdirSync(LIB_DIR, { recursive: true });
    fs.writeFileSync(SNIPPETS, JSON.stringify(arr, null, 2));
    return stored;
  } catch (e) { return { error: e.message }; }
}
