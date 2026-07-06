// Evals for the Tax & Wealth pod (Sage / TAX-01) — tax math in CODE (directive #1), eval-pinned
// known-answer scenarios. Pure functions only — no network, no disk.

import fs from 'node:fs';
import { TY2026 } from '../pods/tax/constants-2026.mjs';
import { seTax, federalIncomeTax, qbiDeduction, paTax, localEit, annualDepreciation, k1Share, estimate, quarterlies } from '../pods/tax/engine.mjs';
import { CATEGORIES, validCategory, toCents as ledgerToCents, entryHash, makeEntry, dedupe, summarize } from '../pods/tax/ledger.mjs';
import { parseCapture, ruleCategory, pickCategoryId } from '../pods/tax/capture.mjs';
import { splitIncome, bucketState, nudgeLine } from '../pods/tax/savings.mjs';
import { paymentsDue, payoffPlan, codIncome } from '../pods/tax/debt.mjs';
import { buildStatus } from '../pods/tax/status.mjs';
import { matchPerson } from '../pods/org.mjs';
import { headerHash, applyMap, resolveProfile } from '../pods/tax/accounts.mjs';
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

    { name: 'parseCapture: the dollar amount digits never match a property alias (no misfile)',
      run: () => {
        const p = parseCapture('$465 lumber for the shop', REG);
        return { pass: p.property === null && p.entity !== 'brickave-llc', detail: JSON.stringify({ property: p.property, entity: p.entity }) };
      } },

    { name: 'ruleCategory: repair words + rental property → schE:repairs; gov supplies → schC; else null',
      run: () => {
        const a = ruleCategory({ payee: 'Home Depot', memo: 'repair', entity: 'brickave-llc', property: 'brick-ave', registry: REG });
        const b = ruleCategory({ payee: 'Staples', memo: 'printer ink', entity: 'rodgate', property: null, registry: REG });
        const c = ruleCategory({ payee: 'Mystery Vendor', memo: '???', entity: 'rodgate', property: null, registry: REG });
        return { pass: a === 'schE:repairs' && b === 'schC:supplies' && c === null, detail: `${a}/${b}/${c}` };
      } },

    { name: 'pickCategoryId: valid id passes; invented id, wrong-half id, and UNSURE → null',
      run: () => {
        const a = pickCategoryId('schE:repairs', true), b = pickCategoryId('schC:vibes', false),
          c = pickCategoryId('UNSURE', false), d = pickCategoryId('schE:repairs', false);
        return { pass: a === 'schE:repairs' && b === null && c === null && d === null, detail: `${a}/${b}/${c}/${d}` };
      } },

    { name: 'splitIncome: parts are integers and sum EXACTLY to income (largest-remainder)',
      run: () => {
        const s = splitIncome(10001, { taxPct: 27, debtPct: 10, emergencyPct: 5, investPct: 5 });
        const sum = s.tax + s.debt + s.emergency + s.invest + s.keep;
        return { pass: sum === 10001 && s.tax === 2700 && s.debt === 1000, detail: JSON.stringify(s) };
      } },

    { name: 'splitIncome guards: negative rate → 0; rates summing >100% scale down, keep never negative',
      run: () => {
        const a = splitIncome(10000, { taxPct: -10, debtPct: 10, emergencyPct: 0, investPct: 0 });
        const b = splitIncome(10000, { taxPct: 60, debtPct: 30, emergencyPct: 20, investPct: 10 });
        const bSum = b.tax + b.debt + b.emergency + b.invest + b.keep;
        return { pass: a.tax === 0 && a.debt === 1000 && b.keep >= 0 && bSum === 10000 && b.tax === 5000,
          detail: JSON.stringify(b) };
      } },

    { name: 'bucketState: targets accrue from income; moved subtracts; due never negative',
      run: () => {
        const st = bucketState({
          incomeEvents: [{ cents: 100000 }, { cents: 50000 }],
          movedEvents: [{ bucket: 'tax', cents: 30000 }],
          rates: { taxPct: 27, debtPct: 10, emergencyPct: 5, investPct: 5 },
        });
        return { pass: st.target.tax === 40500 && st.due.tax === 10500 && st.due.debt === 15000
          && st.due.emergency === 7500, detail: JSON.stringify(st.due) };
      } },

    { name: 'nudgeLine: says what to move this week in plain English',
      run: () => {
        const s = nudgeLine({ due: { tax: 41200, debt: 20000, emergency: 15000, invest: 0 } });
        return { pass: /\$412(\.00)? .*tax/i.test(s) && /\$200(\.00)? .*debt/i.test(s) && !/invest/i.test(s),
          detail: s };
      } },

    { name: 'paymentsDue: only status=paying debts, sorted by days until due',
      run: () => {
        const debts = [
          { id: 'chase-1', creditor: 'Chase 1', status: 'paying', monthlyPaymentCents: 5000, dueDay: 10 },
          { id: 'sba', creditor: 'SBA', status: 'paying', monthlyPaymentCents: 12000, dueDay: 28 },
          { id: 'apple', creditor: 'Apple Card', status: 'charged-off', monthlyPaymentCents: null, dueDay: null },
        ];
        const due = paymentsDue({ debts, todayISO: '2026-07-05' });
        return { pass: due.length === 2 && due[0].id === 'chase-1' && due[0].daysUntil === 5
          && due[1].daysUntil === 23, detail: JSON.stringify(due.map((d) => d.id)) };
      } },

    { name: 'paymentsDue: unconfigured dueDay → daysUntil null (never fabricated), sorted last, setup passed',
      run: () => {
        const debts = [
          { id: 'sba', creditor: 'SBA', status: 'paying', monthlyPaymentCents: null, dueDay: null, setup: 'enter terms' },
          { id: 'chase-1', creditor: 'Chase 1', status: 'paying', monthlyPaymentCents: 5000, dueDay: 10 },
        ];
        const due = paymentsDue({ debts, todayISO: '2026-07-05' });
        return { pass: due[0].id === 'chase-1' && due[1].daysUntil === null && due[1].setup === 'enter terms',
          detail: JSON.stringify(due.map((d) => [d.id, d.daysUntil])) };
      } },

    { name: 'payoffPlan snowball: smallest balance dies first; leftover rolls to the next debt',
      run: () => {
        const debts = [
          { id: 'A', status: 'charged-off', balanceCents: 25000, aprPct: 0 },
          { id: 'B', status: 'charged-off', balanceCents: 15000, aprPct: 0 },
        ];
        const p = payoffPlan({ debts, monthlyBudgetCents: 10000, strategy: 'snowball' });
        const B = p.schedule.find((s) => s.id === 'B'), A = p.schedule.find((s) => s.id === 'A');
        return { pass: p.order[0] === 'B' && B.paidOffMonth === 2 && A.paidOffMonth === 4 && p.months === 4,
          detail: JSON.stringify(p.schedule) };
      } },

    { name: 'payoffPlan avalanche: highest APR first regardless of balance',
      run: () => {
        const debts = [
          { id: 'lowRate', status: 'paying', balanceCents: 10000, aprPct: 5 },
          { id: 'highRate', status: 'paying', balanceCents: 90000, aprPct: 24 },
        ];
        const p = payoffPlan({ debts, monthlyBudgetCents: 20000, strategy: 'avalanche' });
        return { pass: p.order[0] === 'highRate', detail: p.order.join(',') };
      } },

    { name: 'codIncome: settle $18,244 for $6,000 → $12,244 of 1099-C income to plan tax on',
      run: () => ({ pass: codIncome({ balanceCents: 1824400, settlementCents: 600000 }) === 1224400,
        detail: String(codIncome({ balanceCents: 1824400, settlementCents: 600000 })) }) },

    { name: 'buildStatus: one line has set-aside %, bucket target, next voucher; unverified consts warned',
      run: () => {
        const entries = [
          makeEntry({ dateISO: '2026-02-01', amount: 1000, payee: 'Agency', entity: 'rodgate', category: 'income:gross-receipts', source: 'capture' }),
        ];
        const s = buildStatus({ entries, registry: REG, debts: [], C, todayISO: '2026-07-05' });
        return { pass: s.setAsidePct > 0 && typeof s.headline === 'string' && /set aside/i.test(s.headline)
          && s.nextVoucher && s.nextVoucher.due === '2026-09-15' && s.warnings.length > 0,
          detail: s.headline };
      } },

    { name: 'buildStatus: needs_review income is excluded from bucket targets (matches the estimate)',
      run: () => {
        const confirmed = makeEntry({ dateISO: '2026-02-01', amount: 1000, payee: 'A', entity: 'rodgate', category: 'income:gross-receipts', source: 'capture' });
        const pending = makeEntry({ dateISO: '2026-02-02', amount: 500, payee: 'B', entity: 'rodgate', category: 'income:gross-receipts', source: 'capture', status: 'needs_review' });
        const s1 = buildStatus({ entries: [confirmed], registry: REG, debts: [], C, todayISO: '2026-07-05' });
        const s2 = buildStatus({ entries: [confirmed, pending], registry: REG, debts: [], C, todayISO: '2026-07-05' });
        return { pass: s2.buckets.target.tax === s1.buckets.target.tax && s1.buckets.target.tax > 0,
          detail: `${s1.buckets.target.tax}==${s2.buckets.target.tax}` };
      } },

    { name: 'buildStatus: depreciation uses the books tax year, not todays date (filing-season safe)',
      run: () => {
        const reg = { ...REG, properties: [{ id: 'p', entity: 'brickave-llc', basisCents: 10000000, inService: '2026-03-15' }],
          entities: REG.entities };
        const entries = [makeEntry({ dateISO: '2026-06-01', amount: 5000, payee: 'HAP', entity: 'brickave-llc', property: 'p', category: 'income:hap', source: 'capture' })];
        const filed2027 = buildStatus({ entries, registry: reg, debts: [], C, todayISO: '2027-02-15', taxYear: 2026 });
        const during2026 = buildStatus({ entries, registry: reg, debts: [], C, todayISO: '2026-07-05', taxYear: 2026 });
        return { pass: filed2027.estimate.totalCents === during2026.estimate.totalCents,
          detail: `${filed2027.estimate.totalCents} vs ${during2026.estimate.totalCents}` };
      } },

    { name: 'buildStatus: needs_review entries are counted + warned (never silently dropped)',
      run: () => {
        const pending = makeEntry({ dateISO: '2026-03-01', amount: 500, payee: '?', entity: 'rodgate', category: 'meta:personal', source: 'capture', status: 'needs_review' });
        const s = buildStatus({ entries: [pending], registry: REG, debts: [], C, todayISO: '2026-07-05', taxYear: 2026 });
        return { pass: s.needsReview === 1 && s.warnings.some((w) => /need a quick review/i.test(w)), detail: `needsReview=${s.needsReview}` };
      } },

    { name: 'org: "the tax guy" and "what do i owe" resolve to TAX-01 Sage under Victor',
      run: () => {
        const a = matchPerson('ask the tax guy'), b = matchPerson('what do i owe this quarter');
        return { pass: a && a.codename === 'TAX-01' && b && b.codename === 'TAX-01'
          && a.reports_to === 'LEDGER-01', detail: (a && a.nickname) || 'no match' };
      } },

    { name: 'headerHash: stable + case/space-insensitive',
      run: () => {
        const a = headerHash(['Date', 'Amount', ' Description ']);
        const b = headerHash(['date', 'amount', 'description']);
        return { pass: a === b && a.length === 12, detail: a };
      } },

    { name: 'applyMap signed: negative amount = money out, positive = in; parses cents + ISO date',
      run: () => {
        const map = { dateCol: 0, amountCol: 2, descCol: 1, signConvention: 'signed' };
        const out = applyMap(['03/05/2026', 'HOME DEPOT #4021', '-43.00'], map);
        const inc = applyMap(['03/06/2026', 'HAP DEPOSIT', '1850.00'], map);
        return { pass: out.cents === 4300 && out.direction === 'out' && out.dateISO === '2026-03-05'
          && inc.cents === 185000 && inc.direction === 'in', detail: JSON.stringify(out) };
      } },

    { name: 'applyMap: an out-of-range date (month 13, day 45, Feb 30) → error, never a garbage ISO string',
      run: () => {
        const map = { dateCol: 0, amountCol: 2, descCol: 1, signConvention: 'signed' };
        const m13 = applyMap(['13/05/2026', 'X', '-10.00'], map);
        const d45 = applyMap(['03/45/2026', 'X', '-10.00'], map);
        const feb30 = applyMap(['02/30/2026', 'X', '-10.00'], map);
        const good = applyMap(['03/05/2026', 'X', '-10.00'], map);
        return { pass: !!m13.error && !!d45.error && !!feb30.error && good.dateISO === '2026-03-05',
          detail: `${m13.error?'err':m13.dateISO} / ${d45.error?'err':d45.dateISO} / ${feb30.error?'err':feb30.dateISO}` };
      } },

    { name: 'applyMap debit-credit: separate columns; a junk amount → error (never a bad cents value)',
      run: () => {
        const map = { dateCol: 0, descCol: 1, debitCol: 2, creditCol: 3, signConvention: 'debit-credit' };
        const debit = applyMap(['2026-03-05', 'Staples', '20.00', ''], map);
        const credit = applyMap(['2026-03-06', 'Refund', '', '15.00'], map);
        const bad = applyMap(['2026-03-06', 'X', 'NaN', ''], map);
        return { pass: debit.cents === 2000 && debit.direction === 'out' && credit.cents === 1500
          && credit.direction === 'in' && !!bad.error, detail: JSON.stringify(credit) };
      } },

    { name: 'resolveProfile: matches saved header hash → columnMap; unknown header → needsMapping',
      run: () => {
        const accounts = [{ id: 'chase-biz', defaultEntity: 'rodgate', headerHash: headerHash(['Date','Desc','Amount']),
          columnMap: { dateCol: 0, descCol: 1, amountCol: 2, signConvention: 'signed' } }];
        const known = resolveProfile(accounts, ['Date', 'Desc', 'Amount']);
        const unknown = resolveProfile(accounts, ['Posted', 'Merchant', 'Debit', 'Credit']);
        return { pass: known.columnMap.amountCol === 2 && unknown.needsMapping === true, detail: JSON.stringify(known.columnMap) };
      } },
  ],
};
