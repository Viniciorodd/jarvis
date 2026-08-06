// Regression suite for the baseline (pods/brand/baseline.mjs).
//
// The corpus is real and it is misleading if queried naively: 520 of 897 posts are from the
// Twitter-agency era and 12 are on his current domain. "What worked?" asked against the whole archive
// answers "Twitter growth content in 2023" — confidently, with real numbers behind it, and wrong in a
// way that would steer every draft the producer writes.
//
// So the cases below are mostly about REFUSING to generalise, which is the opposite of what a
// baseline usually gets built to do.

import { slice, profile, reach, compareToBaseline, provenance, MIN_SLICE }
  from '../pods/brand/baseline.mjs';

const ok = (pass, detail = '') => ({ pass, detail });

const row = (over = {}) => ({
  date: '2023-07-01', era: 'agency', on_domain: false, is_quote: false, is_thin: false,
  publishable_today: true, format: 'short-stack', line_count: 3, median_sentence_words: 8,
  word_count: 40, starts_capital: true, em_dashes: 0, has_link: false, has_emoji: false,
  second_person: true, reactions: 5, shares: 1, hook: 'A hook', ...over,
});

// 40 clean on-domain posts — a slice big enough to describe someone.
const BIG = Array.from({ length: 40 }, (_, i) => row({ on_domain: true, era: 'current', date: '2026-0' + (i % 9 + 1) + '-01' }));

export default {
  agent: 'brand-baseline',
  cases: [
    // ── the refusals ──────────────────────────────────────────────────────────────────────────────
    { name: '🚨 a thin slice does NOT produce a confident profile', run: () => {
      // Twelve on-domain posts across eight years is an anecdote. Calling it a baseline launders it
      // into a fact, and every draft afterwards gets measured against a dozen old tweets.
      const p = profile(Array.from({ length: 12 }, () => row()));
      return ok(p.enough === false && /too few/.test(p.note), JSON.stringify({ n: p.n, note: p.note }));
    } },

    { name: 'a slice at the threshold does produce one', run: () => {
      const p = profile(BIG);
      return ok(p.enough === true && p.n === 40 && p.note === '', JSON.stringify({ n: p.n, enough: p.enough }));
    } },

    { name: '🚨 comparing against no baseline says so instead of guessing', run: () => {
      const c = compareToBaseline({ line_count: 99 }, profile([row()]));
      return ok(!c.comparable && /no usable baseline/.test(c.notes[0]), JSON.stringify(c));
    } },

    { name: '🚨 provenance refuses to let "897 posts analysed" stand alone', run: () => {
      // True, and on its own misleading. The line has to carry the caveat with it.
      const all = [...Array.from({ length: 885 }, () => row()), ...Array.from({ length: 12 }, () => row({ on_domain: true }))];
      const p = provenance(all);
      return ok(p.total === 897 && p.usable === 12 && p.trustworthy === false
        && /only 12 are on-domain/.test(p.line) && /too few to generalise/.test(p.line), p.line);
    } },

    { name: 'provenance says it is trustworthy once the slice is real', run: () =>
      ok(provenance(BIG).trustworthy === true && !/too few/.test(provenance(BIG).line))},

    // ── slicing ───────────────────────────────────────────────────────────────────────────────────
    { name: 'the defaults are the conservative ones', run: () => {
      // publishable + not a quote, because the common mistake is asking the whole archive and
      // believing the answer.
      const rows = [row(), row({ publishable_today: false }), row({ is_quote: true }), row({ is_thin: true })];
      return ok(slice(rows).length === 1, String(slice(rows).length));
    } },

    { name: 'on-domain and era filters compose', run: () => {
      const rows = [row({ on_domain: true, era: 'current' }), row({ on_domain: true, era: 'agency' }), row()];
      return ok(slice(rows, { onDomain: true }).length === 2
        && slice(rows, { onDomain: true, era: 'current' }).length === 1);
    } },

    { name: 'a date floor works', run: () => {
      const rows = [row({ date: '2019-01-01' }), row({ date: '2026-01-01' })];
      return ok(slice(rows, { since: '2025-01-01' }).length === 1);
    } },

    // ── the profile itself ────────────────────────────────────────────────────────────────────────
    { name: 'the profile measures rather than describes', run: () => {
      const p = profile(BIG);
      return ok(p.median_line_count === 3 && p.median_sentence_words === 8
        && p.starts_capital_pct === 100 && p.em_dash_posts === 0, JSON.stringify(p).slice(0, 160));
    } },

    { name: 'format distribution is counted', run: () => {
      const p = profile([...BIG, row({ format: 'list', on_domain: true })]);
      return ok(p.formats['short-stack'] === 40 && p.formats.list === 1, JSON.stringify(p.formats));
    } },

    // ── reach is reported, never ranked on ────────────────────────────────────────────────────────
    { name: '⚠ reach comes back as counts with a caveat, not a leaderboard', run: () => {
      // The whole departure from the source material is that reach is not the target. There is
      // deliberately no "top 10 to imitate" here.
      const r = reach([row({ reactions: 3 }), row({ reactions: 30, shares: 5, date: '2023-09-09' })]);
      return ok(r.best.engagement === 35 && /nothing here is a ranking/.test(r.note), JSON.stringify(r));
    } },

    { name: 'a slice with no recorded engagement says so', run: () =>
      ok(reach([row({ reactions: null })]).n === 0) },

    // ── comparing a draft ─────────────────────────────────────────────────────────────────────────
    { name: 'a draft far off his shape is flagged in sentences, not scored', run: () => {
      const c = compareToBaseline({ line_count: 20, median_sentence_words: 22, has_emoji: true }, profile(BIG));
      return ok(c.comparable && c.notes.length >= 2 && c.notes.every((n) => typeof n === 'string'),
        JSON.stringify(c.notes));
    } },

    { name: 'a draft that matches his shape gets no notes', run: () =>
      ok(compareToBaseline({ line_count: 3, median_sentence_words: 8 }, profile(BIG)).notes.length === 0) },

    { name: 'empty / garbage input does not throw', run: () => {
      const p = profile();
      return ok(p.n === 0 && !p.enough && slice().length === 0 && reach().n === 0
        && provenance().total === 0 && !compareToBaseline().comparable && MIN_SLICE > 0);
    } },
  ],
};
