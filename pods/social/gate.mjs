// gate.mjs — the last check before an irreversible click. PURE, no LLM, no I/O, fails closed.
//
// Master PRD §7 phase 1: a port of the `post-everywhere` skill's `scripts/check.mjs`. The skill proved
// itself twice on live runs; its knowledge is what Jarvis was missing. This is that knowledge as an
// eval-pinned module instead of a CLI script, so it can run inside the publish loop.
//
// From the skill, and it is the rule that makes the whole thing fast:
//   *"Write once, gate once, then post. Do not draft into each composer and discover the character
//    limit there."*
//
// FAILS CLOSED. A false positive costs one rewrite. A false negative costs a deleted post at best and
// a discoverable claim at worst, while the $0-income filings stand.
//
// ── ⚠ THE ONE THING THAT SURPRISES PEOPLE: URL COST IS ASYMMETRIC ───────────────────────────────
// X and Mastodon charge a FLAT 23 characters for any URL however long. Bluesky and Threads charge the
// full length. So the same text with a link is 265 on X and 280 on Bluesky, and a gate that counted
// naively would either block a valid post or wave through one that truncates on publish.
//
// ── COMPLIANCE IS NOT DUPLICATED ────────────────────────────────────────────────────────────────
// Master PRD §9 names this risk directly: two guards now exist and they will diverge. So this module
// does NOT carry its own pattern list — it calls `pods/brand/compliance.mjs`, which is the single
// source and already carries the four leaks found by running it over all 897 archived posts.

import { complianceCheckPublish } from '../brand/compliance.mjs';

// Per-platform limits, and how each counts a URL. `urlCost: null` means "charges full length".
export const LIMITS = {
  x:        { max: 280,  urlCost: 23,   images: 4,  label: 'X' },
  bluesky:  { max: 300,  urlCost: null, images: 4,  label: 'Bluesky' },
  threads:  { max: 500,  urlCost: null, images: 10, label: 'Threads' },
  mastodon: { max: 500,  urlCost: 23,   images: 4,  label: 'Mastodon' },
  linkedin: { max: 3000, urlCost: null, images: 20, label: 'LinkedIn' },
};

export const PLATFORMS = Object.keys(LIMITS);

const URL_RE = () => /\bhttps?:\/\/\S+|\b[a-z0-9-]+\.(com|net|org|io|co|app|dev|xyz|me)(\/\S*)?/gi;

/**
 * PURE: length as the PLATFORM counts it.
 *
 * Graphemes, not code units — Bluesky counts graphemes and an emoji is one character to a user and
 * several to `.length`. A post that measures fine and truncates on publish is a post he did not write.
 */
export function lengthFor(text = '', platform = 'x') {
  const cfg = LIMITS[platform];
  if (!cfg) return null;
  let body = String(text);
  let extra = 0;
  if (cfg.urlCost != null) {
    body = body.replace(URL_RE(), () => { extra += cfg.urlCost; return ''; });
  }
  let n;
  try { n = [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(body)].length; }
  catch { n = [...body].length; }
  return n + extra;
}

// PURE: does the body contain a URL at all?
export const hasUrl = (text = '') => URL_RE().test(String(text));

/**
 * PURE: check one platform's variant. Returns { ok, fails, warns, length, max, room }.
 *
 * `fails` blocks the post. `warns` are printed and do not block — the distinction matters because a
 * guard that blocks on taste gets switched off within a week.
 */
export function checkPost(platform, post = {}, { images = [] } = {}) {
  const cfg = LIMITS[platform];
  const fails = [], warns = [];
  if (!cfg) return { ok: false, fails: [`unknown platform "${platform}"`], warns, length: null, max: null, room: null };

  const text = String(post.text || '');
  if (!text.trim()) fails.push(`${cfg.label}: empty post`);

  const length = lengthFor(text, platform);
  const room = cfg.max - length;
  if (room < 0) fails.push(`${cfg.label}: ${length}/${cfg.max}, over by ${-room}`);
  else if (room < 15) warns.push(`${cfg.label}: ${length}/${cfg.max}, only ${room} to spare`);

  // The single source. Not a second pattern list — see the header.
  const c = complianceCheckPublish(text);
  for (const b of c.blocks) fails.push(`${cfg.label} compliance: ${b.why}`);
  for (const w of c.warnings) warns.push(`${cfg.label} compliance: ${w.why}`);

  if (images.length > cfg.images) fails.push(`${cfg.label}: ${images.length} images, max ${cfg.images}`);

  if (platform === 'x') {
    // The body says "link below" because a URL in an X post suppresses reach. If the reply that
    // carries the link is missing, the post is a dead end — it promises something that never arrives.
    const promises = /link below|link in (the )?(reply|comments|bio)/i.test(text);
    if (promises && !post.linkInReply) fails.push('X: body promises a link but linkInReply is not set');
    if (hasUrl(text)) warns.push('X: a URL in the body suppresses reach — move it to the first reply');
  }
  if (platform === 'threads' && !post.community) {
    // At 182 followers the community tag is the only real distribution in the set.
    warns.push('Threads: no community tag — the tag is the distribution');
  }

  return { ok: fails.length === 0, fails, warns, length, max: cfg.max, room };
}

/**
 * PURE: gate a whole run. `spec` is the skill's variants.json shape.
 *
 * Returns { ok, results, fails, warns, summary }. NOTHING publishes unless `ok` is true.
 */
export function gate(spec = {}) {
  const images = Array.isArray(spec.images) ? spec.images : [];
  const results = {};
  const fails = [], warns = [];

  for (const [platform, post] of Object.entries(spec.posts || {})) {
    const r = checkPost(platform, post, { images });
    results[platform] = r;
    fails.push(...r.fails);
    warns.push(...r.warns);
  }

  // Replies are posts too, and an over-length reply fails the same way.
  for (const [platform, text] of Object.entries(spec.replies || {})) {
    if (!LIMITS[platform]) continue;
    const r = checkPost(platform, { text, linkInReply: 'n/a' }, { images });
    results[platform + ':reply'] = r;
    fails.push(...r.fails.map((f) => f.replace(':', ' reply:')));
  }

  if (!Object.keys(spec.posts || {}).length) fails.push('nothing to post');

  return {
    ok: fails.length === 0,
    results,
    fails,
    warns,
    summary: Object.entries(results)
      .map(([k, r]) => `${k} ${r.length}/${r.max}`)
      .join(' · '),
  };
}

// PURE: one line per platform, for a Telegram card or a log.
export function gateLines(g = {}) {
  const out = [];
  for (const [k, r] of Object.entries(g.results || {})) {
    out.push(`${r.ok ? 'OK' : 'FAIL'}  ${k}  ${r.length}/${r.max}${r.room < 0 ? ` (over by ${-r.room})` : ''}`);
  }
  for (const f of (g.fails || [])) out.push('FAIL  ' + f);
  for (const w of (g.warns || [])) out.push('warn  ' + w);
  return out;
}
