// Regression suite for the publishing gate (pods/social/gate.mjs).
//
// Master PRD §7 phase 1. This runs immediately before an irreversible click on his own accounts, so
// every case here is either "this must not go out" or "this must not be blocked for the wrong reason".
//
// The exit test the PRD names is the URL cost asymmetry: X and Mastodon charge a flat 23 for any URL,
// Bluesky and Threads charge full length. Same text, different numbers. A gate that counted naively
// would block a valid post or wave through one that truncates on publish.

import { gate, checkPost, lengthFor, hasUrl, gateLines, LIMITS, PLATFORMS } from '../pods/social/gate.mjs';

const ok = (pass, detail = '') => ({ pass, detail });

// 40 characters of body, then a long URL. The asymmetry is visible in one line.
const BODY = 'The taxes in the listing are not yours. ';   // 39 chars + space = 40
const LONG_URL = 'https://redoshq.com/quick?utm_source=example&utm_campaign=launch';

export default {
  agent: 'social-gate',
  cases: [
    // ── ⚠ THE ASYMMETRY, which is the whole reason this module exists ─────────────────────────────
    { name: '⚠ X and Mastodon charge a flat 23 for a URL; Bluesky and Threads charge full length', run: () => {
      const t = BODY + LONG_URL;
      const x = lengthFor(t, 'x');
      const mast = lengthFor(t, 'mastodon');
      const bsky = lengthFor(t, 'bluesky');
      const th = lengthFor(t, 'threads');
      return ok(x === 63 && mast === 63 && bsky === t.length && th === t.length && bsky > x,
        JSON.stringify({ x, mast, bsky, th, raw: t.length }));
    } },

    { name: 'a post that fits X can still bust Bluesky, and the gate says so', run: () => {
      // 250 chars of body + a 64-char URL: 274 on X (fits), 315 on Bluesky (over).
      const t = 'a'.repeat(250) + ' ' + LONG_URL;
      return ok(lengthFor(t, 'x') <= LIMITS.x.max && lengthFor(t, 'bluesky') > LIMITS.bluesky.max,
        JSON.stringify({ x: lengthFor(t, 'x'), bluesky: lengthFor(t, 'bluesky') }));
    } },

    { name: 'length is counted in GRAPHEMES, not code units', run: () => {
      // An emoji is one character to a reader and several to .length. A post that measures fine and
      // truncates on publish is a post he did not write.
      const s = 'taxes 👨🏻‍💻';
      return ok(lengthFor(s, 'bluesky') < s.length, lengthFor(s, 'bluesky') + ' vs ' + s.length);
    } },

    { name: 'bare domains count as URLs, not just http:// ones', run: () =>
      ok(hasUrl('see redoshq.com/quick') && hasUrl('https://x.com/a') && !hasUrl('no link here')) },

    // ── the limits themselves ─────────────────────────────────────────────────────────────────────
    { name: 'the five platform limits are the real ones', run: () =>
      ok(LIMITS.x.max === 280 && LIMITS.bluesky.max === 300 && LIMITS.threads.max === 500
        && LIMITS.mastodon.max === 500 && LIMITS.linkedin.max === 3000 && PLATFORMS.length === 5) },

    { name: 'an over-length post FAILS, a near-miss only warns', run: () => {
      const over = checkPost('x', { text: 'a'.repeat(300) });
      const near = checkPost('x', { text: 'a'.repeat(270) });
      return ok(!over.ok && /over by 20/.test(over.fails[0]) && near.ok && near.warns.length > 0,
        over.fails[0] + ' | ' + near.warns[0]);
    } },

    { name: 'an unknown platform fails rather than being skipped', run: () =>
      // The CLI version warned and continued. Inside the publish loop that would mean an unchecked
      // post reaching a platform, so here it is a hard fail.
      ok(!checkPost('myspace', { text: 'hello' }).ok) },

    { name: 'an empty post never goes out', run: () =>
      ok(!checkPost('x', { text: '   ' }).ok) },

    // ── 🚨 compliance is the SINGLE source, not a second list ──────────────────────────────────────
    { name: '🚨 the gate blocks a claim, using the brand pod guard rather than its own copy', run: () => {
      // PRD §9 names divergence between two guards as a live risk. This module owns no patterns.
      const r = checkPost('x', { text: 'I increased my engagement by 116,308% in 28 days' });
      return ok(!r.ok && r.fails.some((f) => /compliance/.test(f)), JSON.stringify(r.fails));
    } },

    { name: '🚨 an em dash, "guaranteed" and a banned phrase all block', run: () => {
      const bad = [
        'Your spreadsheet said yes — it was wrong.',
        'Section 8 rent is guaranteed.',
        'Unlock financial freedom with this proven system.',
      ].filter((t) => checkPost('threads', { text: t, community: 'x' }).ok);
      return ok(bad.length === 0, 'GOT THROUGH: ' + JSON.stringify(bad));
    } },

    { name: 'real REDOS copy passes clean', run: () => {
      const blocked = [
        "The taxes in the listing are the seller's taxes.\n\nYour spreadsheet believed you.",
        'Run the deal. Get a grade, and the reason. Free, no account.',
        'Never buy a deal the numbers said no to.',
      ].filter((t) => !checkPost('threads', { text: t, community: 'Real estate investing' }).ok);
      return ok(blocked.length === 0, 'WRONGLY BLOCKED: ' + JSON.stringify(blocked));
    } },

    // ── X's link discipline ───────────────────────────────────────────────────────────────────────
    { name: '🚨 a body promising a link with no reply set is a dead end, and fails', run: () => {
      const r = checkPost('x', { text: 'The number nobody checks. Link below.' });
      return ok(!r.ok && /promises a link/.test(r.fails.join(' ')), JSON.stringify(r.fails));
    } },

    { name: 'the same body passes once linkInReply is set', run: () =>
      ok(checkPost('x', { text: 'The number nobody checks. Link below.', linkInReply: 'https://redoshq.com/quick' }).ok) },

    { name: 'a URL in an X body warns but does not block', run: () => {
      const r = checkPost('x', { text: 'Try it: redoshq.com/quick' });
      return ok(r.ok && r.warns.some((w) => /suppresses reach/.test(w)), JSON.stringify(r.warns));
    } },

    { name: 'Threads with no community tag warns — the tag is the distribution', run: () => {
      const r = checkPost('threads', { text: 'A post with no tag.' });
      return ok(r.ok && r.warns.some((w) => /community tag/.test(w)));
    } },

    // ── images ────────────────────────────────────────────────────────────────────────────────────
    { name: 'too many images for the platform fails', run: () =>
      ok(!checkPost('x', { text: 'hi there friends' }, { images: [1, 2, 3, 4, 5] }).ok
        && checkPost('threads', { text: 'hi there friends', community: 'x' }, { images: [1, 2, 3, 4, 5] }).ok) },

    // ── the whole run ─────────────────────────────────────────────────────────────────────────────
    { name: 'a clean five-platform run gates green', run: () => {
      const g = gate({ posts: {
        threads: { text: 'The taxes in the listing are not yours.', community: 'Real estate investing' },
        linkedin: { text: 'The taxes in the listing are not yours.' },
        x: { text: 'The taxes in the listing are not yours.' },
        mastodon: { text: 'The taxes in the listing are not yours.' },
        bluesky: { text: 'The taxes in the listing are not yours.' },
      } });
      return ok(g.ok && Object.keys(g.results).length === 5, JSON.stringify(g.fails));
    } },

    { name: '🚨 ONE bad platform blocks the WHOLE run', run: () => {
      // The skill's rule: gate once, then post. A run that publishes four and fails the fifth leaves
      // him half-launched with no way to tell which is which.
      const g = gate({ posts: {
        threads: { text: 'fine and clean here', community: 'x' },
        x: { text: 'a'.repeat(400) },
      } });
      return ok(!g.ok && g.fails.length > 0, JSON.stringify(g.fails));
    } },

    { name: 'an over-length REPLY fails the run too', run: () => {
      const g = gate({ posts: { x: { text: 'ok fine' } }, replies: { x: 'b'.repeat(400) } });
      return ok(!g.ok, JSON.stringify(g.fails));
    } },

    { name: 'an empty spec fails rather than passing vacuously', run: () =>
      ok(!gate({}).ok && !gate().ok, JSON.stringify(gate({}).fails)) },

    { name: 'gateLines renders something a Telegram card can show', run: () => {
      const lines = gateLines(gate({ posts: {
        x: { text: 'a'.repeat(400) },
        threads: { text: 'clean and fine', community: 'Real estate investing' },
      } }));
      return ok(Array.isArray(lines) && lines.some((l) => /^FAIL/.test(l))
        && lines.some((l) => /^OK/.test(l)), JSON.stringify(lines));
    } },

    { name: 'empty / garbage input does not throw', run: () =>
      ok(lengthFor('', 'x') === 0 && lengthFor('a', 'nope') === null
        && checkPost().ok === false && !hasUrl() && gate().ok === false
        && gateLines().length === 0) },
  ],
};
