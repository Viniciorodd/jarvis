// library.mjs — the content pack as a queue. PURE parsing + PURE selection, no LLM, no network.
//
// Master PRD §7 phase 2. He wrote 15 posts × 3 platforms by hand and they are good; the job here is NOT
// to regenerate them, it is to serve them one at a time, adapt them to the two platforms the pack does
// not cover, and refuse to publish the ones that are not ready.
//
// ── 🚨 THE RULE THE PACK ITSELF STATES, AND THE REASON THIS MODULE HAS TEETH ────────────────────────
// From the pack's own preamble:
//
//     "Deal numbers below are illustrative and internally consistent. Before posting, run each one
//      through REDOS and replace with what it actually outputs. If a number in a post did not come
//      out of the product, do not publish it."
//
// He wrote that for a human who would read it. An autonomous loop does not read preambles. So the
// instruction is enforced in code: any post carrying a deal figure is held as `unverified` and CANNOT
// auto-publish. It surfaces on the approval card with the figures listed, and one confirmation
// releases it. A loop that skipped this would publish invented duplex numbers under his own name while
// the $0-income filings stand — the exact class of claim `compliance.mjs` exists to stop, arriving
// through the one door that was never guarded.
//
// Unverified is NOT the same as false. These numbers are probably fine. But "probably fine, published
// autonomously, attributed to him" is not a bet this system gets to make on his behalf.
//
// ── BLUESKY AND MASTODON ARE DERIVED, NOT DRAFTED ───────────────────────────────────────────────────
// The pack covers X, LinkedIn and Threads. Bluesky (300) takes the X variant; Mastodon (500) takes the
// Threads variant. Deterministic reuse, $0, and no model gets a chance to drift his voice. If a derived
// variant busts its limit it is NEVER truncated — it is handed to `draft.mjs` to be rewritten locally,
// or dropped. A post cut off mid-sentence is a post he did not write.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkPost, trim, PLATFORMS } from './gate.mjs';
import { figuresIn as brandFiguresIn } from '../brand/compliance.mjs';

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

export const PACK_FILE = () => path.join(
  process.env.VAULT_DIR || path.join(process.env.USERPROFILE || process.env.HOME || '', 'Documents', 'Second Brain'),
  '03 - Business', 'REDOS', 'REDOS — Social Content Pack (3 weeks).md',
);

// Which pack heading feeds which platform. The two derivations are the whole adaptation strategy.
export const SOURCE_OF = { x: 'x', linkedin: 'linkedin', threads: 'threads', bluesky: 'x', mastodon: 'threads' };

// ── PURE: pull the 15 posts out of the pack ────────────────────────────────────────────────────────
/**
 * Parses the pack's regular structure: `# WEEK n`, `## Post n (Day) — Title`, `**Image:** file`,
 * `### X|LinkedIn|Threads`, then a fenced block.
 *
 * Returns [] rather than throwing on junk input — a missing pack must degrade to "nothing to post",
 * never to a crash inside a scheduled job.
 */
export function parsePack(md = '') {
  const lines = String(md || '').split(/\r?\n/);
  const posts = [];
  let week = 0, cur = null, platform = null, fence = false, buf = [];

  const closePlatform = () => {
    if (cur && platform && buf.length) cur.variants[platform] = buf.join('\n').trim();
    platform = null; buf = [];
  };

  for (const line of lines) {
    if (fence) {
      if (/^```/.test(line)) { fence = false; closePlatform(); }
      else buf.push(line);
      continue;
    }
    let m;
    if ((m = /^#\s+WEEK\s+(\d+)/i.exec(line))) { closePlatform(); week = Number(m[1]); continue; }
    if ((m = /^##\s+Post\s+(\d+)\s*\(([A-Za-z]+)\)\s*[—-]\s*(.+)$/.exec(line))) {
      closePlatform();
      cur = { n: Number(m[1]), week, day: m[2], title: m[3].trim(), image: '', variants: {} };
      posts.push(cur);
      continue;
    }
    if (cur && (m = /^\*\*Image:\*\*\s*`?([\w.-]+)`?/.exec(line))) { cur.image = m[1]; continue; }
    if (cur && (m = /^###\s+(X|LinkedIn|Threads)\s*$/i.exec(line))) {
      closePlatform(); platform = m[1].toLowerCase(); continue;
    }
    if (platform && /^```/.test(line)) { fence = true; buf = []; continue; }
  }
  closePlatform();
  return posts.filter((p) => Object.keys(p.variants).length > 0);
}

export function loadPack(file = PACK_FILE()) {
  try { return parsePack(fs.readFileSync(file, 'utf8')); } catch { return []; }
}

// ── 🚨 PURE: the unverified-figure hold ─────────────────────────────────────────────────────────────
// Deliberately BROAD. A false positive costs one confirmation tap. A false negative publishes a number
// he never checked, under his name, permanently, on a platform with no edit button.
//
// What counts as a deal figure: money ("2,650", "$4,100"), a percent ("8.4%"), a period rate
// ("120 a month"), and bare 3+ digit numbers with a separator. What does NOT: small counts in prose
// ("19 years", "4 of them", "year three", "the 1% rule" is a named concept, not a claim).
// MONEY is always a claim. A dollar amount in a post about real estate is a number someone could act on,
// and it is the format his own preamble is about.
const MONEY_PATTERNS = [
  /\$\s?\d[\d,]*(?:\.\d+)?/g,                                     // $4,100
  /\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b/g,                            // 2,650
];

// PERCENTAGES AND RATES are context-dependent, and running this over his real pack is what proved it:
//
//   "the 1% rule"                          → teaching. A named industry heuristic.
//   "5% vacancy is not a number"           → teaching. He is arguing against a default.
//   "20% rehab contingency"                → teaching.
//   "cash flow drops 39%"                  → A CLAIM. That is REDOS output he is citing.
//   "Cash offer at 70% of ARV lands ~280"  → A CLAIM. A specific deal resolving to a specific number.
//
// Holding all seven would mean seven pointless confirmations for four heuristics, and a guard that asks
// for confirmation it does not need is a guard he turns off. So the test is whether the SENTENCE
// attributes the figure to something that happened: first person, recency, or a stated result.
const RATE_PATTERNS = [
  /\b\d+(?:\.\d+)?\s?%/g,                                          // 8.4%
  /\b\d[\d,]*(?:\.\d+)?\s+(?:a|per)\s+(?:month|year|week|door|unit)\b/gi, // 120 a month
];

// ⚠ Deliberately NOT "I" or "my". Running this over his pack showed why: "I do not think the 1% rule is
// bad advice" is first-person OPINION about a heuristic, not a result he is reporting. A marker that
// broad held two teaching posts and would have trained him to tap through the confirmations.
// What actually marks a claim is a RESULT — a number that came out of something.
const CLAIM_MARKER = /\b(last (week|month|year)|it (came|told|flagged|returned|said|showed)|drops?|dropped|lands?|landed|ran|came out|analy[sz]ed|turned|got|hit|saw|produced)\b/i;

const YEARS_OWNED = /\b\d{1,2}\s+years?\b/gi;   // "owned it 19 years" — biography, not a claim

/** PURE: does the sentence around `index` attribute the figure to a specific deal or result? */
export function isClaimContext(text = '', index = 0) {
  const src = String(text || '');
  const start = Math.max(src.lastIndexOf('.', index), src.lastIndexOf('\n', index)) + 1;
  let end = src.length;
  for (const ch of ['.', '\n']) {
    const i = src.indexOf(ch, index);
    if (i >= 0 && i < end) end = i;
  }
  return CLAIM_MARKER.test(src.slice(start, end));
}

/**
 * PURE: every figure in a body that needs confirming, deduped, in order of appearance.
 *
 * Money always counts. A rate counts only in a claim context — see the note above RATE_PATTERNS.
 */
export function figuresIn(text = '') {
  const src = String(text || '').replace(YEARS_OWNED, (m) => ' '.repeat(m.length));
  const out = [];
  const collect = (patterns, alwaysClaim) => {
    for (const re of patterns) {
      const r = new RegExp(re.source, re.flags);
      let m;
      while ((m = r.exec(src))) {
        if (!alwaysClaim && !isClaimContext(src, m.index)) continue;
        const v = m[0].trim().replace(/[,.]$/, '');
        if (!out.includes(v)) out.push(v);
      }
    }
  };
  collect(MONEY_PATTERNS, true);
  collect(RATE_PATTERNS, false);
  return out;
}

/**
 * PURE: may this post publish without a human confirming its numbers?
 *
 * `verified` is the set of figures the operator (or a REDOS run) has already confirmed for this post.
 * Absence is never treated as approval — L-013, blind is not clean.
 */
export function figureHold(post = {}, verified = []) {
  // ⚠ The HOLD SET is the brand pod's, not this module's.
  //
  // pods/brand/compliance.mjs runs at publish time and blocks any figure absent from the claims log —
  // including the heuristics ("the 1% rule", "5% vacancy", "20% contingency"). Holding on a narrower
  // set here meant three posts sailed onto the card, got scheduled, and then FAILED at publish time.
  // A batch that dies at the last gate is worse than one that asks up front.
  //
  // The fix is NOT to loosen the publish guard — that guard covers all brand content, and marking "1%"
  // as verified when nobody verified it is exactly the laundering this system exists to prevent. So the
  // hold matches publish-time reality, he confirms each figure ONCE, and the confirmation is permanent
  // and recorded. One command, and the ledger says a human vouched for it.
  //
  // What this module still contributes is the READING: which of those figures is a result he is
  // reporting, and which is an industry heuristic he is arguing about. Same confirmation either way,
  // but he should know which ones actually need checking against REDOS output.
  const norm = (v) => String(v).replace(/[$,%\s]/g, '');
  const seen = new Set((verified || []).map(norm));
  const all = [];
  for (const text of Object.values(post.variants || {})) {
    for (const f of brandFiguresIn(text)) {
      if (all.some((a) => a.figure === f)) continue;
      all.push({ figure: f, kind: figuresIn(text).includes(f) ? 'claim' : 'heuristic' });
    }
  }
  const pending = all.filter((a) => !seen.has(norm(a.figure)));
  const claims = pending.filter((p) => p.kind === 'claim').map((p) => p.figure);
  return {
    held: pending.length > 0,
    figures: all.map((a) => a.figure),
    pending: pending.map((a) => a.figure),
    claims,
    heuristics: pending.filter((p) => p.kind === 'heuristic').map((p) => p.figure),
    why: pending.length
      ? `${pending.length} figure(s) not in the claims log: ${pending.map((p) => p.figure).join(', ')}`
        + (claims.length ? ` — ${claims.join(', ')} ${claims.length === 1 ? 'is a result that needs' : 'are results that need'} checking against REDOS output` : '')
      : '',
  };
}

// ── PURE: build the five platform variants for one pack post ───────────────────────────────────────
/**
 * Returns { posts, derived, overLimit }. NEVER truncates. A derived variant that busts its limit is
 * reported in `overLimit` so the caller can hand it to draft.mjs or drop it.
 *
 * X gets `linkInReply` when its body promises a link — the gate hard-fails a body that says "link
 * below" with nothing behind it, and the pack writes that phrasing on purpose.
 */
export function variantsFor(post = {}, { link = 'https://redoshq.com/quick', community = 'Real estate investing', autoTrim = true } = {}) {
  const v = post.variants || {};
  const posts = {}, derived = [], overLimit = [], trimmed = [];

  for (const platform of PLATFORMS) {
    const text = v[SOURCE_OF[platform]];
    if (!text) continue;
    if (SOURCE_OF[platform] !== platform) derived.push(platform);

    const p = { text };
    if (platform === 'threads') p.community = community;
    if (platform === 'x' && /link below|link in (the )?(reply|comments|bio)/i.test(text)) p.linkInReply = link;

    let r = checkPost(platform, p);

    // Over the limit? Drop whole paragraphs — his words, never cut mid-sentence, no model involved.
    // 10 of his 15 X variants land here, and because Bluesky derives from X it blocked that too, so
    // this is the ordinary path rather than an exception.
    if (r.room < 0 && autoTrim) {
      const t = trim(text, platform, { community: p.community, linkInReply: p.linkInReply });
      if (t.ok) { p.text = t.text; r = checkPost(platform, p); trimmed.push({ platform, dropped: t.dropped }); }
    }

    // Carry the source text so draft.mjs can attempt a local rewrite without re-reading the pack.
    if (r.room < 0) { overLimit.push({ platform, text, length: r.length, max: r.max, over: -r.room }); continue; }
    posts[platform] = p;
  }
  return { posts, derived, overLimit, trimmed };
}

// ── PURE: what to post next ────────────────────────────────────────────────────────────────────────
/**
 * `done` is the set of pack post numbers already published (derived from the brand store, not tracked
 * here — this module owns no state).
 *
 * Order is the order he wrote them, because the pack is a sequence with an argument: week 1 establishes
 * that he can underwrite, week 2 shows the failure modes, week 3 asks for testers. Shuffling it would
 * ask strangers to test a tool before showing them he knows the math.
 */
export function nextUp(pack = [], done = [], { verified = {}, link, community } = {}) {
  const doneSet = new Set((done || []).map(Number));
  for (const post of pack) {
    if (doneSet.has(post.n)) continue;
    const hold = figureHold(post, verified[post.n] || []);
    const { posts, derived, overLimit } = variantsFor(post, { link, community });
    return {
      post, hold, posts, derived, overLimit,
      ready: !hold.held && overLimit.length === 0 && Object.keys(posts).length > 0,
      blockedBy: hold.held ? 'unverified-figures' : overLimit.length ? 'over-limit' : '',
    };
  }
  return null;
}

/** PURE: how far through the pack he is. */
export function packStatus(pack = [], done = []) {
  const doneSet = new Set((done || []).map(Number));
  const remaining = pack.filter((p) => !doneSet.has(p.n));
  return {
    total: pack.length,
    published: pack.length - remaining.length,
    remaining: remaining.length,
    weeksLeft: new Set(remaining.map((p) => p.week)).size,
    exhausted: remaining.length === 0,
  };
}

/** PURE: one line per post, for a Telegram card or the console. */
export function libraryLines(pack = [], done = [], verified = {}) {
  const doneSet = new Set((done || []).map(Number));
  return (pack || []).map((p) => {
    const hold = figureHold(p, verified[p.n] || []);
    const mark = doneSet.has(p.n) ? 'sent' : hold.held ? 'HOLD' : ' ok ';
    return `${mark}  ${String(p.n).padStart(2)}  w${p.week} ${p.day.slice(0, 3)}  ${p.title}`
      + (hold.held && !doneSet.has(p.n) ? `   [${hold.pending.join(' ')}]` : '');
  });
}
