// price-to-win.mjs — the MARKET REFERENCE for a bid. pricing.mjs answers "what do I charge?" (sub quote ×
// markup). It CANNOT answer the only question that decides the award: "is that number competitive against
// what the government ACTUALLY paid for comparable work?" Bidding without that reference loses on price, or
// wins while leaving money on the table. This module pulls REAL comparable awards for the opportunity's NAICS
// (and place of performance) from the free, open USASpending.gov API (no key), reduces them to an honest
// distribution, and tells the operator where his bid sits in it.
//
// DOCTRINE (#1: the LLM proposes, CODE disposes of money): there is NO model anywhere near this math. The
// percentile / summary / verdict core is PURE, deterministic, and eval-pinned — a market read that could
// drift with a model's mood is worse than no market read at all.
//
// HONESTY is the other half of the contract. Federal award data is thin in narrow NAICS/state slices, and a
// median of three awards is not a market. confidenceOf() grades the sample, and every note the module emits
// refuses to imply precision a small sample cannot support. This module NEVER recommends a specific bid as a
// guarantee — it reports where the bid sits and how much to trust that.
//
// The network step mirrors spending.mjs: cached on disk with a TTL, best-effort, and it NEVER throws — any
// failure degrades to an empty sample (confidence 'none', position 'unknown'), so callers keep working offline.
//
// ── SAMPLING: we read the WHOLE POPULATION, not a slice. ─────────────────────────────────────────────
// USASpending's award search is paged and sorted, so a single page is the LARGEST 100 awards in the lane —
// a distribution whose median skews high enough to call a normal small-business bid "below-market." Real
// lanes are small (561720 in PA over 3 FYs = 281 contracts), so we don't sample at all:
//   1. COUNT first (/spending_by_award_count/, same filters) → the true population N.
//   2. N <= PTW_MAX_AWARDS (default 1000, clamp 100–5000) → paginate every page → `complete: true`.
//      Exact, unbiased percentiles. NO skew caveat on this path — it would be a lie.
//   3. N > the cap → we refuse to guess: `complete: false` FORCES position 'unknown' + percentileOfBid null
//      with "narrow the lane." The stats we did fetch are returned, labeled a top-slice. An honest 'unknown'
//      beats a confident wrong number — the whole point of this module is to not mislead a real bid.
//   4. The count call fails → degrade to the old single-page read WITH the skew disclosure.
//
//   node pods/gov/price-to-win.mjs 561720 PA 61000
// Companion: GET /api/gov/price-to-win?noticeId=&bid=

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { lastCompleteFY } from './spending.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(HERE, '.ptw-cache.json'); // gitignored — regenerated, refreshed on a TTL
const TTL_MS = (Number(process.env.PTW_TTL_HOURS) || 24) * 36e5;
const API = 'https://api.usaspending.gov/api/v2/search/spending_by_award/';
const COUNT_API = 'https://api.usaspending.gov/api/v2/search/spending_by_award_count/';
const PAGE = 100; // USASpending's max page size
// How many awards we're willing to pull before we stop pretending we can read the lane. Default 1000 = 10
// pages; clamped so a typo can't trigger a 500-page crawl or shrink the read to nothing.
const maxAwards = () => Math.min(5000, Math.max(100, Number(process.env.PTW_MAX_AWARDS) || 1000));

// ── PURE: linear-interpolation percentile over an ASCENDING-sorted array of numbers ─────────────────
// p in 0..100. Empty → null (no data is not zero). Single value → that value (one award has no spread).
export function percentile(sortedNums, p) {
  const a = Array.isArray(sortedNums) ? sortedNums : [];
  if (!a.length) return null;
  if (a.length === 1) return a[0];
  const q = Math.min(100, Math.max(0, Number(p) || 0));
  const idx = ((a.length - 1) * q) / 100;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return a[lo];
  return a[lo] + (a[hi] - a[lo]) * (idx - lo); // linear interpolation between the bracketing awards
}

// ── PURE: the honest shape of a comparable-award sample. Junk (0, negative, NaN, non-numeric) is filtered
// out FIRST — a $0 "award" row would drag a median toward a price no one could ever bid. ───────────────
export function summarizeAwards(amounts) {
  const clean = (Array.isArray(amounts) ? amounts : [])
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
  const n = clean.length;
  if (!n) return { n: 0, min: null, p25: null, median: null, p75: null, max: null, mean: null };
  const round = (v) => (v == null ? null : Math.round(v * 100) / 100);
  return {
    n,
    min: round(clean[0]),
    p25: round(percentile(clean, 25)),
    median: round(percentile(clean, 50)),
    p75: round(percentile(clean, 75)),
    max: round(clean[n - 1]),
    mean: round(clean.reduce((s, v) => s + v, 0) / n),
  };
}

// ── PURE: how much this sample is worth trusting. A small sample MUST NOT imply precision. ─────────────
export function confidenceOf(n) {
  const c = Number(n) || 0;
  if (c <= 0) return 'none';
  if (c < 5) return 'low';
  if (c < 20) return 'medium';
  return 'high';
}

const money = (n) => '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
// Compact money for one-liners: $86k / $1.2M.
const kfmt = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (v >= 1e3) return '$' + Math.round(v / 1e3) + 'k';
  return money(v);
};
const ord = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

// ── PURE: the "aim here to be competitive" band — p25..median. Deliberately the LOWER half of the market:
// the p25→median window is where a small business wins on price without bidding underwater. Nulls when
// there is no sample (an invented band is worse than an admitted blank). ──────────────────────────────
export function targetRange(stats) {
  const s = stats || {};
  if (!s.n) return { low: null, high: null };
  return { low: s.p25, high: s.median };
}

// ── PURE: where does THIS bid sit against the market? Deterministic bands, no model, no vibes. ─────────
// position: 'unknown' (no sample, no usable bid, or an incomplete/biased sample) | 'below-market' (< p25) |
// 'competitive' (p25..p75) | 'above-market' (> p75). percentileOfBid = the share of comparable awards at or
// below the bid (0..100). `complete` = did we read the WHOLE population? When false the sample is the top
// slice and its percentiles are biased HIGH — so we refuse to emit a position at all. Defaults true so
// callers holding a genuine full sample (and the eval fixtures) read naturally.
//
// The gate is `overCap`, NOT `complete`: "we know this lane is too big to read" is a different (and worse)
// state than "we couldn't confirm the population." The first must refuse to answer; the second falls back to
// the legacy read-with-disclosure. Conflating them would silence honest reads during a count outage.
export function priceToWinVerdict({ bid, stats, overCap = false, population = null } = {}) {
  const s = stats || {};
  const b = Number(bid);
  const confidence = confidenceOf(s.n || 0);
  if (!s.n) {
    return { position: 'unknown', percentileOfBid: null, confidence, note: 'No comparable federal awards found for this NAICS/state window — there is no market reference here. Price from your own cost basis and treat the bid as unvalidated.' };
  }
  // A biased sample must not produce a confident answer. We know the population is too big to read, so the
  // ONLY honest output is "I can't tell you" + how to make the lane readable.
  if (overCap === true) {
    const n = Number(population);
    return { position: 'unknown', percentileOfBid: null, confidence, note: `${Number.isFinite(n) && n > 0 ? n.toLocaleString('en-US') : 'This many'} comparable awards is too many to sample reliably — narrow the lane (agency or sub-scope) for a real price read. The figures shown are the largest ${s.n} awards only, so their median skews high; no position is reported because any position from this slice would be wrong.` };
  }
  if (!Number.isFinite(b) || b <= 0) {
    return { position: 'unknown', percentileOfBid: null, confidence, note: `Comparable awards found (n=${s.n}, median ${money(s.median)}), but no bid was supplied to compare — set a bid to see where it lands.` };
  }
  // Share of comparable awards at or below the bid. Uses the summary's own boundaries so the verdict and
  // the percentile can never disagree; computed from the sample the caller already filtered.
  const pct = percentOfSampleAtOrBelow(s, b);
  const position = b < s.p25 ? 'below-market' : b > s.p75 ? 'above-market' : 'competitive';
  const band = `${money(s.p25)}–${money(s.p75)}`;
  const base = position === 'below-market'
    ? `Your ${money(b)} bid is under the ${band} middle of the market — likely price-competitive, but check the scope: coming in low against real awards usually means you are pricing less work than they bought, or squeezing your own margin.`
    : position === 'above-market'
      ? `Your ${money(b)} bid is above the ${band} middle of the market — expect to lose on price unless the solicitation is best-value and you can prove the difference.`
      : `Your ${money(b)} bid sits inside the ${band} middle of the market — competitive on price against what was actually paid.`;
  const caveat = confidence === 'low'
    ? ` ⚠ Only ${s.n} comparable award${s.n === 1 ? '' : 's'} — the sample is too small to be reliable; treat this as a rough hint, not a market read.`
    : confidence === 'medium'
      ? ` Sample is ${s.n} awards — indicative, not definitive.`
      : '';
  return { position, percentileOfBid: pct, confidence, note: base + caveat + ' This is a market reference, not a recommended bid — no number here is a guarantee of winning.' };
}

// PURE helper: the bid's rank in the distribution, reconstructed deterministically from the summary's
// order statistics (min/p25/median/p75/max) by linear interpolation between the known breakpoints.
function percentOfSampleAtOrBelow(s, b) {
  const pts = [[s.min, 0], [s.p25, 25], [s.median, 50], [s.p75, 75], [s.max, 100]].filter(([v]) => Number.isFinite(v));
  if (!pts.length) return null;
  if (b <= pts[0][0]) return pts[0][0] === b ? Math.round(pts[0][1]) : 0;
  if (b >= pts[pts.length - 1][0]) return 100;
  for (let i = 1; i < pts.length; i++) {
    const [v0, p0] = pts[i - 1], [v1, p1] = pts[i];
    if (b <= v1) {
      if (v1 === v0) return Math.round(p1);
      return Math.round(p0 + ((p1 - p0) * (b - v0)) / (v1 - v0));
    }
  }
  return 100;
}

// ── PURE: one plain-English line for a proposal / the Deal Room card. Honest about a thin sample. ─────
export function priceToWinLine(res) {
  const r = res || {};
  if (!r.ok) return `Price-to-win unavailable${r.reason ? ' — ' + r.reason : ''}.`;
  const s = r.stats || {};
  const where = r.state ? `${r.state} ` : '';
  if (!s.n) return `No comparable ${where}${r.naics || ''} federal awards found — no market reference for this bid.`;
  // The lane is too big to read → do NOT lead with a median that isn't one. Say what's wrong and how to fix it.
  if (r.overCap) {
    return `${(Number(r.population) || 0).toLocaleString('en-US')} comparable ${where}${r.naics} awards — too many to sample reliably, so no price read is offered. Narrow the lane (agency or sub-scope) for a real one. This is a market reference, not a recommended bid.`;
  }
  const tr = r.targetRange || {};
  const band = tr.low != null ? `${kfmt(tr.low)}–${kfmt(tr.high)}` : '—';
  const v = r.verdict || {};
  const head = `Comparable ${where}${r.naics} awards (n=${s.n}): median ${kfmt(s.median)}, competitive band ${band}`;
  const tail = v.percentileOfBid == null
    ? ' — no bid supplied to compare.'
    : ` — your ${kfmt(r.bid)} bid sits at the ${ord(v.percentileOfBid)} percentile (${v.position}).`;
  const warn = r.confidence === 'low' ? ` ⚠ only ${s.n} award${s.n === 1 ? '' : 's'} — sample too small to be reliable.` : '';
  // Only a genuinely biased slice gets the skew caveat. On the full-population path it would be FALSE, and a
  // false hedge is its own kind of dishonesty — it teaches the operator to discount a number that is exact.
  const bias = (!r.complete && r.truncated) ? ` ⚠ sample is the largest ${s.n} awards in the lane, not the whole market — the median skews high.` : '';
  return head + tail + warn + bias + ' Market reference, not a recommended bid.';
}

// ── best-effort IO: the on-disk cache (mirrors spending.mjs — regenerated, TTL'd, never fatal) ────────
function readCache() { try { return JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch { return null; } }
function writeCache(db) { try { fs.writeFileSync(CACHE, JSON.stringify(db)); } catch { /* cache is a nicety */ } }

// PURE: the trailing `years` COMPLETE federal fiscal years (reuses spending.mjs's FY window rule).
export function fyWindow(years = 3, now = new Date()) {
  const fy = lastCompleteFY(now);
  const endYear = Number(fy.end.slice(0, 4));
  const n = Math.max(1, Math.min(10, Number(years) || 3));
  return { start: `${endYear - n}-10-01`, end: fy.end, years: n, label: `FY${endYear - n + 1}–FY${endYear}` };
}

// PURE: the shared filter block — the COUNT call and the award search MUST use identical filters, or the
// population we page against isn't the population we counted.
function buildFilters(code, st, win) {
  const filters = {
    award_type_codes: ['A', 'B', 'C', 'D'],
    naics_codes: [code],
    time_period: [{ start_date: win.start, end_date: win.end }],
  };
  if (st) filters.place_of_performance_locations = [{ country: 'USA', state: st }];
  return filters;
}

const postJson = (url, body, ms = 30000) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(ms) });

// ── best-effort network: the TRUE population size for a lane (contract awards only). null = couldn't tell,
// which is different from 0 (a real, empty lane). Callers degrade to single-page sampling on null. ────────
export async function countPopulation({ naics, state, years = 3 } = {}) {
  const code = String(naics || '').trim();
  if (!code) return null;
  const st = String(state || '').trim().toUpperCase();
  try {
    const r = await postJson(COUNT_API, { filters: buildFilters(code, st, fyWindow(years)) }, 20000);
    if (!r.ok) return null;
    const d = await r.json();
    const n = Number((d.results || {}).contracts);
    return Number.isFinite(n) && n >= 0 ? n : null;
  } catch { return null; }
}

const mapAward = (x) => ({ awardId: x['Award ID'] || '', recipient: x['Recipient Name'] || '', amount: Number(x['Award Amount']), date: x['Start Date'] || '' });
const usableAward = (a) => Number.isFinite(a.amount) && a.amount > 0;

// ── best-effort network: REAL comparable awards from USASpending. NEVER throws — any failure returns an
// empty sample with a source of 'error: …' so every caller degrades to "no market reference" honestly.
// Returns { amounts, awards, population, complete, truncated, source }. `complete` is the load-bearing
// flag: true = we read EVERY award in the lane and the percentiles are exact; false = biased top-slice. ──
export async function fetchComparableAwards({ naics, state, years = 3, limit = PAGE, force = false } = {}) {
  const code = String(naics || '').trim();
  const st = String(state || '').trim().toUpperCase();
  if (!code) return { amounts: [], awards: [], population: null, complete: false, truncated: false, source: 'error: naics required' };
  const key = `${code}|${st}|${years}`;
  const db = readCache() || {};
  if (!force) {
    const hit = db[key];
    if (hit && Date.now() - (hit.fetchedAt || 0) < TTL_MS) {
      return { amounts: hit.amounts || [], awards: hit.awards || [], population: hit.population ?? null, complete: !!hit.complete, overCap: !!hit.overCap, truncated: !!hit.truncated, source: hit.source || 'usaspending (cached)', cached: true };
    }
  }
  const win = fyWindow(years);
  const filters = buildFilters(code, st, win);
  const where = st ? ' · ' + st : ' · nationwide';
  const pageBody = (page, lim) => ({ filters, fields: ['Award ID', 'Recipient Name', 'Award Amount', 'Start Date'], page, limit: lim, sort: 'Award Amount', order: 'desc' });

  // 1) How big is this lane, really? Best-effort — null means "couldn't tell", not "empty".
  const population = await countPopulation({ naics: code, state: st, years });
  const cap = maxAwards();

  // 2) An empty lane is a real, honest answer — no need to page anything.
  if (population === 0) {
    const out = { amounts: [], awards: [], population: 0, complete: true, overCap: false, truncated: false, source: `usaspending ${win.label}${where} · full population (0 awards)` };
    db[key] = { fetchedAt: Date.now(), ...out }; writeCache(db);
    return out;
  }

  // 3) Small enough to read in full → page the ENTIRE population. Exact percentiles, no skew, no caveat.
  if (population != null && population <= cap) {
    const awards = [];
    const pages = Math.ceil(population / PAGE);
    for (let page = 1; page <= pages; page++) {
      let d;
      try {
        const r = await postJson(API, pageBody(page, PAGE));
        if (!r.ok) return staleOr(db, key, `error: USASpending HTTP ${r.status}`);
        d = await r.json();
      } catch (e) { return staleOr(db, key, `error: ${e.message}`); }
      const rows = d.results || [];
      for (const x of rows.map(mapAward).filter(usableAward)) awards.push(x);
      // Stop early when the API says there's nothing after this page (or hands back an empty one).
      if (!rows.length || ((d.page_metadata || {}).hasNext === false)) break;
    }
    const out = {
      amounts: awards.map((a) => a.amount), awards, population, complete: true, overCap: false, truncated: false,
      source: `usaspending ${win.label}${where} · full population (${population} award${population === 1 ? '' : 's'}, ${win.years} FYs)`,
    };
    db[key] = { fetchedAt: Date.now(), ...out }; writeCache(db);
    return out;
  }

  // 4) Either the lane is too big to read honestly (population > cap), or the COUNT call failed (null) and
  //    we fall back to the legacy single-page read. These degrade DIFFERENTLY, on purpose:
  //      • over cap → we KNOW the slice is biased → `overCap: true` makes the verdict refuse a position.
  //      • count unavailable → we don't know the population. If page 1 came back short, there is no page 2,
  //        so that IS the whole lane (complete, unbiased). If it came back FULL, it's a biased slice and we
  //        keep the legacy behaviour: report the position, but disclose the skew loudly.
  const lim = Math.max(1, Math.min(PAGE, Number(limit) || PAGE));
  let awards = [];
  try {
    const r = await postJson(API, pageBody(1, lim));
    if (!r.ok) return staleOr(db, key, `error: USASpending HTTP ${r.status}`);
    const d = await r.json();
    awards = (d.results || []).map(mapAward).filter(usableAward);
  } catch (e) { return staleOr(db, key, `error: ${e.message}`); }
  const overCap = population != null && population > cap;
  const pageFull = awards.length >= lim;
  const complete = !overCap && !pageFull;  // a short page with no count = the entire lane, exactly read
  const truncated = overCap || pageFull;
  const why = overCap ? `${population} awards exceeds the ${cap} read cap` : 'award count unavailable';
  const out = {
    amounts: awards.map((a) => a.amount), awards, population, complete, overCap, truncated,
    source: `usaspending ${win.label}${where} · ${complete ? `full population (${awards.length} award${awards.length === 1 ? '' : 's'}, ${win.years} FYs)` : `${why} — top ${awards.length} by amount (skews high)`}`,
  };
  db[key] = { fetchedAt: Date.now(), ...out }; writeCache(db);
  return out;
}

// A stale cache entry beats no market reference at all — but say so. Otherwise: an honest empty sample.
function staleOr(db, key, source) {
  const hit = db && db[key];
  if (hit && (hit.amounts || []).length) return { amounts: hit.amounts, awards: hit.awards || [], population: hit.population ?? null, complete: !!hit.complete, overCap: !!hit.overCap, truncated: !!hit.truncated, source: (hit.source || 'usaspending') + ' (stale cache)', stale: true };
  return { amounts: [], awards: [], population: null, complete: false, overCap: false, truncated: false, source };
}

// ── best-effort orchestrator: op → comparable awards → distribution → verdict. NEVER throws. ──────────
export async function priceToWin(op = {}, { bid = null, force = false } = {}) {
  try {
    const o = typeof op === 'string' ? { naics: op } : (op || {});
    const naics = String(o.naics || o.naicsCode || '').trim();
    const state = String(o.placeState || o.state || '').trim().toUpperCase();
    if (!naics) return { ok: false, reason: 'no NAICS on this opportunity — cannot find comparable awards', naics: null, state: state || null, bid: Number(bid) || null, stats: summarizeAwards([]), confidence: 'none', population: null, complete: false, overCap: false, truncated: false, verdict: priceToWinVerdict({ bid, stats: summarizeAwards([]) }), targetRange: { low: null, high: null }, sampleAwards: [], source: 'none' };
    const { amounts, awards, source, truncated, complete, overCap, population } = await fetchComparableAwards({ naics, state, force });
    const stats = summarizeAwards(amounts);
    const confidence = confidenceOf(stats.n);
    const b = Number(bid);
    return {
      ok: true,
      naics,
      state: state || null,
      bid: Number.isFinite(b) && b > 0 ? b : null,
      stats,
      confidence,
      population: population ?? null,
      complete: !!complete,
      overCap: !!overCap,
      truncated: !!truncated,
      verdict: priceToWinVerdict({ bid, stats, overCap: !!overCap, population }),
      targetRange: targetRange(stats),
      sampleAwards: (awards || []).slice(0, 5).map((a) => ({ recipient: a.recipient, amount: a.amount, date: a.date })),
      source,
    };
  } catch (e) {
    const stats = summarizeAwards([]);
    return { ok: false, reason: e.message, naics: null, state: null, bid: null, stats, confidence: 'none', population: null, complete: false, overCap: false, truncated: false, verdict: priceToWinVerdict({ bid: null, stats }), targetRange: { low: null, high: null }, sampleAwards: [], source: `error: ${e.message}` };
  }
}

// ── CLI: node pods/gov/price-to-win.mjs <naics> [state] [bid] [--force] — read-only, nothing sent. ────
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const args = process.argv.slice(2).filter((a) => a !== '--force');
  const [naics, state, bid] = args;
  if (!naics) { console.error('usage: node pods/gov/price-to-win.mjs <naics> [state] [bid] [--force]'); process.exit(1); }
  const r = await priceToWin({ naics, placeState: state && /^[A-Za-z]{2}$/.test(state) ? state : '' }, { bid: bid != null ? Number(bid) : null, force: process.argv.includes('--force') });
  console.log(`\nPrice-to-win — NAICS ${naics}${r.state ? ' · ' + r.state : ' · nationwide'}`);
  console.log(`  source: ${r.source}`);
  if (r.population != null) console.log(`  population: ${r.population} award(s) in the lane · read ${r.complete ? 'IN FULL (exact percentiles)' : 'PARTIALLY (biased slice)'}`);
  const s = r.stats || {};
  if (!s.n) { console.log('  no comparable awards — no market reference.'); }
  else {
    console.log(`  n=${s.n} (confidence: ${r.confidence})   min ${money(s.min)} · p25 ${money(s.p25)} · median ${money(s.median)} · p75 ${money(s.p75)} · max ${money(s.max)}`);
    console.log(`  competitive target band: ${money(r.targetRange.low)}–${money(r.targetRange.high)}`);
    for (const a of r.sampleAwards) console.log(`    ${money(a.amount).padStart(14)}  ${String(a.date).slice(0, 10)}  ${a.recipient}`);
  }
  console.log(`\n  ${priceToWinLine(r)}`);
  if (r.verdict && r.verdict.note) console.log(`  ${r.verdict.note}\n`);
}
