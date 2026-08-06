// baseline.mjs — what he has actually published, made usable by the loop.
//
// Item 4: fold the 897 seeded rows into something the strategy rewrite can read. Without this the
// first analysis learns from nothing, which is the failure the Rogoff teardown describes on camera.
//
// 🚨 AND THE REASON THIS IS A MODULE RATHER THAN A ONE-LINER. The seeded corpus is misleading if you
// query it naively:
//
//   520 of 897 posts are from the Twitter-agency era
//   12 are on his current domain
//   his highest-reach posts are income and traction claims the guard now blocks
//
// So "what worked?" answered against the whole archive returns "Twitter growth content in 2023" —
// confidently, with real numbers behind it, and wrong in a way that would quietly steer every draft
// the producer writes. Every function here therefore reports the SIZE and SHAPE of the slice it used,
// and `profile()` refuses to hand back a voice profile built on too few posts.
//
// Nothing in this file costs money. It reads files that already exist.
//
// PURE except loadBaseline(). Eval-pinned.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
export const FEATURES_DIR = path.join(ROOT, 'brand-features');

// A slice smaller than this cannot describe how a man writes. Twelve on-domain posts across eight
// years is an anecdote, and calling it a baseline would launder it into a fact.
export const MIN_SLICE = 30;

// ⚠ null and '' must NOT become 0 here. `Number(null)` is 0 and it is finite, so the obvious
// one-liner turns "never measured" into "measured zero" — the exact confusion this pod keeps having
// to defend against. Caught by an eval rather than by me.
const num = (v) => (v === null || v === undefined || v === '' ? null : (Number.isFinite(Number(v)) ? Number(v) : null));
const med = (xs) => {
  const s = xs.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round(((s[m - 1] + s[m]) / 2) * 10) / 10;
};
const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null);

// PURE: cut the corpus down to the rows a question is actually about.
//
// Defaults are the CONSERVATIVE ones — publishable today, his own words — because the common mistake
// is asking the whole archive and believing the answer.
export function slice(rows = [], {
  publishableOnly = true,
  onDomain = false,
  era = null,
  excludeQuotes = true,
  since = null,
} = {}) {
  return (Array.isArray(rows) ? rows : []).filter((r) => {
    if (!r) return false;
    if (publishableOnly && r.publishable_today === false) return false;
    if (onDomain && !r.on_domain) return false;
    if (era && r.era !== era) return false;
    if (excludeQuotes && (r.is_quote || r.is_thin)) return false;
    if (since && String(r.date || '') < since) return false;
    return true;
  });
}

// PURE: the measured shape of a slice. This is the thing a producer should be compared against —
// and it comes back with `enough:false` rather than a confident profile when the slice is too thin.
export function profile(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  const n = list.length;
  const base = { n, enough: n >= MIN_SLICE };
  if (!n) return { ...base, note: 'no posts in this slice' };
  const formats = {};
  for (const r of list) formats[r.format || 'unknown'] = (formats[r.format || 'unknown'] || 0) + 1;
  return {
    ...base,
    note: n >= MIN_SLICE ? '' : `only ${n} posts — too few to describe how he writes (need ${MIN_SLICE})`,
    median_line_count: med(list.map((r) => num(r.line_count))),
    median_sentence_words: med(list.map((r) => num(r.median_sentence_words))),
    median_word_count: med(list.map((r) => num(r.word_count))),
    starts_capital_pct: pct(list.filter((r) => r.starts_capital).length, n),
    em_dash_posts: list.filter((r) => (num(r.em_dashes) || 0) > 0).length,
    has_link_pct: pct(list.filter((r) => r.has_link).length, n),
    has_emoji_pct: pct(list.filter((r) => r.has_emoji).length, n),
    second_person_pct: pct(list.filter((r) => r.second_person).length, n),
    formats,
  };
}

// PURE: engagement summary for a slice.
//
// Reported, never RANKED ON. features.score() refuses to rank without audience composition and this
// keeps that promise: these are counts he can look at, not a target the loop optimises toward. The
// whole departure from the source material is that reach is not the goal.
export function reach(rows = []) {
  const list = (Array.isArray(rows) ? rows : []).filter((r) => r && num(r.reactions) !== null);
  if (!list.length) return { n: 0, median: null, best: null, note: 'no recorded engagement in this slice' };
  const totals = list.map((r) => (num(r.reactions) || 0) + (num(r.shares) || 0));
  const bestIdx = totals.indexOf(Math.max(...totals));
  return {
    n: list.length,
    median: med(totals),
    best: { date: list[bestIdx].date, engagement: totals[bestIdx], hook: String(list[bestIdx].hook || '').slice(0, 80) },
    // Deliberately no "top 10 to imitate". See the header.
    note: 'counts only — composition is unknown, so nothing here is a ranking',
  };
}

// PURE: how does a fresh draft compare to what he has actually published?
//
// Notes, not a score. The producer already has hard voice rules in features.voiceDrift(); this is the
// softer question of whether a draft looks like his body of work, and it says so in sentences rather
// than a number, because a number here would get optimised against.
export function compareToBaseline(f = {}, prof = null) {
  const out = [];
  if (!prof || !prof.enough) {
    out.push('no usable baseline yet — ' + ((prof && prof.note) || 'nothing to compare against'));
    return { notes: out, comparable: false };
  }
  const lc = num(f.line_count), ml = num(prof.median_line_count);
  if (lc !== null && ml !== null && lc > ml * 2.5) out.push(`${lc} lines; he usually writes about ${ml}`);
  const sw = num(f.median_sentence_words), ms = num(prof.median_sentence_words);
  if (sw !== null && ms !== null && sw > ms + 4) out.push(`sentences run ${sw} words; his median is ${ms}`);
  if (f.has_emoji && (prof.has_emoji_pct || 0) < 5) out.push('has emoji; almost none of his posts do');
  if (f.has_link && (prof.has_link_pct || 0) < 10) out.push('has a link; he rarely posts one');
  return { notes: out, comparable: true };
}

// PURE: the honest header for any surface that shows baseline numbers.
//
// Exists so a dashboard cannot quote "897 posts analysed" without also saying what those posts were.
// That sentence is true and, on its own, misleading.
export function provenance(all = []) {
  const rows = Array.isArray(all) ? all : [];
  const usable = slice(rows, { onDomain: true });
  const eras = rows.reduce((a, r) => { a[r.era || '?'] = (a[r.era || '?'] || 0) + 1; return a; }, {});
  return {
    total: rows.length,
    eras,
    onDomain: rows.filter((r) => r.on_domain).length,
    usable: usable.length,
    blocked: rows.filter((r) => r.publishable_today === false).length,
    trustworthy: usable.length >= MIN_SLICE,
    line: rows.length
      ? `${rows.length} published posts, but only ${usable.length} are on-domain and still publishable`
        + (usable.length >= MIN_SLICE ? '.' : ' — too few to generalise from.')
      : 'no seeded posts yet — run scripts/brand-seed.mjs',
  };
}

// IO: read the seeded rows.
export function loadBaseline({ years = null } = {}) {
  let files = [];
  try { files = fs.readdirSync(FEATURES_DIR).filter((f) => /^\d{4}\.jsonl$/.test(f)).sort(); } catch { return []; }
  if (years) files = files.filter((f) => years.includes(f.slice(0, 4)));
  return files.flatMap((f) => {
    try {
      return fs.readFileSync(path.join(FEATURES_DIR, f), 'utf8').split('\n').filter(Boolean)
        .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    } catch { return []; }
  });
}
