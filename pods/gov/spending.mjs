// spending.mjs — the "Agency Spending Map" data feed from the GovCon OS vision. Pulls REAL federal
// obligations by state for the operator's NAICS (janitorial / facilities / grounds) from the free, open
// USASpending.gov API (no key), so the dashboard can show where the money in our space actually is.
// Cached with a TTL (this data moves slowly). LLM-free; pure deterministic shaping (doctrine #1).
//
//   node pods/gov/spending.mjs            # print the top states
//   node pods/gov/spending.mjs --force    # bypass cache
// Companion: GET /api/gov/spending.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(HERE, '.spending-cache.json');
const NAICS = (process.env.SPENDING_NAICS || '561720,561210,561730,561990').split(',').map((s) => s.trim()).filter(Boolean);
const TTL_MS = (Number(process.env.SPENDING_TTL_DAYS) || 7) * 864e5;
const API = 'https://api.usaspending.gov/api/v2/search/spending_by_geography/';

// ── PURE: the most recent COMPLETE federal fiscal year window (FY = Oct 1 .. Sep 30) ────────────────
export function lastCompleteFY(now = new Date()) {
  const y = now.getFullYear(), m = now.getMonth(); // 0=Jan
  const endYear = m >= 9 ? y : y - 1; // on/after Oct → FY ended this Sep 30; else last year's
  return { start: `${endYear - 1}-10-01`, end: `${endYear}-09-30`, label: `FY${endYear}` };
}

// ── PURE: area-proportional bubble radius (sqrt so a 4× amount looks 2× wide, not 4×) ───────────────
export function bubbleR(amount, max, minR = 4, maxR = 26) {
  if (!max || amount <= 0) return 0;
  return +(minR + (maxR - minR) * Math.sqrt(amount / max)).toFixed(1);
}

// ── PURE: top-N states by amount ────────────────────────────────────────────────────────────────────
export function topStates(results, n = 6) {
  return (results || []).filter((s) => s.amount > 0).sort((a, b) => b.amount - a.amount).slice(0, n);
}

function readCache() { try { return JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch { return null; } }

// ── fetch (cached) federal spending-by-state for our NAICS ──────────────────────────────────────────
export async function getSpending({ force = false } = {}) {
  if (!force) { const c = readCache(); if (c && Date.now() - c.fetchedAt < TTL_MS) return c; }
  const fy = lastCompleteFY();
  const body = { scope: 'place_of_performance', geo_layer: 'state', filters: { time_period: [{ start_date: fy.start, end_date: fy.end }], naics_codes: NAICS } };
  let results = null;
  try {
    const r = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
    if (r.ok) { const d = await r.json(); results = (d.results || []).filter((x) => x.aggregated_amount > 0).map((x) => ({ state: x.shape_code, name: x.display_name, amount: Math.round(x.aggregated_amount) })).sort((a, b) => b.amount - a.amount); }
  } catch { /* offline → fall back to stale cache below */ }
  if (!results) { const stale = readCache(); if (stale) return { ...stale, stale: true }; return { fetchedAt: Date.now(), period: fy.label, naics: NAICS, results: [], error: 'usaspending unavailable' }; }
  const out = { fetchedAt: Date.now(), period: fy.label, naics: NAICS, total: results.reduce((s, r) => s + r.amount, 0), results };
  try { fs.writeFileSync(CACHE, JSON.stringify(out)); } catch { /* */ }
  return out;
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────────────
if (process.argv[1] && process.argv[1].endsWith('spending.mjs')) {
  getSpending({ force: process.argv.includes('--force') }).then((d) => {
    console.log(`Federal spending · ${d.period} · NAICS ${d.naics.join(',')} · ${d.results.length} states${d.stale ? ' (stale cache)' : ''}`);
    for (const s of topStates(d.results, 10)) console.log('  ' + s.state.padEnd(3), (s.name || '').padEnd(16), '$' + s.amount.toLocaleString());
  }).catch((e) => { console.error(e); process.exit(1); });
}
