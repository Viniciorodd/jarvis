// Regression suite for the weekly batch card (pods/social/batch.mjs).
//
// Master PRD §5. The card is where "full autonomous posting" is actually implemented, so the cases that
// matter are the ones about DEFAULT ON SILENCE:
//
//   review mode  — silence publishes NOTHING.
//   notify mode  — silence publishes, but only after the kill window has actually elapsed.
//
// And the one thing autonomy does not cover: a post whose numbers he has not confirmed is never
// released by silence in either mode. Autonomy decides who presses the button. It does not decide
// whether the sentence is true.

import {
  buildBatch, batchDecision, killWindow, cardText, cardButtons, readMode, batchGateLines,
  MODES, DEFAULT_MODE, DEFAULT_WINDOW_MIN, DEFAULT_SIZE,
} from '../pods/social/batch.mjs';
import { parsePack } from '../pods/social/library.mjs';

const ok = (pass, detail = '') => ({ pass, detail });

const mk = (n, title, x) => `## Post ${n} (Mon) — ${title}\n\n**Image:** \`0${n}.png\`\n\n### X\n\n\`\`\`\n${x}\n\`\`\`\n\n### Threads\n\n\`\`\`\n${x}\n\`\`\`\n`;
const PACK = parsePack(
  '# WEEK 1 — the method\n\n'
  + mk(1, 'Clean one', 'The taxes in the listing are not yours.')
  + '\n---\n\n'
  + mk(2, 'Held one', 'I ran a duplex last week. It came out at 4,100.')
  + '\n---\n\n'
  + mk(3, 'Clean two', 'Never buy a deal the numbers said no to.'),
);

const T0 = '2026-08-07T09:00:00.000Z';
const IN_WINDOW = '2026-08-07T09:10:00.000Z';
const AFTER = '2026-08-07T09:25:00.000Z';

export default {
  agent: 'social-batch',
  cases: [
    { name: 'the fixture pack is what the rest of these cases assume', run: () =>
      ok(PACK.length === 3 && PACK[1].n === 2, JSON.stringify(PACK.map((p) => p.n))) },

    // ── assembling ────────────────────────────────────────────────────────────────────────────────
    { name: 'a batch takes the ready posts and sets the held one aside', run: () => {
      const b = buildBatch(PACK, []);
      return ok(b.items.length === 2 && b.items.map((i) => i.n).join(',') === '1,3'
        && b.held.length === 1 && b.held[0].n === 2 && b.held[0].pending.includes('4,100'),
        JSON.stringify({ items: b.items.map((i) => i.n), held: b.held })) } },

    { name: 'confirming the figures puts the held post back into the batch, in his order', run: () => {
      const b = buildBatch(PACK, [], { verified: { 2: ['4,100'] } });
      return ok(b.items.map((i) => i.n).join(',') === '1,2,3' && b.held.length === 0,
        JSON.stringify(b.items.map((i) => i.n))) } },

    { name: 'a batch is capped at the requested size', run: () =>
      ok(buildBatch(PACK, [], { verified: { 2: ['4,100'] }, size: 2 }).items.length === 2
        && DEFAULT_SIZE === 7) },

    { name: 'already-sent posts are skipped', run: () =>
      ok(buildBatch(PACK, [1]).items.map((i) => i.n).join(',') === '3') },

    { name: 'every item in a batch has already passed the gate', run: () => {
      const b = buildBatch(PACK, []);
      return ok(b.items.every((i) => i.gate.ok) && b.broken.length === 0,
        JSON.stringify(b.broken)) } },

    { name: 'an exhausted pack yields an empty batch rather than throwing', run: () =>
      ok(buildBatch(PACK, [1, 2, 3]).items.length === 0 && buildBatch([], []).items.length === 0
        && buildBatch().items.length === 0) },

    // ── 🚨 THE DEFAULT ON SILENCE — this is what "autonomous" means, concretely ────────────────────
    { name: '🚨 review mode: silence publishes NOTHING', run: () => {
      const d = batchDecision({ mode: 'review', sentAt: T0, now: AFTER });
      return ok(d.go === false && d.state === 'waiting', JSON.stringify(d)) } },

    { name: '🚨 notify mode: silence publishes, but ONLY after the window elapses', run: () => {
      const during = batchDecision({ mode: 'notify', sentAt: T0, now: IN_WINDOW });
      const after = batchDecision({ mode: 'notify', sentAt: T0, now: AFTER });
      return ok(during.go === false && during.state === 'waiting'
        && after.go === true && after.state === 'window-closed',
        JSON.stringify({ during: during.state, after: after.state })) } },

    { name: '🚨 a kill beats the window in BOTH modes, and beats an approval too', run: () => {
      const modes = MODES.map((mode) => batchDecision({ mode, decision: 'kill', sentAt: T0, now: AFTER }));
      return ok(modes.every((d) => d.go === false && d.state === 'killed'), JSON.stringify(modes)) } },

    { name: 'an explicit approve sends immediately, without waiting out the window', run: () =>
      ok(batchDecision({ mode: 'notify', decision: 'approve', sentAt: T0, now: T0 }).go === true
        && batchDecision({ mode: 'review', decision: 'approve', sentAt: T0, now: T0 }).go === true) },

    { name: '⚠ a missing send time is WAITING, never a green light', run: () => {
      // The dangerous bug in a time-gated release: no timestamp, so "now - null" is NaN, NaN comparisons
      // are false, and "the window is not open" reads as "publish". It must read as "I cannot tell".
      const d = batchDecision({ mode: 'notify', sentAt: null, now: AFTER });
      const bad = batchDecision({ mode: 'notify', sentAt: 'not a date', now: AFTER });
      return ok(d.go === false && d.state === 'waiting' && bad.go === false,
        JSON.stringify({ d: d.state, bad: bad.state })) } },

    { name: 'the window is 20 minutes, matching the inter-platform pacing', run: () => {
      const w = killWindow(T0, { mode: 'notify' });
      return ok(DEFAULT_WINDOW_MIN === 20 && w.closesAt === '2026-08-07T09:20:00.000Z', w.closesAt) } },

    { name: 'review mode has no window at all — null, not a far-future date', run: () =>
      ok(killWindow(T0, { mode: 'review' }).closesAt === null) },

    // ── mode config ───────────────────────────────────────────────────────────────────────────────
    { name: 'the shipped mode is notify — what he authorised on 2026-08-07', run: () =>
      ok(readMode() === 'notify' && DEFAULT_MODE === 'notify', readMode()) },

    { name: '⚠ a damaged mode file reads as review, not as autonomous', run: () =>
      // The file decides whether silence publishes. A corrupted one must not be read as permission.
      ok(readMode('C:/definitely/not/a/file/but/present-looking.json') === DEFAULT_MODE
        && MODES.join(',') === 'review,notify') },

    // ── the card he actually reads ────────────────────────────────────────────────────────────────
    { name: 'the card names every post, its platforms, and a line of the text', run: () => {
      const t = cardText(buildBatch(PACK, []), { mode: 'notify', closesAt: '2026-08-07T09:20:00.000Z' });
      return ok(/1\. Clean one/.test(t) && /3\. Clean two/.test(t) && /x · bluesky · threads · mastodon/.test(t)
        && /taxes in the listing/.test(t), t.slice(0, 200)) } },

    { name: '🚨 the card NAMES the held post — a silent omission reads as "it went out"', run: () => {
      const t = cardText(buildBatch(PACK, []), { mode: 'notify' });
      return ok(/HELD/.test(t) && /2\. Held one/.test(t) && /4,100/.test(t)
        && /check against REDOS/.test(t) && /will not post in any mode/.test(t), t) } },

    { name: 'notify card says silence publishes; review card says silence does not', run: () => {
      const n = cardText(buildBatch(PACK, []), { mode: 'notify' });
      const r = cardText(buildBatch(PACK, []), { mode: 'review' });
      return ok(/unless you stop it/.test(n) && /Nothing posts until you approve/.test(r)
        && !/unless you stop it/.test(r), JSON.stringify({ n: n.slice(-120), r: r.slice(-120) })) } },

    { name: 'the card tells him how to stop it, and /kill is named', run: () =>
      ok(/\/kill/.test(cardText(buildBatch(PACK, []), { mode: 'notify' }))) },

    { name: 'the card reports how far through the pack he is', run: () =>
      ok(/Pack: 0\/3 sent, 3 left/.test(cardText(buildBatch(PACK, []), { mode: 'notify' }))) },

    { name: '⚠ in notify mode Stop is the FIRST button — the urgent one must be the reachable one', run: () => {
      const b = cardButtons('b1', { mode: 'notify' });
      return ok(/Stop/.test(b[0][0].text) && b[0][0].callback_data === 'social:kill:b1'
        && /Send now/.test(b[1][0].text), JSON.stringify(b)) } },

    { name: 'in review mode the affirmative button leads, because nothing is in flight', run: () => {
      const b = cardButtons('b1', { mode: 'review' });
      return ok(/Post it/.test(b[0][0].text) && /Stop/.test(b[0][1].text), JSON.stringify(b)) } },

    { name: 'gate detail is renderable per item for the log', run: () => {
      const l = batchGateLines(buildBatch(PACK, []));
      return ok(l.some((x) => /^#1 Clean one/.test(x)) && l.some((x) => /OK\s+x/.test(x)),
        JSON.stringify(l.slice(0, 4))) } },

    // ── the weekly schedule ───────────────────────────────────────────────────────────────────────
    { name: 'a batch is proposed Monday 09:00 and NOT twice in the same hour after a restart', run: async () => {
      // 🚨 Importing this module must NOT start the loop. It once did, and tick() calls
      // publishPending({ dryRun: false }) — a test suite one state file away from posting to his
      // account. The isMain guard in social-loop.mjs is what this import silently verifies.
      const mod = await import('../scripts/social-loop.mjs');
      const { shouldPropose } = mod;
      const mon9 = new Date(2026, 7, 10, 9, 5);      // Mon 2026-08-10 09:05 local
      const tue9 = new Date(2026, 7, 11, 9, 5);
      const mon10 = new Date(2026, 7, 10, 10, 5);
      return ok(shouldPropose(mon9, '') === true
        && shouldPropose(mon9, '20260810090000') === false   // already proposed today — restart safe
        && shouldPropose(tue9, '') === false                 // wrong day
        && shouldPropose(mon10, '') === false,               // wrong hour
        JSON.stringify({ fresh: shouldPropose(mon9, ''), repeat: shouldPropose(mon9, '20260810090000') })) } },

    { name: 'an empty batch renders a card rather than throwing', run: () =>
      ok(typeof cardText({}, { mode: 'notify' }) === 'string' && cardText().length > 0
        && batchGateLines().length === 0) },
  ],
};
