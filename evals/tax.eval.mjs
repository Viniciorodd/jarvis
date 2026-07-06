// Evals for the Tax & Wealth pod (Sage / TAX-01) — tax math in CODE (directive #1), eval-pinned
// known-answer scenarios. Pure functions only — no network, no disk.

import fs from 'node:fs';
import { TY2026 } from '../pods/tax/constants-2026.mjs';
import { seTax, federalIncomeTax, qbiDeduction, paTax, localEit, annualDepreciation, k1Share, estimate, quarterlies } from '../pods/tax/engine.mjs';
import { CATEGORIES, validCategory, toCents as ledgerToCents, entryHash, makeEntry, dedupe, summarize } from '../pods/tax/ledger.mjs';
import { parseCapture, ruleCategory } from '../pods/tax/capture.mjs';
const C = TY2026;
const REG = JSON.parse(fs.readFileSync(new URL('../pods/tax/entities.json', import.meta.url), 'utf8'));

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

    { name: 'depreciation: $100k basis, in service 2026-03, 27.5y mid-month → $2,878.79 year 1',
      run: () => {
        const y1 = annualDepreciation({ basisCents: 10000000, inServiceISO: '2026-03-15', taxYear: 2026, C });
        const later = annualDepreciation({ basisCents: 10000000, inServiceISO: '2024-03-15', taxYear: 2026, C });
        const missing = annualDepreciation({ basisCents: null, inServiceISO: null, taxYear: 2026, C });
        return { pass: y1 === 287879 && later === 363636 && missing === 0, detail: `${y1}/${later}/${missing}` };
      } },

    { name: 'k1Share: 19% + 81% of any net sums to exactly 100% (no lost cents)',
      run: () => {
        const a = k1Share(1000001, 19), b = 1000001 - k1Share(1000001, 19); // mother's share = remainder
        return { pass: a === 190000 && a + b === 1000001, detail: `${a}+${b}` };
      } },

    { name: 'estimate: $80k Sch C, no K-1 → fed 5,343.82 + SE 11,303.64 + PA 2,456 + local 800 (1%)',
      run: () => {
        const e = estimate({ C, schCNetCents: [{ id: 'rodgate', netCents: 8000000 }], k1NetCents: 0,
          otherIncomeCents: 0, localEitRatePct: 1.0, estPaidCents: 0 });
        const pass = e.se.totalCents === 1130364 && e.federalCents === 534382
          && e.paCents === 245600 && e.localCents === 80000
          && e.totalCents === 1130364 + 534382 + 245600 + 80000
          && e.setAsidePct >= 24 && e.setAsidePct <= 26;
        return { pass, detail: `total=${e.totalCents} setAside=${e.setAsidePct}` };
      } },

    { name: 'estimate: K-1 LOSS is excluded + flagged (passive-loss caution), never subtracted silently',
      run: () => {
        const e = estimate({ C, schCNetCents: [{ id: 'rodgate', netCents: 8000000 }], k1NetCents: -5000000,
          otherIncomeCents: 0, localEitRatePct: 1.0, estPaidCents: 0 });
        const base = estimate({ C, schCNetCents: [{ id: 'rodgate', netCents: 8000000 }], k1NetCents: 0,
          otherIncomeCents: 0, localEitRatePct: 1.0, estPaidCents: 0 });
        return { pass: e.totalCents === base.totalCents && e.flags.includes('k1-loss-excluded'),
          detail: e.flags.join(',') };
      } },

    { name: 'quarterlies: lesser of 90% current vs 100% prior, spread over remaining due dates',
      run: () => {
        const q = quarterlies({ C, projectedTaxCents: 2000000, priorYearTaxCents: 1500000,
          priorAgiCents: 9000000, paidCents: 400000, todayISO: '2026-07-05' });
        return { pass: q.requiredAnnualCents === 1500000 && q.basis === 'prior-year'
          && q.remaining.length === 2 && q.remaining[0].due === '2026-09-15'
          && q.remaining[0].amountCents === 550000 && q.remaining[1].amountCents === 550000,
          detail: JSON.stringify(q.remaining) };
      } },

    { name: 'quarterlies: prior AGI > $150k uses the 110% prior-year target',
      run: () => {
        const q = quarterlies({ C, projectedTaxCents: 9000000, priorYearTaxCents: 2000000,
          priorAgiCents: 20000000, paidCents: 0, todayISO: '2026-07-05' });
        return { pass: q.requiredAnnualCents === 2200000, detail: String(q.requiredAnnualCents) };
      } },

    { name: 'taxonomy: real form lines exist; junk category rejected (LLM can never invent one)',
      run: () => ({ pass: validCategory('schC:supplies') && validCategory('schE:repairs')
        && validCategory('income:hap') && !validCategory('schC:vibes') && !validCategory(''),
        detail: Object.keys(CATEGORIES).length + ' categories' }) },

    { name: 'ledger toCents: "$1,234.56" → 123456; junk/zero/negative/oversize → null',
      run: () => ({ pass: ledgerToCents('$1,234.56') === 123456 && ledgerToCents('43') === 4300
        && ledgerToCents('nope') === null && ledgerToCents(0) === null && ledgerToCents(-5) === null
        && ledgerToCents(2000000) === null,
        detail: String(ledgerToCents('$1,234.56')) }) },

    { name: 'makeEntry: valid in → entry with hash + status; bad category or amount → error',
      run: () => {
        const ok = makeEntry({ dateISO: '2026-07-05', amount: '43', payee: 'Home Depot',
          entity: 'brickave-llc', property: 'brick-ave', category: 'schE:repairs', source: 'capture' });
        const badCat = makeEntry({ dateISO: '2026-07-05', amount: '43', payee: 'X', entity: 'rodgate',
          category: 'schC:vibes', source: 'capture' });
        const badAmt = makeEntry({ dateISO: '2026-07-05', amount: 'soon', payee: 'X', entity: 'rodgate',
          category: 'schC:supplies', source: 'capture' });
        return { pass: ok.cents === 4300 && typeof ok.hash === 'string' && ok.status === 'confirmed'
          && badCat.error && badAmt.error, detail: ok.hash };
      } },

    { name: 'dedupe: identical (date, cents, payee, entity) collapses — re-import cannot double-count',
      run: () => {
        const e = { dateISO: '2026-07-05', amount: 43, payee: 'HD', entity: 'rodgate',
          category: 'schC:supplies', source: 'csv' };
        const a = makeEntry(e), b = makeEntry(e);
        return { pass: dedupe([a, b]).length === 1, detail: `${a.hash}==${b.hash}` };
      } },

    { name: 'summarize: entries roll up per entity; LLC books separate; est-tax payments totaled',
      run: () => {
        const reg = { entities: [{ id: 'rodgate', kind: 'schC' }, { id: 'brickave-llc', kind: 'partnership', ownershipPct: 19 }] };
        const es = [
          makeEntry({ dateISO: '2026-02-01', amount: 1000, payee: 'Agency', entity: 'rodgate', category: 'income:gross-receipts', source: 'capture' }),
          makeEntry({ dateISO: '2026-03-01', amount: 200, payee: 'Staples', entity: 'rodgate', category: 'schC:supplies', source: 'capture' }),
          makeEntry({ dateISO: '2026-03-05', amount: 1850, payee: 'HAP', entity: 'brickave-llc', property: 'brick-ave', category: 'income:hap', source: 'capture' }),
          makeEntry({ dateISO: '2026-04-10', amount: 300, payee: 'IRS', entity: 'rodgate', category: 'meta:est-tax-payment', source: 'capture' }),
        ];
        const s = summarize(es, reg);
        return { pass: s.schCByEntity.rodgate.netCents === 80000 && s.llcBooks.incomeCents === 185000
          && s.estPaidCents === 30000, detail: JSON.stringify(s.schCByEntity.rodgate) };
      } },

    { name: 'parseCapture: "$43 Home Depot, Brick Ave repair" → 43.00 / Home Depot / brick-ave / LLC',
      run: () => {
        const p = parseCapture('$43 Home Depot, Brick Ave repair', REG);
        return { pass: p.amount === '43' && /home depot/i.test(p.payee) && p.property === 'brick-ave'
          && p.entity === 'brickave-llc', detail: JSON.stringify(p) };
      } },

    { name: 'parseCapture: no amount → error (never store a number the code did not parse)',
      run: () => { const p = parseCapture('fix the roof', REG); return { pass: !!p.error, detail: p.error || '' }; } },

    { name: 'parseCapture: ridge → mother\'s (excluded entity) so it can never enter his tax math',
      run: () => {
        const p = parseCapture('$120 plumber at ridge st', REG);
        return { pass: p.entity === 'mom' && p.property === 'ridge-1', detail: `${p.entity}/${p.property}` };
      } },

    { name: 'ruleCategory: repair words + rental property → schE:repairs; gov supplies → schC; else null',
      run: () => {
        const a = ruleCategory({ payee: 'Home Depot', memo: 'repair', entity: 'brickave-llc', property: 'brick-ave', registry: REG });
        const b = ruleCategory({ payee: 'Staples', memo: 'printer ink', entity: 'rodgate', property: null, registry: REG });
        const c = ruleCategory({ payee: 'Mystery Vendor', memo: '???', entity: 'rodgate', property: null, registry: REG });
        return { pass: a === 'schE:repairs' && b === 'schC:supplies' && c === null, detail: `${a}/${b}/${c}` };
      } },
  ],
};
