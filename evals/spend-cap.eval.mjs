// Regression suite for the deterministic spending guard (control-plane/spend.mjs).
// This is the code that enforces doctrine directive #1 — if it regresses, money can leak.

import { checkSpend } from '../control-plane/spend.mjs';

const caps = { actionCapUsd: 2, dailyCapUsd: 5 };
const r = (amountUsd, todaySpentUsd = 0) => checkSpend({ amountUsd, todaySpentUsd, ...caps });

export default {
  agent: 'spend-guard',
  cases: [
    { name: 'small spend within both caps is allowed',
      run: () => { const x = r(0.5, 0); return { pass: x.allow === true, detail: x.reason }; } },
    { name: 'spend over per-action cap is denied',
      run: () => { const x = r(3, 0); return { pass: x.allow === false, detail: x.reason }; } },
    { name: 'spend that would exceed the daily cap is denied',
      run: () => { const x = r(1, 4.5); return { pass: x.allow === false, detail: x.reason }; } },
    { name: 'spend exactly at the per-action cap is allowed',
      run: () => { const x = r(2, 0); return { pass: x.allow === true, detail: x.reason }; } },
    { name: 'spend exactly hitting the daily cap is allowed',
      run: () => { const x = r(1, 4); return { pass: x.allow === true, detail: x.reason }; } },
    { name: 'negative amount is rejected (no refunds-as-spend trick)',
      run: () => { const x = r(-5, 0); return { pass: x.allow === false, detail: x.reason }; } },
    { name: 'NaN amount is rejected',
      run: () => { const x = r('abc', 0); return { pass: x.allow === false, detail: x.reason }; } },
    { name: 'remaining-today is reported correctly after an allowed spend',
      run: () => { const x = r(1, 1); return { pass: x.remainingTodayUsd === 3, detail: 'remaining=' + x.remainingTodayUsd }; } },
  ],
};
