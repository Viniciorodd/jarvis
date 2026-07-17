// Regression suite for PRICE-TO-WIN (pods/gov/price-to-win.mjs) — the market reference for a bid. This is
// MONEY MATH, so it is pinned exactly: percentiles interpolate deterministically, junk rows never enter the
// distribution, the confidence grades are hard boundaries, and the verdict bands are fixed. The doctrine line
// under test: a THIN sample must never sound confident — a low-confidence note MUST say so out loud.
// No network anywhere: every case feeds amounts arrays straight into the pure core.

import { percentile, summarizeAwards, confidenceOf, priceToWinVerdict, targetRange, priceToWinLine, fyWindow } from '../pods/gov/price-to-win.mjs';

const ok = (pass, detail = '') => ({ pass, detail });

const SAMPLE = [10, 20, 30, 40];                       // p25 17.5 · median 25 · p75 32.5
const stats = (a) => summarizeAwards(a);
const MARKET = stats([40000, 50000, 60000, 70000, 80000, 90000, 100000, 110000]); // p25 57.5k · median 75k · p75 92.5k

// A priceToWin()-shaped result, minus the sampling flags each case sets for itself.
const LINE_BASE = { ok: true, naics: '561720', state: 'PA', bid: 61000, stats: MARKET, confidence: 'high', targetRange: targetRange(MARKET), verdict: priceToWinVerdict({ bid: 61000, stats: MARKET }) };

export default {
  agent: 'gov-price-to-win',
  cases: [
    { name: 'percentile interpolates linearly ([10,20,30,40] p50 === 25)',
      run: () => ok(percentile(SAMPLE, 50) === 25 && percentile(SAMPLE, 25) === 17.5 && percentile(SAMPLE, 75) === 32.5,
        `p25=${percentile(SAMPLE, 25)} p50=${percentile(SAMPLE, 50)} p75=${percentile(SAMPLE, 75)}`) },

    { name: 'percentile: empty → null, single value → that value, p0/p100 → min/max',
      run: () => ok(percentile([], 50) === null && percentile([7], 50) === 7 && percentile(SAMPLE, 0) === 10 && percentile(SAMPLE, 100) === 40,
        `[]→${percentile([], 50)} [7]→${percentile([7], 50)} p0=${percentile(SAMPLE, 0)} p100=${percentile(SAMPLE, 100)}`) },

    { name: 'summarizeAwards filters out zero / negative / NaN / junk before the math',
      run: () => { const s = stats([0, -500, NaN, 'abc', null, 10, 20, 30, 40]);
        return ok(s.n === 4 && s.min === 10 && s.max === 40 && s.median === 25, `n=${s.n} min=${s.min} median=${s.median} max=${s.max}`); } },

    { name: 'summarizeAwards sorts unsorted input and computes min/median/max/mean',
      run: () => { const s = stats([40, 10, 30, 20]);
        return ok(s.min === 10 && s.max === 40 && s.median === 25 && s.mean === 25, `min=${s.min} median=${s.median} max=${s.max} mean=${s.mean}`); } },

    { name: 'summarizeAwards: empty sample → n 0 and EVERY stat null (no data is not zero)',
      run: () => { const s = stats([]);
        const allNull = [s.min, s.p25, s.median, s.p75, s.max, s.mean].every((v) => v === null);
        return ok(s.n === 0 && allNull, JSON.stringify(s)); } },

    { name: 'confidenceOf boundaries: 0→none, 1/4→low, 5/19→medium, 20+→high',
      run: () => ok(confidenceOf(0) === 'none' && confidenceOf(1) === 'low' && confidenceOf(4) === 'low'
        && confidenceOf(5) === 'medium' && confidenceOf(19) === 'medium' && confidenceOf(20) === 'high' && confidenceOf(200) === 'high',
        `0=${confidenceOf(0)} 4=${confidenceOf(4)} 5=${confidenceOf(5)} 19=${confidenceOf(19)} 20=${confidenceOf(20)}`) },

    { name: "verdict: a bid inside p25..p75 is 'competitive'",
      run: () => { const v = priceToWinVerdict({ bid: 75000, stats: MARKET });
        return ok(v.position === 'competitive' && v.confidence === 'medium', `${v.position} (${v.confidence}) @p${v.percentileOfBid}`); } },

    { name: "verdict: a bid under p25 is 'below-market'; a bid over p75 is 'above-market'",
      run: () => { const lo = priceToWinVerdict({ bid: 45000, stats: MARKET }); const hi = priceToWinVerdict({ bid: 105000, stats: MARKET });
        return ok(lo.position === 'below-market' && hi.position === 'above-market', `45k→${lo.position} · 105k→${hi.position}`); } },

    { name: "verdict: 'unknown' when there are no comparable awards (n===0)",
      run: () => { const v = priceToWinVerdict({ bid: 61000, stats: stats([]) });
        return ok(v.position === 'unknown' && v.percentileOfBid === null && v.confidence === 'none' && /no market reference/i.test(v.note), `${v.position}: ${v.note.slice(0, 60)}`); } },

    { name: "verdict: 'unknown' when the bid is null / NaN / non-positive (nothing to compare)",
      run: () => { const a = priceToWinVerdict({ bid: null, stats: MARKET }); const b = priceToWinVerdict({ bid: NaN, stats: MARKET }); const c = priceToWinVerdict({ bid: 0, stats: MARKET });
        return ok([a, b, c].every((v) => v.position === 'unknown' && v.percentileOfBid === null), `${a.position}/${b.position}/${c.position}`); } },

    { name: 'percentileOfBid is deterministic and monotonic: median bid → 50th, ≥max → 100th, ≤min → 0th',
      run: () => { const mid = priceToWinVerdict({ bid: MARKET.median, stats: MARKET }).percentileOfBid;
        const top = priceToWinVerdict({ bid: MARKET.max + 1, stats: MARKET }).percentileOfBid;
        const bot = priceToWinVerdict({ bid: 1, stats: MARKET }).percentileOfBid;
        const p25 = priceToWinVerdict({ bid: MARKET.p25, stats: MARKET }).percentileOfBid;
        return ok(mid === 50 && top === 100 && bot === 0 && p25 === 25 && bot < p25 && p25 < mid && mid < top, `min→${bot} p25→${p25} median→${mid} >max→${top}`); } },

    { name: 'HONESTY: a low-confidence (n≤4) verdict note SAYS the sample is too small to be reliable',
      run: () => { const thin = stats([50000, 60000, 70000]); const v = priceToWinVerdict({ bid: 60000, stats: thin });
        return ok(v.confidence === 'low' && /too small to be reliable/i.test(v.note) && /3 comparable award/i.test(v.note), `${v.confidence}: ${v.note}`); } },

    { name: 'HONESTY: a high-confidence note does NOT carry the small-sample warning',
      run: () => { const big = stats(Array.from({ length: 25 }, (_, i) => 50000 + i * 1000)); const v = priceToWinVerdict({ bid: 60000, stats: big });
        return ok(v.confidence === 'high' && !/too small/i.test(v.note) && /not a recommended bid/i.test(v.note), `${v.confidence}: ${v.note.slice(0, 80)}`); } },

    { name: 'HONESTY: a TRUNCATED (top-N) slice is never passed off as the whole market',
      run: () => { const cut = priceToWinLine({ ...LINE_BASE, complete: false, truncated: true });
        return ok(/not the whole market/i.test(cut) && /skews high/i.test(cut), cut); } },

    // ── The full-population contract: when we read EVERY award, a skew hedge would be FALSE. ──
    { name: 'complete:true → the line carries NO skew / "largest N" caveat (the read is exact)',
      run: () => { const full = priceToWinLine({ ...LINE_BASE, complete: true, truncated: false, population: 8 });
        return ok(!/skews high/i.test(full) && !/largest/i.test(full) && !/whole market/i.test(full) && /median/.test(full) && /percentile/.test(full), full); } },

    { name: 'OVER CAP: a lane too large to sample → position unknown, percentileOfBid null, "narrow the lane"',
      run: () => { const v = priceToWinVerdict({ bid: 61000, stats: MARKET, overCap: true, population: 12500 });
        return ok(v.position === 'unknown' && v.percentileOfBid === null && /too many to sample reliably/i.test(v.note) && /narrow the lane/i.test(v.note) && /12,500/.test(v.note), `${v.position}/${v.percentileOfBid}: ${v.note.slice(0, 90)}`); } },

    { name: 'OVER CAP: the line refuses a price read instead of quoting a biased median',
      run: () => { const l = priceToWinLine({ ...LINE_BASE, complete: false, overCap: true, truncated: true, population: 12500 });
        return ok(/too many to sample reliably/i.test(l) && /narrow the lane/i.test(l) && !/percentile/i.test(l) && !/competitive band/i.test(l), l); } },

    { name: 'the overCap gate is separate from complete: an unconfirmed population still reports a position',
      run: () => { const v = priceToWinVerdict({ bid: 61000, stats: MARKET, overCap: false, population: null });
        return ok(v.position === 'competitive' && v.percentileOfBid === 30, `${v.position} @p${v.percentileOfBid}`); } },

    { name: 'fyWindow spans the trailing N COMPLETE FYs and reports its own span (count/search filters match)',
      run: () => { const w = fyWindow(3, new Date('2026-07-17'));
        return ok(w.start === '2022-10-01' && w.end === '2025-09-30' && w.years === 3, `${w.start}..${w.end} (${w.years} FYs) ${w.label}`); } },

    { name: 'targetRange is the p25→median band, and nulls when the sample is empty',
      run: () => { const t = targetRange(MARKET); const e = targetRange(stats([]));
        return ok(t.low === MARKET.p25 && t.high === MARKET.median && e.low === null && e.high === null, `${t.low}–${t.high} · empty→${e.low}/${e.high}`); } },
  ],
};
