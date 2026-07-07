// Tax document indexer — turn scattered files into a manifest organized by property/entity/kind, and
// rank likely receipts for a ledger entry. PURE core (this section) + a thin fs walk wrapper (below).
// READ-ONLY on the filesystem: name + stat only, never opens/moves/deletes/uploads a file (doctrine §2/§4).

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, emit } from '../lib.mjs';

const KIND_RULES = [
  [/receipt|invoice|order[_ ]?conf|order[_ ]?ack|purchase/i, 'receipt'],
  [/\bhud\b|alta|settlement/i, 'hud'],
  [/contract|agreement|\bpsa\b|assignment/i, 'contract'],
  [/policy|insurance|\beoi\b|coverage|\bdp3\b/i, 'insurance'],
  [/appraisal|valuation|\bcma\b|comparative[_ ]?market/i, 'appraisal'],
  [/permit/i, 'permit'],
  [/statement|1099|bank|liquidity/i, 'statement'],
  [/deed|title|owner[_ ]?policy/i, 'closing'],
];
export function classifyDoc(name, folderPath, registry) {
  const n = String(name || '');
  let kind = 'other';
  for (const [re, k] of KIND_RULES) if (re.test(n)) { kind = k; break; }
  const hay = String(folderPath || '').toLowerCase().replace(/\\/g, '/');
  let property = null, entity = null;
  for (const p of registry.properties || []) {
    const needles = [String(p.address || ''), ...(p.aliases || [])].map((s) => String(s).toLowerCase()).filter(Boolean);
    // match on the full address OR an alias that is specific enough (>=3 chars) to avoid false hits
    if (needles.some((s) => (s.length >= 3 || /^\d+$/.test(s)) && hay.includes(s))) { property = p.id; entity = p.entity; break; }
  }
  if (!entity) {
    if (/gov[-_ ]?draft|\bgov\b|rodgate|sam\b/i.test(hay)) entity = 'rodgate';
    else if (/fiverr|studio/i.test(hay)) entity = 'sidehustles';
  }
  return { kind, property, entity };
}

export function buildIndex(walkResult, registry) {
  return (walkResult || []).map((f) => {
    const c = classifyDoc(f.name, f.folder, registry);
    return { path: f.path, name: f.name, folder: f.folder, kind: c.kind, property: c.property,
      entity: c.entity, mtimeMs: f.mtimeMs || 0, sizeBytes: f.sizeBytes || 0 };
  });
}

const DAY = 86400000;
export function suggestDocs(entry, index, { withinDays = 30, limit = 5 } = {}) {
  if (!entry || !Array.isArray(index) || !index.length) return [];
  const amt = Number(entry.cents) > 0 ? (entry.cents / 100).toFixed(2) : null;
  const payeeTokens = String(entry.payee || '').toLowerCase().split(/\W+/).filter((t) => t.length >= 3);
  const entryMs = Date.parse(String(entry.dateISO || '') + 'T00:00:00Z');
  const scored = index.map((d) => {
    let score = 0;
    const nl = String(d.name || '').toLowerCase();
    if (entry.property && d.property === entry.property) score += 5;
    else if (entry.entity && d.entity === entry.entity) score += 3;
    else if (entry.entity && d.entity && d.entity !== entry.entity) score -= 2;
    if (payeeTokens.some((t) => nl.includes(t))) score += 3;
    if (amt && nl.includes(amt)) score += 4;
    if (Number.isFinite(entryMs) && d.mtimeMs && Math.abs(d.mtimeMs - entryMs) <= withinDays * DAY) score += 2;
    if (d.kind === 'receipt') score += 1;
    return { path: d.path, name: d.name, kind: d.kind, score };
  }).filter((d) => d.score > 0).sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

// ── thin fs wrapper (not eval-tested; evals stay pure) ──────────────────────────────────────────────
const SKIP_DIRS = new Set(['node_modules', '.git', '.tmp']);
const SKIP_FILES = new Set(['Thumbs.db']);
const IDIR = (dir) => dir || path.join(ROOT, 'tax-docs');
const MAX_DEPTH = 8;

function walkDir(root, dir, depth, out) {
  if (depth > MAX_DEPTH) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const ent of entries) {
    const name = ent.name;
    if (name.startsWith('.')) continue;
    const full = path.join(dir, name);
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(name)) continue;
      walkDir(root, full, depth + 1, out);
    } else if (ent.isFile()) {
      if (SKIP_FILES.has(name) || /\.(tmp|crdownload)$/i.test(name)) continue;
      let st;
      try { st = fs.statSync(full); } catch { continue; }
      out.push({ path: full, name, folder: dir, mtimeMs: st.mtimeMs, sizeBytes: st.size });
    }
  }
}

// Walk registry.docRoots (read-only: readdir + stat only — never opens/moves/deletes a file), build the
// index, and write it to tax-docs/index.json. A root that's missing/offline (e.g. the Z: network drive) is
// skipped with ok:false rather than crashing the whole reindex.
export async function indexDocs({ registry, dir } = {}) {
  const roots = [];
  const walkResult = [];
  for (const root of (registry && registry.docRoots) || []) {
    try {
      if (!fs.existsSync(root)) { roots.push({ root, ok: false, error: 'not found' }); continue; }
      const before = walkResult.length;
      walkDir(root, root, 0, walkResult);
      roots.push({ root, ok: true, count: walkResult.length - before });
    } catch (e) {
      roots.push({ root, ok: false, error: e.message });
    }
  }
  const docs = buildIndex(walkResult, registry);
  const d = IDIR(dir);
  fs.mkdirSync(d, { recursive: true });
  const builtAt = new Date().toISOString();
  fs.writeFileSync(path.join(d, 'index.json'), JSON.stringify({ builtAt, docs }, null, 2));
  await emit({ kind: 'action', actor: 'TAX-01', pod: 'exec', action: 'tax.docs.reindex',
    payload: { total: docs.length, roots } });
  return { roots, total: docs.length };
}

export function loadIndex(dir) {
  try {
    const raw = fs.readFileSync(path.join(IDIR(dir), 'index.json'), 'utf8');
    const parsed = JSON.parse(raw);
    return { builtAt: parsed.builtAt || null, docs: parsed.docs || [] };
  } catch { return { builtAt: null, docs: [] }; }
}
