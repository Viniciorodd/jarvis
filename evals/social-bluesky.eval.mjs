// Regression suite for Bluesky link facets (pods/brand/publish/bluesky.mjs).
//
// Master PRD §7 phase 4. The publish path, verified read-back and grapheme count are pinned in
// brand-publish.eval.mjs against the SAME adapter — there is deliberately only one. What is pinned
// here is the addition the social pod needed: link facets.
//
// ⚠ JavaScript string indices are UTF-16 code units. AT Protocol facets are UTF-8 BYTES. One emoji or
// accented character before a link shifts the offset, and the link highlights the wrong span or lands
// mid-word. His pack writes links as bare domains, so without facets they are grey text nobody taps.

import { byteLen, detectFacets, postUrl, record } from '../pods/brand/publish/bluesky.mjs';

const ok = (pass, detail = '') => ({ pass, detail });

export default {
  agent: 'social-bluesky',
  cases: [
    // ── ⚠ FACET BYTE OFFSETS ──────────────────────────────────────────────────────────────────────
    { name: '⚠ facet offsets are UTF-8 BYTES, not string indices — an emoji before a link shifts them', run: () => {
      // "👀 " is 1 char to .indexOf and 4 bytes on the wire. A facet built from the string index would
      // start the link 3 bytes early, inside the emoji, and Bluesky would render it wrong.
      const t = '👀 see redoshq.com/quick';
      const f = detectFacets(t)[0];
      const strIndex = t.indexOf('redoshq.com');
      return ok(f.index.byteStart === byteLen('👀 see ') && f.index.byteStart !== strIndex
        && f.index.byteEnd === byteLen(t), JSON.stringify({ byteStart: f.index.byteStart, strIndex })) } },

    { name: 'a plain ASCII post has offsets equal to string indices — the easy case still works', run: () => {
      const t = 'run it at redoshq.com/quick today';
      const f = detectFacets(t)[0];
      return ok(f.index.byteStart === t.indexOf('redoshq.com')
        && t.slice(f.index.byteStart, f.index.byteEnd) === 'redoshq.com/quick',
        JSON.stringify(f.index)) } },

    { name: 'a bare domain gets an https:// uri — his pack writes links without a scheme', run: () => {
      const f = detectFacets('see redoshq.com/quick')[0];
      return ok(f.features[0].uri === 'https://redoshq.com/quick'
        && f.features[0].$type === 'app.bsky.richtext.facet#link', JSON.stringify(f.features)) } },

    { name: 'a full URL is kept verbatim, not double-prefixed', run: () =>
      ok(detectFacets('go to https://redoshq.com/quick')[0].features[0].uri === 'https://redoshq.com/quick') },

    { name: 'trailing punctuation is not swallowed into the link', run: () => {
      const f = detectFacets('try redoshq.com/quick.')[0];
      return ok(f.features[0].uri === 'https://redoshq.com/quick', f.features[0].uri) } },

    { name: 'multiple links each get their own facet, in order', run: () => {
      const f = detectFacets('redoshq.com/quick and redoshq.com/deal');
      return ok(f.length === 2 && f[0].index.byteEnd <= f[1].index.byteStart, JSON.stringify(f.map((x) => x.index))) } },

    { name: 'a post with no link has no facets, not an empty-object facet', run: () =>
      ok(detectFacets('The taxes in the listing are not yours.').length === 0) },

    { name: 'byteLen counts UTF-8, so an apostrophe post is measured honestly', run: () =>
      ok(byteLen('abc') === 3 && byteLen('👀') === 4 && byteLen('') === 0 && byteLen() === 0) },

    // ── the record ────────────────────────────────────────────────────────────────────────────────
    { name: 'the record carries the right type, langs, and a createdAt', run: () => {
      const r = record('hello redoshq.com/quick', '2026-08-07T13:00:00.000Z');
      return ok(r.$type === 'app.bsky.feed.post' && r.langs[0] === 'en' && r.createdAt === '2026-08-07T13:00:00.000Z'
        && r.facets.length === 1 && r.text === 'hello redoshq.com/quick', JSON.stringify(r)) } },

    { name: 'the post URL is built from the handle and the rkey', run: () =>
      ok(postUrl('viniciorodd.bsky.social', 'at://did:plc:xyz/app.bsky.feed.post/3kabc')
        === 'https://bsky.app/profile/viniciorodd.bsky.social/post/3kabc'
        && postUrl('', '') === '') },

  ],
};
