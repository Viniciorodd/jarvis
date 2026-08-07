// Regression suite for the content library + local drafting (pods/social/library.mjs, draft.mjs).
//
// Master PRD §7 phase 2. Two things are pinned here and both are safety, not correctness:
//
//   1. The pack's OWN preamble says illustrative numbers must be replaced with real REDOS output before
//      posting. An autonomous loop does not read preambles, so the rule lives in figureHold().
//   2. The exit test is "one week, zero Claude spend". A prompt cannot enforce a budget; the vault ACL
//      can, and assertFree() is the tripwire if someone later adds the key back.

import {
  parsePack, figuresIn, figureHold, variantsFor, nextUp, packStatus, libraryLines, SOURCE_OF,
} from '../pods/social/library.mjs';
import { assertFree, inventedFigures } from '../pods/social/draft.mjs';
import { ACL, isAllowed } from '../control-plane/vault.mjs';
import { pickChain } from '../pods/model-router.mjs';

const ok = (pass, detail = '') => ({ pass, detail });

// A miniature pack with the real file's exact shape.
const PACK = `# WEEK 1 — the method

## Post 1 (Mon) — The taxes in the listing are not your taxes

**Image:** \`01-taxes-before-after.png\` — two number cards.

### X

\`\`\`
Guy owned it 19 years. His assessment is 19 years old.

Duplex last week: 2,650 on the listing. 4,100 after reassessment.
\`\`\`

### LinkedIn

\`\`\`
The most common number wrong in a rental pro forma is the property tax.

I ran a duplex last week. Listing said 2,650. Reassessed it came out at 4,100.
\`\`\`

### Threads

\`\`\`
Check the county reassessment rule before you check anything else.

Two minutes. It turned a yes into a no for me last week.
\`\`\`

---

## Post 2 (Tue) — The 1% rule

**Image:** \`02-one-percent.png\` — one card.

### X

\`\`\`
The 1% rule is a filter for what to open.

People use it as a filter for what to buy.
\`\`\`

### LinkedIn

\`\`\`
I do not think the 1% rule is bad advice. I think it gets used for the wrong job.
\`\`\`

### Threads

\`\`\`
It exists so you can look at 40 listings and open 4 of them.
\`\`\`
`;

export default {
  agent: 'social-library',
  cases: [
    // ── parsing his pack ──────────────────────────────────────────────────────────────────────────
    { name: 'the pack parses into posts with week, day, title, image and three variants', run: () => {
      const p = parsePack(PACK);
      const a = p[0];
      return ok(p.length === 2 && a.n === 1 && a.week === 1 && a.day === 'Mon'
        && /taxes in the listing/.test(a.title) && a.image === '01-taxes-before-after.png'
        && Object.keys(a.variants).sort().join(',') === 'linkedin,threads,x'
        && /Duplex last week/.test(a.variants.x), JSON.stringify({ n: p.length, title: a.title, image: a.image })) } },

    { name: 'the horizontal rules and prose between posts are not swallowed into a variant', run: () => {
      const p = parsePack(PACK);
      return ok(!/---/.test(p[0].variants.threads) && !/^## /m.test(p[0].variants.threads),
        JSON.stringify(p[0].variants.threads)) } },

    { name: 'a missing or garbage pack degrades to nothing to post, never a throw', run: () =>
      ok(parsePack().length === 0 && parsePack('# not a pack at all').length === 0
        && packStatus([], []).exhausted === true) },

    // ── 🚨 THE UNVERIFIED-FIGURE HOLD ─────────────────────────────────────────────────────────────
    { name: '🚨 a post carrying deal figures is HELD — the pack says replace them with real output first', run: () => {
      const p = parsePack(PACK);
      const h = figureHold(p[0]);
      return ok(h.held && h.pending.includes('2,650') && h.pending.includes('4,100')
        && /not confirmed against REDOS/.test(h.why), JSON.stringify(h)) } },

    { name: '🚨 confirming the figures releases the hold, and ONLY the confirmed ones count', run: () => {
      const p = parsePack(PACK);
      return ok(figureHold(p[0], ['2,650', '4,100']).held === false
        && figureHold(p[0], ['2,650']).held === true, JSON.stringify(figureHold(p[0], ['2,650']).pending)) } },

    { name: 'a post with no deal figures publishes without a confirmation step', run: () => {
      const p = parsePack(PACK);
      return ok(figureHold(p[1]).held === false, JSON.stringify(figureHold(p[1]))) } },

    { name: '⚠ "19 years" is biography, not a claim, and must not trigger the hold on its own', run: () =>
      ok(figuresIn('Guy owned it 19 years and sold it').length === 0,
        JSON.stringify(figuresIn('Guy owned it 19 years and sold it'))) },

    { name: '⚠ "the 1% rule" is a named concept, not a performance claim', run: () =>
      ok(figuresIn('The 1% rule is a filter').length === 0, JSON.stringify(figuresIn('The 1% rule is a filter'))) },

    { name: 'money is ALWAYS held — a dollar figure is a number someone could act on', run: () => {
      const f = figuresIn('The payment is $4,100 against a 1,250 reserve');
      return ok(f.includes('$4,100') && f.includes('1,250'), JSON.stringify(f)) } },

    // ── ⚠ teaching vs claiming, the distinction his real pack forced ──────────────────────────────
    // Running this over the 15 posts held 5 of them; 4 were heuristics he was arguing ABOUT, not
    // results he was reporting. A guard that asks for confirmation it does not need gets tapped through.
    { name: '⚠ a rate stated as a heuristic is teaching, and is not held', run: () => {
      const through = [
        'The 1% rule is a filter for what to open',
        '5% vacancy is not a number, it is a default nobody checked',
        'People treat the 20% rehab contingency like padding',
        'I do not think the 1% rule is bad advice',
      ].filter((t) => figuresIn(t).length > 0);
      return ok(through.length === 0, 'WRONGLY HELD: ' + JSON.stringify(through)) } },

    { name: '🚨 the same rate attributed to a RESULT is a claim, and is held', run: () => {
      const missed = [
        'It flagged the tax line and cash flow drops 39%',
        'Cash offer at 70% of ARV lands somewhere near 280',
        'I ran it last week and it came out at 8.4%',
      ].filter((t) => figuresIn(t).length === 0);
      return ok(missed.length === 0, 'MISSED: ' + JSON.stringify(missed)) } },

    { name: '⚠ first person alone is not a claim — opinion about a heuristic is still teaching', run: () =>
      ok(figuresIn('I think the 12% assumption is optimistic').length === 0,
        JSON.stringify(figuresIn('I think the 12% assumption is optimistic'))) },

    { name: 'a period rate in a claim context is caught', run: () => {
      const f = figuresIn('It came out at 120 a month lower than the listing');
      return ok(f.some((x) => /120 a month/.test(x)), JSON.stringify(f)) } },

    { name: 'a figure appearing twice is listed once', run: () =>
      ok(figuresIn('2,650 on the listing, and again 2,650 here').filter((f) => f === '2,650').length === 1) },

    // ── deriving bluesky + mastodon ───────────────────────────────────────────────────────────────
    { name: 'Bluesky derives from X and Mastodon from Threads — no model touches his voice', run: () =>
      ok(SOURCE_OF.bluesky === 'x' && SOURCE_OF.mastodon === 'threads'
        && SOURCE_OF.x === 'x' && SOURCE_OF.linkedin === 'linkedin') },

    { name: 'all five platforms are built from three hand-written variants', run: () => {
      const b = variantsFor(parsePack(PACK)[1]);
      return ok(Object.keys(b.posts).sort().join(',') === 'bluesky,linkedin,mastodon,threads,x'
        && b.derived.sort().join(',') === 'bluesky,mastodon' && b.overLimit.length === 0,
        JSON.stringify({ posts: Object.keys(b.posts), derived: b.derived })) } },

    { name: 'the Threads variant carries a community tag — the tag is the distribution', run: () =>
      ok(variantsFor(parsePack(PACK)[1]).posts.threads.community === 'Real estate investing') },

    { name: '⚠ an over-limit derived variant is REPORTED, never truncated', run: () => {
      // Only a URL can open this gap, and it takes a long one: X charges a flat 23 while Bluesky
      // charges full length, so 250 chars of body + a 64-char link is 274 on X (fits) and 315 on
      // Bluesky (over by 15). The derived variant must be reported, never quietly cut at 300.
      const url = 'https://redoshq.com/quick?utm_source=example&utm_campaign=launch';
      const post = { n: 9, week: 1, day: 'Mon', title: 't', variants: { x: 'a'.repeat(250) + ' ' + url } };
      const b = variantsFor(post);
      return ok(!b.posts.bluesky && b.posts.x && b.overLimit.some((o) => o.platform === 'bluesky' && o.over > 0)
        && b.overLimit[0].text.length > 0, JSON.stringify(b.overLimit.map((o) => ({ p: o.platform, over: o.over })))) } },

    { name: 'a body promising a link gets linkInReply set, so the gate does not fail it', run: () => {
      const post = { n: 1, week: 1, day: 'Mon', title: 't', variants: { x: 'The number nobody checks. Link below.' } };
      const b = variantsFor(post);
      return ok(b.posts.x && /redoshq/.test(b.posts.x.linkInReply), JSON.stringify(b.posts.x)) } },

    // ── selection ─────────────────────────────────────────────────────────────────────────────────
    { name: 'nextUp serves the pack in the order he wrote it, skipping what is sent', run: () => {
      const pack = parsePack(PACK);
      return ok(nextUp(pack, []).post.n === 1 && nextUp(pack, [1]).post.n === 2
        && nextUp(pack, [1, 2]) === null) } },

    { name: '🚨 a held post is served but NOT ready, and says what blocks it', run: () => {
      const r = nextUp(parsePack(PACK), []);
      return ok(r.ready === false && r.blockedBy === 'unverified-figures' && r.hold.pending.length === 2,
        JSON.stringify({ ready: r.ready, blockedBy: r.blockedBy })) } },

    { name: 'the same post is ready once its figures are confirmed', run: () => {
      const r = nextUp(parsePack(PACK), [], { verified: { 1: ['2,650', '4,100'] } });
      return ok(r.ready === true && r.blockedBy === '' && Object.keys(r.posts).length === 5,
        JSON.stringify({ ready: r.ready, n: Object.keys(r.posts).length })) } },

    { name: 'packStatus counts what is left, and exhausted is honest', run: () => {
      const pack = parsePack(PACK);
      return ok(packStatus(pack, []).remaining === 2 && packStatus(pack, [1]).published === 1
        && packStatus(pack, [1, 2]).exhausted === true) } },

    { name: 'libraryLines renders a card the operator can read at a glance', run: () => {
      const l = libraryLines(parsePack(PACK), [2]);
      return ok(l.length === 2 && /^HOLD/.test(l[0]) && /2,650/.test(l[0]) && /^sent/.test(l[1]),
        JSON.stringify(l)) } },

    // ── 🚨 MARTA CANNOT SPEND HIS MONEY. This is the phase's exit test. ────────────────────────────
    { name: '🚨 SOCIAL-01 has no ANTHROPIC_API_KEY in the vault ACL — $0 is wiring, not a prompt', run: () =>
      ok(!isAllowed('SOCIAL-01', 'ANTHROPIC_API_KEY') && Array.isArray(ACL['SOCIAL-01'])
        && !ACL['SOCIAL-01'].includes('ANTHROPIC_API_KEY'), JSON.stringify(ACL['SOCIAL-01'])) },

    { name: 'she does hold the Bluesky credential — she is the one who posts', run: () =>
      ok(isAllowed('SOCIAL-01', 'BLUESKY_APP_PASSWORD') && !isAllowed('SOCIAL-01', 'STRIPE_API_KEY')) },

    { name: '🚨 with no Claude key the provider chain comes back free-only', run: () => {
      const chain = pickChain({ tier: 'draft', have: { claude: false, openrouter: true, local: true } });
      return ok(!chain.includes('claude') && chain.length > 0 && assertFree(chain) === chain,
        JSON.stringify(chain)) } },

    { name: '🚨 assertFree THROWS if claude ever reappears in the chain', run: () => {
      let threw = false, msg = '';
      try { assertFree(['claude', 'local']); } catch (e) { threw = true; msg = e.message; }
      return ok(threw && /vault\.mjs ACL/.test(msg), msg) } },

    // ── 🚨 A LOCAL REWRITE MAY NEVER INVENT A NUMBER ──────────────────────────────────────────────
    { name: '🚨 a rewrite that rounds 2,650 to 2,600 is rejected, not accepted as close enough', run: () => {
      const bad = inventedFigures('Listing said 2,650, reassessed at 4,100.', 'Listing said 2,600, reassessed at 4,000.');
      return ok(bad.includes('2,600') && bad.includes('4,000'), JSON.stringify(bad)) } },

    { name: 'DROPPING a figure while shortening is allowed — that is what shortening does', run: () =>
      ok(inventedFigures('Listing said 2,650, reassessed at 4,100.', 'Listing said 2,650.').length === 0) },

    { name: 'an identical rewrite introduces nothing', run: () =>
      ok(inventedFigures('$4,100 a year', '$4,100 a year').length === 0) },
  ],
};
