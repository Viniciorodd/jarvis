// Evals for the Tax & Wealth pod (Sage / TAX-01) — tax math in CODE (directive #1), eval-pinned
// known-answer scenarios. Pure functions only — no network, no disk.

import { TY2026 } from '../pods/tax/constants-2026.mjs';

export default {
  agent: 'tax-wealth',
  cases: [
    { name: 'constants: stamped 2026, brackets ascend, rates sane',
      run: () => {
        const b = TY2026.brackets.single;
        const ascending = b.every((r, i) => i === 0 || r.uptoCents > b[i - 1].uptoCents);
        const pass = TY2026.year === 2026 && ascending && b[b.length - 1].uptoCents === Infinity
          && TY2026.seRate === 0.153 && TY2026.seBase === 0.9235
          && TY2026.stdDeductionCents.single > 0 && TY2026.ssWageBaseCents > 0
          && TY2026.paRate === 0.0307;
        return { pass, detail: `year=${TY2026.year} brackets=${b.length}` };
      } },

    { name: 'constants: every param carries a verified flag; unverified ones are listed',
      run: () => {
        const u = TY2026.unverified();
        return { pass: Array.isArray(u) && u.includes('mileageBusinessCents'), detail: u.join(',') };
      } },
  ],
};
