// Regression suite for the income ledger (control-plane/money.mjs). Pins the parse + monthly-total math
// the operator relies on to know where he stands vs the $10k/mo goal.

import { parseAmount, parseLedger, summarize } from '../control-plane/money.mjs';

const ok = (pass, detail = '') => ({ pass, detail });
const LEDGER = `# 💵 Income Log

| Date | Source | Amount | Notes |
|---|---|---|---|
| 2026-06-03 | Fiverr | $500 | thumbnail order |
| 2026-06-20 | Gov payment | $9,800 | West Point mobilization |
| 2026-05-28 | Cash | $200 | odd job |
`;

export default {
  agent: 'money',
  cases: [
    { name: 'parseAmount strips $ and commas', run: () => ok(parseAmount('$9,800') === 9800 && parseAmount('500') === 500 && parseAmount('') === 0) },
    { name: 'parseLedger reads rows, skips header + separator', run: () => {
      const e = parseLedger(LEDGER);
      return ok(e.length === 3 && e[0].source === 'Fiverr' && e[1].amount === 9800 && e[2].notes === 'odd job', JSON.stringify(e.map((x) => x.amount)));
    } },
    { name: 'summarize totals the current month vs goal', run: () => {
      const s = summarize(parseLedger(LEDGER), { month: '2026-06', goal: 10000 });
      return ok(s.mtd === 10300 && s.pct === 100 && s.remaining === 0 && s.total === 10500, JSON.stringify(s));
    } },
    { name: 'summarize shows the gap when under goal', run: () => {
      const s = summarize(parseLedger(LEDGER), { month: '2026-05', goal: 10000 });
      return ok(s.mtd === 200 && s.pct === 2 && s.remaining === 9800, JSON.stringify(s));
    } },
  ],
};
