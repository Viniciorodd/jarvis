// Regression suite for incumbent intelligence & recompete timing (pods/gov/incumbent.mjs). Pins the
// DETERMINISTIC who/when the operator relies on: the incumbent is the latest-POP-end award (tie-break dollars),
// an empty lane yields NO fabricated incumbent, and the recompete window is classified correctly by months-to-end.

import { pickIncumbent, recompeteTiming } from '../pods/gov/incumbent.mjs';

const ok = (pass, detail = '') => ({ pass, detail });
const day = 86400000, month = 30.44 * day;
const NOW = new Date('2026-07-24T00:00:00Z');
const inMonths = (m) => new Date(NOW.getTime() + m * month).toISOString().slice(0, 10);

export default {
  agent: 'gov-incumbent',
  cases: [
    { name: 'pickIncumbent: the award with the LATEST period-of-performance end wins', run: () => {
      const inc = pickIncumbent([
        { recipient: 'Old Co', amount: 500000, date: '2021-01-01', endDate: '2024-12-31' },
        { recipient: 'Current Co', amount: 200000, date: '2023-01-01', endDate: '2026-12-31' },
      ]);
      return ok(inc && inc.recipient === 'Current Co', JSON.stringify(inc));
    } },

    { name: 'pickIncumbent: same end date → tie-break by dollars', run: () => {
      const inc = pickIncumbent([
        { recipient: 'Small', amount: 100000, endDate: '2026-12-31' },
        { recipient: 'Big', amount: 900000, endDate: '2026-12-31' },
      ]);
      return ok(inc.recipient === 'Big', JSON.stringify(inc));
    } },

    { name: 'pickIncumbent: empty / no-usable awards → null (NEVER a fabricated incumbent)', run: () =>
      ok(pickIncumbent([]) === null && pickIncumbent([{ recipient: '', amount: 0 }]) === null) },

    { name: 'recompeteTiming: ends in ~8 months → "window" with monthsToEnd ≈ 8', run: () => {
      const r = recompeteTiming(inMonths(8), NOW);
      return ok(r.status === 'window' && Math.abs(r.monthsToEnd - 8) <= 1, JSON.stringify(r));
    } },

    { name: 'recompeteTiming: ended ~2 months ago → "recompeting-now"', run: () => {
      const r = recompeteTiming(inMonths(-2), NOW);
      return ok(r.status === 'recompeting-now', JSON.stringify(r));
    } },

    { name: 'recompeteTiming: ended ~14 months ago → "stale"', run: () => {
      const r = recompeteTiming(inMonths(-14), NOW);
      return ok(r.status === 'stale', JSON.stringify(r));
    } },

    { name: 'recompeteTiming: ends in ~30 months → "locked"', run: () => {
      const r = recompeteTiming(inMonths(30), NOW);
      return ok(r.status === 'locked' && r.monthsToEnd > 12, JSON.stringify(r));
    } },

    { name: 'recompeteTiming: no/invalid POP end → "unknown" (never a guessed date)', run: () =>
      ok(recompeteTiming('', NOW).status === 'unknown' && recompeteTiming('not-a-date', NOW).status === 'unknown') },
  ],
};
