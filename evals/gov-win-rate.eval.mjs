// Regression suite for the Projected-vs-Actual win-rate engine (pods/gov/win-rate.mjs, REDOS Port #2). Pins the
// DETERMINISTIC forecast grading the operator's recalibration decisions rest on: win-rate by band, price-to-win
// bias direction, LOE bias, and the concrete recalibration hints — the machine learning whether its own bid
// forecasts came true (never auto-rewriting the eval-pinned Bid Fit weights; the hints are recommendations).

import { forecastAccuracy, recalibrationHints } from '../pods/gov/win-rate.mjs';

const ok = (pass, detail = '') => ({ pass, detail });

export default {
  agent: 'gov-win-rate',
  cases: [
    { name: 'forecastAccuracy: win-rate by band + overall', run: () => {
      const a = forecastAccuracy([
        { band: 'PURSUE', result: 'won' }, { band: 'PURSUE', result: 'won' }, { band: 'PURSUE', result: 'lost' },
        { band: 'THIN', result: 'lost' }, { band: 'REVIEW', result: 'won' },
      ]);
      return ok(a.sampleSize === 5 && a.wins === 3 && a.overallWinRate === 60 && a.byBand.PURSUE.winRate === 67 && a.byBand.THIN.winRate === 0, JSON.stringify(a.byBand));
    } },

    { name: 'price-to-win bias: + means we priced ABOVE the winner', run: () => {
      const a = forecastAccuracy([
        { band: 'PURSUE', result: 'lost', priceToWin: 110000, winningPrice: 100000 }, // +10%
        { band: 'PURSUE', result: 'lost', priceToWin: 120000, winningPrice: 100000 }, // +20%
      ]);
      return ok(a.priceToWinBiasPct === 15, `bias=${a.priceToWinBiasPct}`);
    } },

    { name: 'LOE bias: negative means we UNDER-estimated proposal hours', run: () => {
      const a = forecastAccuracy([{ band: 'PURSUE', result: 'won', loeHours: 20, actualLoe: 40 }]); // (20-40)/40 = -50%
      return ok(a.loeBiasPct === -50, `loe=${a.loeBiasPct}`);
    } },

    { name: 'ignores open (undecided) bids — only closed count', run: () => {
      const a = forecastAccuracy([{ band: 'PURSUE', result: 'won' }, { band: 'PURSUE' }, { band: 'PURSUE', result: null }]);
      return ok(a.sampleSize === 1 && a.overallWinRate === 100, JSON.stringify(a));
    } },

    { name: 'recalibrationHints: a low PURSUE win-rate → tighten-the-weights recommendation', run: () => {
      const a = forecastAccuracy([
        { band: 'PURSUE', result: 'lost' }, { band: 'PURSUE', result: 'lost' }, { band: 'PURSUE', result: 'lost' }, { band: 'PURSUE', result: 'won' },
      ]); // 25% PURSUE win rate over 4
      const h = recalibrationHints(a);
      return ok(h.some((x) => x.severity === 'recalibrate' && /over.?optimistic|too optimistic|tighten/i.test(x.text)), JSON.stringify(h.map((x) => x.severity)));
    } },

    { name: 'recalibrationHints: pricing-above-winners flag when price-to-win runs high', run: () => {
      const h = recalibrationHints(forecastAccuracy([
        { band: 'PURSUE', result: 'lost', priceToWin: 115000, winningPrice: 100000 },
        { band: 'PURSUE', result: 'lost', priceToWin: 115000, winningPrice: 100000 },
      ]));
      return ok(h.some((x) => x.severity === 'pricing' && /ABOVE/.test(x.text)), JSON.stringify(h));
    } },

    { name: 'recalibrationHints: healthy record → "tracking reality, no recalibration" (never a false alarm)', run: () => {
      const h = recalibrationHints(forecastAccuracy([
        { band: 'PURSUE', result: 'won' }, { band: 'PURSUE', result: 'won' }, { band: 'REVIEW', result: 'won' }, { band: 'THIN', result: 'lost' },
      ]));
      return ok(h.length === 1 && h[0].severity === 'ok', JSON.stringify(h));
    } },
  ],
};
