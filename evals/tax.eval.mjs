// Evals for the Tax & Wealth pod (Sage / TAX-01) — tax math in CODE (directive #1), eval-pinned
// known-answer scenarios. Pure functions only — no network, no disk.

import { TY2026 } from '../pods/tax/constants-2026.mjs';
import { seTax, federalIncomeTax, qbiDeduction, paTax, localEit } from '../pods/tax/engine.mjs';
const C = TY2026;

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

    { name: 'seTax: $80,000 net SE → $11,303.64 total, $5,651.82 half (known-answer)',
      run: () => {
        const r = seTax({ netSeCents: 8000000, C });
        return { pass: r.totalCents === 1130364 && r.halfCents === 565182 && r.baseCents === 7388000,
          detail: `${r.totalCents}/${r.halfCents}` };
      } },

    { name: 'seTax: SS portion caps at the wage base; Medicare does not',
      run: () => {
        const r = seTax({ netSeCents: 30000000, C }); // $300k net SE
        const base = Math.round(30000000 * C.seBase); // 27,705,000
        const ssCap = Math.round(C.ssWageBaseCents * C.seSsRate);
        const addl = Math.round((base - C.addlMedicareThresholdCents) * C.addlMedicareRate);
        return { pass: r.ssCents === ssCap && r.medicareCents === Math.round(base * C.seMedicareRate)
          && r.addlMedicareCents === addl, detail: JSON.stringify(r) };
      } },

    { name: 'federalIncomeTax: $46,598.54 taxable → $5,343.82 (single, TY2026)',
      run: () => ({ pass: federalIncomeTax(4659854, C) === 534382, detail: String(federalIncomeTax(4659854, C)) }) },

    { name: 'federalIncomeTax: $0 → $0; bracket edge exact at 10% band top',
      run: () => ({ pass: federalIncomeTax(0, C) === 0 && federalIncomeTax(1240000, C) === 124000,
        detail: String(federalIncomeTax(1240000, C)) }) },

    { name: 'qbiDeduction: min(20% QBI base, 20% taxable-before); flags over threshold',
      run: () => {
        const a = qbiDeduction({ qbiBaseCents: 7434818, taxableBeforeQbiCents: 5824818, C });
        const b = qbiDeduction({ qbiBaseCents: 30000000, taxableBeforeQbiCents: 30000000, C });
        return { pass: a.deductionCents === 1164964 && a.overThreshold === false && b.overThreshold === true,
          detail: `${a.deductionCents} over=${b.overThreshold}` };
      } },

    { name: 'paTax 3.07% + localEit: $80,000 → $2,456.00 PA, $800 at 1%',
      run: () => ({ pass: paTax(8000000, C) === 245600 && localEit(8000000, 1.0) === 80000,
        detail: `${paTax(8000000, C)}/${localEit(8000000, 1.0)}` }) },
  ],
};
