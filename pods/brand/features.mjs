// features.mjs — the eval harness for writing.
//
// Rogoff's best idea, and the one worth stealing whole: publish, capture structured features about
// each post, attach the outcome, then rewrite the strategy from the data rather than from taste.
// His tracked schema, quoted from the transcript across three passes:
//
//   hook, hook_type, post_text, format, content_type, angle, topic, total_post_length,
//   line_count, avg_line_length, impressions, reactions, comments, shares
//
// Two departures from his version, both deliberate.
//
// 1. HE SCORES ON REACH. His own audience dashboard proved that wrong in the same video: his best
//    and worst posts share a format and differ only in who showed up, and flexing pulled in peers
//    while repelling buyers. So `score()` here ranks on BUYER COMPOSITION, and treats reach as a
//    tiebreaker. That is the wire he never connected.
//
// 2. HE HAD TO SCRAPE HIS OWN POSTS TO SEED THE LOOP, and his first analysis returned nothing
//    because there was no history. There are 897 published posts already in the vault. Everything
//    deterministic below runs over them today, so the harness has a baseline before the first new
//    post rather than after.
//
// Split of responsibilities, per the doctrine: everything measurable is computed here in code.
// The three judgement fields (hook_type, angle, pillar) come from a model, but only from a FIXED
// taxonomy, so they stay comparable across months.

// ── the taxonomies. Fixed on purpose; a free-text label cannot be counted.

export const HOOK_TYPES = [
  'flat-fact',        // "I was studying to become a Computer Scientist at 18." His actual default.
  'anatomy',          // "This deal looked fine until line 14."
  'failure-mode',     // "Three ways my analyzer was wrong."
  'contrarian',       // "The 1% rule has cost more first deals than any other number."
  'pain',             // "Section 8 rent does not arrive on the first."
  'question',
  'transformation',   // BANNED. "I went from X to Y." Tracked so it can be caught, never generated.
];

export const PILLARS = ['deal', 'build', 'debt', 'discipline'];

export const FORMATS = ['single-line', 'short-stack', 'list', 'thread-opener', 'long-form'];

const BANNED_HOOK_TYPES = new Set(['transformation']);

/**
 * PURE. Everything computable without a model.
 * @param {string} text
 * @returns {object} deterministic feature row
 */
export function extract(text = '') {
  const body = String(text).replace(/\r\n/g, '\n').trim();
  const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);
  const hook = lines[0] || '';
  const words = body.split(/\s+/).filter(Boolean);
  const sentences = body.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  const sentWords = sentences.map((s) => s.split(/\s+/).filter(Boolean).length).sort((a, b) => a - b);

  return {
    hook,
    hook_words: hook.split(/\s+/).filter(Boolean).length,
    post_text: body,
    format: classifyFormat(lines, words.length),
    total_post_length: body.length,
    word_count: words.length,
    line_count: lines.length,
    avg_line_length: lines.length ? round1(lines.reduce((a, l) => a + l.length, 0) / lines.length) : 0,
    median_sentence_words: median(sentWords),
    // The voice checks, computed rather than eyeballed. v2 measured these from 897 real posts.
    starts_capital: /^[A-Z]/.test(hook),
    em_dashes: (body.match(/—/g) || []).length,
    has_colon: /:/.test(body),
    has_question: /\?/.test(body),
    has_link: /https?:\/\//.test(body),
    has_number: /\d/.test(body),
    has_emoji: /\p{Extended_Pictographic}/u.test(body),
    second_person: /\byou(r|rs|rself)?\b/i.test(body),
    first_person: /\bI\b/.test(body),
  };
}

function classifyFormat(lines, wordCount) {
  if (lines.length === 1) return 'single-line';
  if (wordCount > 180) return 'long-form';
  if (lines.length >= 4 && lines.slice(1).filter((l) => l.length < 60).length >= 3) return 'list';
  if (/^(what|here|the|these|why|how)\b.*:$/i.test(lines[0] || '')) return 'thread-opener';
  return 'short-stack';
}

/**
 * Does this row match the measured public voice? Returns [] when it does.
 * v2 targets, from 897 counted posts: median sentence at or under 10 words, 99% start with a
 * capital, zero em dashes.
 */
export function voiceDrift(f) {
  const out = [];
  if (f.em_dashes > 0) out.push(`${f.em_dashes} em dash(es); his measured rate is ~0.3 per 10,000 words`);
  if (!f.starts_capital) out.push('does not start with a capital letter; 99% of his posts do');
  if (f.median_sentence_words > 10) out.push(`median sentence ${f.median_sentence_words} words; target is 10 or under`);
  return out;
}

/**
 * Merge the deterministic row with the model-judged fields. Rejects a label outside the taxonomy
 * rather than storing it, so the table stays countable, and refuses a banned hook type outright.
 */
export function withJudgement(f, { hook_type, angle, topic, pillar, content_type } = {}) {
  const bad = [];
  if (hook_type && !HOOK_TYPES.includes(hook_type)) bad.push(`hook_type "${hook_type}" is not in the taxonomy`);
  if (pillar && !PILLARS.includes(pillar)) bad.push(`pillar "${pillar}" is not in the taxonomy`);
  if (BANNED_HOOK_TYPES.has(hook_type)) bad.push(`hook_type "${hook_type}" is banned: it is an income or transformation claim`);
  if (bad.length) return { ok: false, errors: bad, row: null };
  return { ok: true, errors: [], row: { ...f, hook_type: hook_type || null, angle: angle || null, topic: topic || null, pillar: pillar || null, content_type: content_type || null } };
}

/**
 * Attach an outcome. `audience` is the part Rogoff never wires in: the counts of who actually
 * engaged, classified against the ICP.
 */
export function withOutcome(row, { impressions, reactions, comments, shares, audience } = {}) {
  const a = audience || {};
  const total = ['buyer', 'peer', 'creator', 'competitor', 'unknown'].reduce((n, k) => n + (Number(a[k]) || 0), 0);
  return {
    ...row,
    impressions: numOrNull(impressions),
    reactions: numOrNull(reactions),
    comments: numOrNull(comments),
    shares: numOrNull(shares),
    audience: total ? { ...a, total } : null,
    buyer_share: total ? round1((Number(a.buyer) || 0) / total * 100) : null,
  };
}

/**
 * The ranking function, and the one real disagreement with the source material.
 *
 * Rogoff ranks on reach. His own dashboard showed 44% of his commenters were buyers and 40% were
 * competitors and peers, and that his highest-reach posts were the ones pulling the wrong crowd.
 * Reach without composition is a vanity number, so a post is scored on how many BUYERS it drew,
 * with raw reach used only to break ties.
 *
 * Returns null when the composition is unknown, rather than falling back to reach. Refusing to
 * score is more honest than scoring the wrong thing.
 */
export function score(row) {
  if (!row || !row.audience || !row.audience.total) return null;
  const buyers = Number(row.audience.buyer) || 0;
  const reachTiebreak = Math.log10(Math.max(1, Number(row.impressions) || 1)) / 100;
  // Kept to 3 decimals rather than 1: at 1 decimal the tiebreak rounds away entirely and two posts
  // with equal buyers score identically no matter how differently they reached.
  return Math.round((buyers + reachTiebreak) * 1000) / 1000;
}

/**
 * Aggregate a set of scored rows by any feature. This is what the strategy rewrite reads.
 * Rows with no composition are excluded and counted, never silently averaged in.
 */
export function summarise(rows = [], by = 'hook_type') {
  const usable = rows.filter((r) => score(r) !== null);
  const groups = {};
  for (const r of usable) {
    const k = r[by] == null ? 'unknown' : String(r[by]);
    groups[k] = groups[k] || { key: k, posts: 0, buyers: 0, impressions: 0, buyer_share: [] };
    groups[k].posts += 1;
    groups[k].buyers += Number(r.audience.buyer) || 0;
    groups[k].impressions += Number(r.impressions) || 0;
    if (r.buyer_share != null) groups[k].buyer_share.push(r.buyer_share);
  }
  const out = Object.values(groups).map((g) => ({
    key: g.key,
    posts: g.posts,
    buyers_per_post: round1(g.buyers / g.posts),
    avg_buyer_share: g.buyer_share.length ? round1(g.buyer_share.reduce((a, b) => a + b, 0) / g.buyer_share.length) : null,
    impressions_per_post: Math.round(g.impressions / g.posts),
  })).sort((a, b) => b.buyers_per_post - a.buyers_per_post);

  return { by, ranked: out, scored: usable.length, unscored: rows.length - usable.length };
}

const round1 = (n) => Math.round(n * 10) / 10;
const numOrNull = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
function median(sorted) {
  if (!sorted.length) return 0;
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[m] : round1((sorted[m - 1] + sorted[m]) / 2);
}
