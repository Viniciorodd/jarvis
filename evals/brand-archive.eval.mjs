// Regression suite for the archive reader (pods/brand/archive.mjs) and the compliance holes it found.
//
// The archive is the seed corpus: 897 posts he typed and published, exported 2026-07-19, each
// carrying its likes and retweets. Running the existing guard across all of them is what surfaced
// the four leaks pinned at the bottom of this file — none of which were theoretical. Every one of
// them is a real sentence he actually published.

import { parseArchive, engagement, isQuotePost, isThin, topPerformers, summary } from '../pods/brand/archive.mjs';
import { complianceCheck } from '../pods/brand/compliance.mjs';

const ok = (pass, detail = '') => ({ pass, detail });

const SAMPLE = [
  '# 🐦 X / Twitter Archive',
  '',
  '## October 2018',
  '',
  '**2018-10-24** · ❤️ 3 🔁 1',
  '',
  '> 2 minutes of my life I’ll never get back.',
  '',
  '**2018-11-19** · ❤️ 8 🔁 3',
  '',
  '> “Nothing important comes with instructions.',
  '>',
  '> —JAMES RICHARDSON”',
  '',
  '**2026-06-14** · ❤️ 0 🔁 0',
  '',
  '> Plan while others are playing.',
  '',
].join('\n');

export default {
  agent: 'brand-archive',
  cases: [
    { name: 'a post parses with its date and both counts', run: () => {
      const p = parseArchive(SAMPLE)[0];
      return ok(p.date === '2018-10-24' && p.likes === 3 && p.retweets === 1
        && p.text === '2 minutes of my life I’ll never get back.', JSON.stringify(p));
    } },

    { name: 'a multi-line post keeps its line breaks', run: () => {
      // line_count and avg_line_length are tracked features; flattening would change every
      // multi-line post's measured shape.
      const p = parseArchive(SAMPLE)[1];
      return ok(p.text.split('\n').length === 3, JSON.stringify(p.text));
    } },

    { name: 'headings and rules end a post, blank lines inside it do not', run: () =>
      ok(parseArchive(SAMPLE).length === 3, String(parseArchive(SAMPLE).length)) },

    { name: '⚠ a zero count is zero; a missing count is null', run: () => {
      // "nobody engaged" and "we never recorded it" are different facts and only one is bad news.
      const withZero = parseArchive(SAMPLE)[2];
      const noCounts = parseArchive('**2020-01-01**\n\n> bare post\n')[0];
      return ok(withZero.likes === 0 && engagement(withZero) === 0
        && noCounts.likes === null && engagement(noCounts) === null,
        JSON.stringify([withZero.likes, noCounts.likes]));
    } },

    { name: 'someone else’s quote is not his voice', run: () =>
      // He published it, so it stays in the features table. It must never become an exemplar, or a
      // producer told to imitate these learns to write like a quote account.
      ok(isQuotePost('“Nothing important comes with instructions.\n\n—JAMES RICHARDSON”')
        && !isQuotePost('Plan while others are playing.')) },

    { name: 'a link-only or stub post carries no writing to learn from', run: () =>
      ok(isThin('https://t.co/abc') && isThin('lol') && !isThin('Plan while others are playing.')) },

    { name: 'top performers exclude quotes and stubs and rank by engagement', run: () => {
      const t = topPerformers(parseArchive(SAMPLE), 5);
      return ok(t.length === 2 && t[0].date === '2018-10-24', JSON.stringify(t.map((p) => p.date)));
    } },

    { name: 'summary reports what is actually there', run: () => {
      const s = summary(parseArchive(SAMPLE));
      return ok(s.posts === 3 && s.quotes === 1 && s.first === '2018-10-24' && s.last === '2026-06-14',
        JSON.stringify(s));
    } },

    // ── 🚨 THE FOUR LEAKS, found by running the guard over all 897 ─────────────────────────────────
    // Every string below is a real published post or a close paraphrase of one. Before 2026-08-06 the
    // guard passed all of them, and the first one was his single highest-engagement post.
    { name: '🚨 first-person growth claims are blocked (his top post used to pass)', run: () => {
      const leaks = [
        'I increased my Twitter engagement by 116,308% in 28 days without spending a dollar',
        'I grew my account 400% last month',
        'We scaled the list to 5k',
      ].filter((t) => complianceCheck(t).ok);
      return ok(leaks.length === 0, 'STILL PASSING: ' + JSON.stringify(leaks));
    } },

    { name: '🚨 a growth percentage on his own account is blocked', run: () =>
      ok(!complianceCheck('my engagement is up 250%').ok) },

    { name: '🚨 the k/m/b suffix no longer defeats the transformation rule', run: () => {
      // "from 0 to 10k" passed because \b sits between the digits and the k, so the second
      // [\d,]+ never reached a word boundary.
      return ok(!complianceCheck('I went from 0 to 10k in 90 days').ok
        && !complianceCheck('from $5k to $50k in a year').ok);
    } },

    { name: '⚠ deal arithmetic still passes — it is most of what he writes', run: () => {
      // A guard that blocks his actual subject matter gets turned off inside a week. Every new rule
      // above is tied to first person for exactly this reason.
      const blocked = [
        'Cap rate went from 6% to 7% after the tax reassessment.',
        'Purchase 185k, rehab 22k, ARV 260k. That is a 12% margin before holding costs.',
        'The seller wanted 8% down. I offered 12% and a shorter close.',
        'A 30 year at 7.1% on 185k is 1,243 a month before taxes and insurance.',
        'Vacancy assumption moved from 5% to 8% and the deal died.',
        'Three ways my analyzer was wrong last month.',
      ].filter((t) => !complianceCheck(t).ok);
      return ok(blocked.length === 0, 'WRONGLY BLOCKED: ' + JSON.stringify(blocked));
    } },

    { name: 'empty / garbage input does not throw', run: () =>
      ok(parseArchive().length === 0 && summary().posts === 0 && topPerformers().length === 0
        && engagement() === null && !isQuotePost() && isThin('')) },
  ],
};
