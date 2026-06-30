// Regression suite for the Research & Risk desk (pods/research-risk/desk.mjs) — doctrine §7.
// The one claim that matters: this desk MONITORS + JOURNALS and NEVER executes. These cases pin the
// structural refusal (assertMonitorOnly) and the pure notable-move detector. If the refusal regresses,
// the desk could place a trade — the exact failure §7 forbids.

import { assertMonitorOnly, notableMoves, EXECUTION_VERBS } from '../pods/research-risk/desk.mjs';

export default {
  agent: 'research-risk',
  cases: [
    { name: 'refuses every execution verb (buy/sell/short/trade/order/wire)',
      run: () => {
        const verbs = ['buy 100 NVDA', 'sell my AAPL', 'short the SPY', 'place a trade', 'execute the order', 'wire $5k to the brokerage', 'open a position in TSLA', 'rebalance the portfolio'];
        const allRefused = verbs.every((v) => assertMonitorOnly(v).ok === false);
        return { pass: allRefused, detail: allRefused ? 'all refused' : 'a verb slipped through' };
      } },
    { name: 'allows a pure monitor/journal intent',
      run: () => ({ pass: assertMonitorOnly('monitor the watchlist and journal unusual volume').ok === true, detail: '' }) },
    { name: 'EXECUTION_VERBS matches money/brokerage actions but not "monitor"',
      run: () => ({ pass: EXECUTION_VERBS.test('liquidate the position') === true && EXECUTION_VERBS.test('monitor the market') === false, detail: '' }) },
    { name: 'notableMoves flags only moves beyond the threshold, sorted by magnitude',
      run: () => {
        const q = [{ ticker: 'A', changePct: 1.2, price: 10 }, { ticker: 'B', changePct: -6.5, price: 20 }, { ticker: 'C', changePct: 4.5, price: 30 }];
        const n = notableMoves(q, 4);
        return { pass: n.length === 2 && n[0].ticker === 'B' && n[1].ticker === 'C' && n[1].direction === 'up', detail: JSON.stringify(n.map((x) => x.ticker)) };
      } },
    { name: 'notableMoves ignores quotes with errors / missing data',
      run: () => {
        const q = [{ ticker: 'X', error: 'no data' }, { ticker: 'Y', changePct: 9, price: 5 }, null];
        const n = notableMoves(q, 4);
        return { pass: n.length === 1 && n[0].ticker === 'Y', detail: JSON.stringify(n) };
      } },
  ],
};
