// batch.mjs — the weekly card. PURE assembly + PURE timing, no network, no LLM.
//
// Master PRD §5 specifies a Telegram batch card: seven posts, approve or kill. He has since authorised
// full autonomous posting ("I'm giving full access to AI to do the posting for me... if something is
// wrong I want to be able to turn that off"). Those two are not in conflict once you notice they are
// answering different questions:
//
//   The PRD asks  "who decides this goes out?"      → he does, by not stopping it.
//   He asks       "must I tap seven times a week?"  → no.
//
// So the card has two modes and the difference is only the DEFAULT ON SILENCE:
//
//   review  — nothing goes until he taps approve. Silence means nothing posts.
//   notify  — the card lands, a kill window opens, and silence means it posts.
//
// `notify` is the shipped mode, because that is what he authorised. It is not "no gate": he is told
// exactly what is about to go out, by platform, with the text, before it goes, and one tap or one
// `/kill` stops the whole thing. What it removes is the requirement that he be AWAKE for the campaign
// to run.
//
// ── 🚨 WHAT AUTONOMY DOES NOT COVER ─────────────────────────────────────────────────────────────────
// A held post — one carrying a deal figure he has not confirmed against real REDOS output — is NEVER
// released by silence, in either mode. Autonomy is a decision about WHO PRESSES THE BUTTON. The figure
// hold is a decision about WHETHER THE SENTENCE IS TRUE, and nobody delegated that. A held post sits
// out the batch and says so on the card.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nextUp, figureHold, variantsFor, packStatus } from './library.mjs';
import { gate, gateLines } from './gate.mjs';

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
export const MODE_FILE = path.join(ROOT, 'control-plane', 'social-mode.json');

export const MODES = ['review', 'notify'];
export const DEFAULT_MODE = 'notify';          // what he authorised 2026-08-07
export const DEFAULT_WINDOW_MIN = 20;          // matches the PRD's inter-platform pacing
export const DEFAULT_SIZE = 7;                 // the PRD's number: a week of posts

/**
 * Reads the shipped mode. The two failure directions are deliberately different:
 *
 *   file missing        → DEFAULT_MODE. Never configured, so use what he authorised.
 *   file present, junk  → 'review'. Something is wrong with the config that decides whether silence
 *                         publishes, and the safe reading of a damaged file is "ask him".
 */
export function readMode(file = MODE_FILE) {
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    return MODES.includes(j.mode) ? j.mode : 'review';
  } catch { return DEFAULT_MODE; }
}

export function writeMode(mode, file = MODE_FILE) {
  const m = MODES.includes(mode) ? mode : 'review';
  fs.writeFileSync(file, JSON.stringify({ mode: m, at: new Date().toISOString() }, null, 2));
  return m;
}

/**
 * PURE: assemble the next batch.
 *
 * Walks the pack in his order, taking posts that are ready. Held posts are collected separately so the
 * card can name them — a post that silently never appears is a post he assumes went out.
 */
export function buildBatch(pack = [], done = [], { verified = {}, size = DEFAULT_SIZE, link, community } = {}) {
  const doneSet = new Set((done || []).map(Number));
  const items = [], held = [], broken = [];

  for (const post of pack) {
    if (items.length >= size) break;
    if (doneSet.has(post.n)) continue;

    const hold = figureHold(post, verified[post.n] || []);
    if (hold.held) {
      held.push({ n: post.n, title: post.title, pending: hold.pending,
        claims: hold.claims || [], heuristics: hold.heuristics || [] });
      continue;
    }

    const built = variantsFor(post, { link, community });
    const g = gate({ posts: built.posts });
    if (!g.ok) { broken.push({ n: post.n, title: post.title, fails: g.fails }); continue; }
    if (!Object.keys(built.posts).length) { broken.push({ n: post.n, title: post.title, fails: ['no variants fit'] }); continue; }

    items.push({ n: post.n, title: post.title, day: post.day, week: post.week, image: post.image,
      // `trimmed` must survive to the caller: it is the record of which platforms had a paragraph
      // dropped. Losing it made the log report "0 trimmed" for a batch where 7 posts were shortened,
      // which reads as "his text went out untouched".
      posts: built.posts, derived: built.derived, overLimit: built.overLimit,
      trimmed: built.trimmed || [], gate: g });
  }

  return { items, held, broken, status: packStatus(pack, done) };
}

/**
 * PURE: when does the kill window close?
 *
 * `notify` mode only. In `review` mode there is no window — nothing goes until he says so, and
 * `closesAt` is null rather than a far-future date, because a null is honest and a far-future date
 * looks like a deadline that will eventually pass.
 */
export function killWindow(sentAt, { mode = DEFAULT_MODE, windowMin = DEFAULT_WINDOW_MIN } = {}) {
  if (mode !== 'notify') return { mode, closesAt: null, windowMin: null };
  // ⚠ `new Date(null).getTime()` is 0, NOT NaN — epoch, and perfectly finite. A finite-check alone let a
  // missing timestamp compute a window that closed in 1970, which read as "closed, publish now" and
  // skipped the kill window entirely. Caught by its own eval. Require a real value first.
  const t = sentAt ? new Date(sentAt).getTime() : NaN;
  if (!Number.isFinite(t) || t <= 0) return { mode, closesAt: null, windowMin };
  return { mode, closesAt: new Date(t + windowMin * 60000).toISOString(), windowMin };
}

/**
 * PURE: may this batch publish right now?
 *
 * The three answers are deliberately distinct. `waiting` is not `no` — it is "ask again later", and a
 * caller that treats them the same either publishes early or never publishes at all.
 */
export function batchDecision({ mode = DEFAULT_MODE, decision = null, sentAt = null, now = new Date().toISOString(), windowMin = DEFAULT_WINDOW_MIN } = {}) {
  if (decision === 'kill') return { go: false, state: 'killed', why: 'he killed this batch' };
  if (decision === 'approve') return { go: true, state: 'approved', why: 'he approved it' };

  if (mode === 'review') return { go: false, state: 'waiting', why: 'review mode — nothing posts until he approves' };

  // notify mode, no decision: the window decides.
  const w = killWindow(sentAt, { mode, windowMin });
  if (!w.closesAt) return { go: false, state: 'waiting', why: 'no send time recorded — cannot tell if the window closed' };
  const open = new Date(now).getTime() < new Date(w.closesAt).getTime();
  return open
    ? { go: false, state: 'waiting', why: `kill window open until ${w.closesAt}` }
    : { go: true, state: 'window-closed', why: `kill window closed at ${w.closesAt} with no objection` };
}

const short = (t = '', n = 90) => (t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t);

/**
 * PURE: the Telegram card. Plain text, no markdown — his bot sends plain and a stray underscore in a
 * URL should not silently drop half the message.
 */
export function cardText(batch = {}, { mode = DEFAULT_MODE, closesAt = null } = {}) {
  const L = [];
  const items = batch.items || [];

  L.push(mode === 'notify'
    ? `POSTING ${items.length} post(s) from your content pack`
    : `${items.length} post(s) ready — your call`);
  L.push('');

  for (const it of items) {
    const platforms = Object.keys(it.posts);
    L.push(`${it.n}. ${it.title}`);
    L.push(`   ${platforms.join(' · ')}`);
    const first = it.posts.x || it.posts.bluesky || it.posts[platforms[0]];
    if (first) L.push(`   "${short(String(first.text).split('\n')[0])}"`);
    L.push('');
  }

  // Held posts are NAMED. A post that silently never appears is a post he assumes went out.
  if ((batch.held || []).length) {
    L.push(`HELD — figures not in the claims log (${batch.held.length}):`);
    for (const h of batch.held) {
      L.push(`   ${h.n}. ${h.title}`);
      // Claims and heuristics need the same confirmation, but he should know which is which: one is a
      // number that came out of a deal, the other is an industry rule of thumb he is arguing about.
      if ((h.claims || []).length) L.push(`      check against REDOS: ${h.claims.join(' ')}`);
      if ((h.heuristics || []).length) L.push(`      rules of thumb: ${h.heuristics.join(' ')}`);
    }
    L.push('   These will not post in any mode until you confirm them, once.');
    L.push('');
  }
  if ((batch.broken || []).length) {
    L.push(`BLOCKED by the gate (${batch.broken.length}):`);
    for (const b of batch.broken) L.push(`   ${b.n}. ${b.title} — ${b.fails[0]}`);
    L.push('');
  }

  if (mode === 'notify') {
    L.push(closesAt
      ? `Going out after ${new Date(closesAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} unless you stop it.`
      : 'Going out shortly unless you stop it.');
    L.push('Reply /kill to stop everything, or tap Stop.');
  } else {
    L.push('Nothing posts until you approve. Reply /post to send, /kill to discard.');
  }

  const s = batch.status || {};
  if (s.total) L.push('', `Pack: ${s.published}/${s.total} sent, ${s.remaining} left.`);
  return L.join('\n');
}

/** PURE: the inline keyboard. Stop is FIRST — the destructive-looking button is the one he needs fast. */
export function cardButtons(batchId, { mode = DEFAULT_MODE } = {}) {
  const stop = { text: '■ Stop', callback_data: `social:kill:${batchId}` };
  return mode === 'notify'
    ? [[stop], [{ text: 'Send now', callback_data: `social:approve:${batchId}` }]]
    : [[{ text: 'Post it', callback_data: `social:approve:${batchId}` }, stop]];
}

/** PURE: the gate detail, for a log or a follow-up message. */
export function batchGateLines(batch = {}) {
  return (batch.items || []).flatMap((it) => [`#${it.n} ${it.title}`, ...gateLines(it.gate).map((l) => '  ' + l)]);
}
