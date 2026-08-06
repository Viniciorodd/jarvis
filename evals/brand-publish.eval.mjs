// Regression suite for the publishing loop and the Bluesky adapter.
//
// This is the last file between a queued draft and a public artifact published under his name while
// the $0-income filings stand. Every case is a refusal.

import { capReached, counts, HARD_DAILY, HARD_WEEKLY } from '../pods/brand/publish.mjs';
import { fits, record, postUrl, graphemes, MAX } from '../pods/brand/publish/bluesky.mjs';
import { complianceCheckPublish, figuresIn } from '../pods/brand/compliance.mjs';

const ok = (pass, detail = '') => ({ pass, detail });

export default {
  agent: 'brand-publish',
  cases: [
    // ── the hard caps ─────────────────────────────────────────────────────────────────────────────
    { name: '⚠ the hard cap is not configurable', run: () =>
      // The handoff is explicit that these are hard-coded. A rate limit an agent can raise is a rate
      // limit that gets raised.
      ok(HARD_DAILY === 2 && HARD_WEEKLY === 10
        && !!capReached({ postedToday: 2 }) && !!capReached({ postedThisWeek: 10 })
        && !capReached({ postedToday: 1, postedThisWeek: 9 })) },

    { name: 'counts come from the ledger, not a counter someone maintains', run: () => {
      const recs = [
        { status: 'published', platform: 'bluesky', publishedAt: '2026-08-06T09:00:00Z' },
        { status: 'published', platform: 'bluesky', publishedAt: '2026-08-02T09:00:00Z' },
        { status: 'published', platform: 'mastodon', publishedAt: '2026-08-06T09:00:00Z' },
        { status: 'scheduled', platform: 'bluesky', publishedAt: '' },
      ];
      const c = counts(recs, 'bluesky', '2026-08-06T12:00:00Z');
      return ok(c.postedToday === 1 && c.postedThisWeek === 2, JSON.stringify(c));
    } },

    // ── 🚨 what must never reach a platform ───────────────────────────────────────────────────────
    { name: '🚨 the publish gate blocks every class the handoff lists', run: () => {
      const through = [
        'Your spreadsheet said yes — it was wrong.',          // em dash
        'Section 8 rent is guaranteed by HUD.',                // guaranteed
        'Unlock financial freedom with this proven system.',   // banned words
        'An AI-powered, seamless deal analyzer.',              // software marketing
        'Check the taxes 🔥',                                   // emoji
      ].filter((t) => complianceCheckPublish(t).ok);
      return ok(through.length === 0, 'REACHED A PLATFORM: ' + JSON.stringify(through));
    } },

    { name: '🚨 a number the product did not produce is blocked', run: () => {
      // The rule that has been enforced by hand until now, and by hand is how a wrong number ships.
      const verifiedFigures = ['73', '62', '239', '136'];
      return ok(complianceCheckPublish('Score 73 to 62, cash flow 239 to 136.', { verifiedFigures }).ok
        && !complianceCheckPublish('Cash flow went to $1,842 a month.', { verifiedFigures }).ok);
    } },

    { name: 'real REDOS copy passes the gate', run: () => {
      const blocked = [
        "The taxes in the listing are the seller's taxes.\n\nYour spreadsheet believed you.",
        'Run the deal. Get a grade, and the reason. Free, no account.',
        'What am I missing?\n\nThat is the question. This is the answer.',
        'Never buy a deal the numbers said no to.',
      ].filter((t) => !complianceCheckPublish(t).ok);
      return ok(blocked.length === 0, 'WRONGLY BLOCKED: ' + JSON.stringify(blocked));
    } },

    { name: 'figures are extracted without swallowing prose or years', run: () => {
      const f = figuresIn('Score 73 to 62, cash $239/mo, 5.3% CoC, 3 beds, in 2026');
      return ok(f.includes('73') && f.includes('62') && f.includes('$239') && f.includes('5.3%')
        && !f.includes('3') && !f.includes('2026') && !f.some((x) => x.endsWith(',')), JSON.stringify(f));
    } },

    // ── the Bluesky adapter ───────────────────────────────────────────────────────────────────────
    { name: '⚠ length is counted in GRAPHEMES, not code units', run: () => {
      // Emoji and accents make .length lie, and a post silently truncated at the API is a post he did
      // not write.
      const s = 'Check the taxes 🔥👨🏻‍💻';
      return ok(graphemes(s) < s.length, graphemes(s) + ' vs ' + s.length);
    } },

    { name: 'an over-length post is refused before it is sent', run: () => {
      const long = 'x'.repeat(MAX + 1);
      return ok(!fits(long).ok && fits(long).over === 1 && fits('short').ok);
    } },

    { name: 'the record carries the right type and a timestamp', run: () => {
      const r = record('hello', '2026-08-06T10:00:00Z');
      return ok(r.$type === 'app.bsky.feed.post' && r.text === 'hello' && r.createdAt === '2026-08-06T10:00:00Z');
    } },

    { name: 'the public url is derived from the AT URI', run: () =>
      ok(postUrl('redoshq.bsky.social', 'at://did:plc:abc/app.bsky.feed.post/3kxyz')
        === 'https://bsky.app/profile/redoshq.bsky.social/post/3kxyz') },

    { name: 'a malformed URI yields no url rather than a broken one', run: () =>
      ok(postUrl('x', '') === '') },

    { name: 'empty / garbage input does not throw', run: () =>
      ok(!fits('').ok === false && counts().postedToday === 0 && capReached() === ''
        && figuresIn().length === 0 && !complianceCheckPublish().ok === false) },
  ],
};
