// Regression suite for the business-credit / lendability tracker (pods/finance/business-credit.mjs).
// Pins the pure math (on-time %, foundation gaps, deterministic readinessPct, latest-score-per-source),
// the verification discipline (unverified trade line + unsourced snapshot surface in needsVerification),
// the CAIVRS-aware financingNote (must mention CAIVRS, must NOT assert SBA is closed), and the append-only
// { dir } IO round-trips. Every IO case runs in its own temp dir; the real ledger is never touched.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  tradelineHealth, foundationGaps, lendabilityChecklist, businessCreditStatus, latestScorePerSource,
  addTradeline, readTradelines, addPayment, addSnapshot, readSnapshots, readFoundation, saveFoundation,
  seedIfEmpty, FINANCING_NOTE,
} from '../pods/finance/business-credit.mjs';

const ok = (pass, detail = '') => ({ pass, detail });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'biz-credit-eval-'));
const NOW = '2026-07-16T12:00:00.000Z';

export default {
  agent: 'finance-business-credit',
  cases: [
    { name: 'tradelineHealth: on-time math (2/3 = 67%) + payment count', run: () => {
      const h = tradelineHealth({ status: 'active', reportingVerified: true, reportsTo: ['D&B'],
        payments: [{ onTime: true }, { onTime: true }, { onTime: false }] }, NOW);
      return ok(h.onTimePct === 67 && h.totalPayments === 3 && h.onTime === 2
        && h.nextConcern === 'late payment(s) on record — protect on-time history',
        JSON.stringify(h));
    } },
    { name: 'tradelineHealth: reporting is verified / assumed / no by flag + reportsTo', run: () => {
      const v = tradelineHealth({ status: 'active', reportingVerified: true, reportsTo: ['D&B'], payments: [] }, NOW);
      const a = tradelineHealth({ status: 'active', reportingVerified: false, reportsTo: ['Experian Biz'], payments: [] }, NOW);
      const n = tradelineHealth({ status: 'active', reportingVerified: false, reportsTo: [], payments: [] }, NOW);
      return ok(v.reporting === 'verified' && a.reporting === 'assumed' && n.reporting === 'no',
        JSON.stringify({ v: v.reporting, a: a.reporting, n: n.reporting }));
    } },
    { name: 'foundationGaps: flags missing DUNS + no bank account, not a confirmed EIN', run: () => {
      const gaps = foundationGaps({ einConfirmed: true, dunsStatus: 'none', businessBankAccount: false, addressPhoneConsistent: true });
      const items = gaps.map((g) => g.item);
      return ok(items.includes('D-U-N-S number') && items.includes('Business bank account')
        && !items.includes('EIN') && !items.some((i) => i.startsWith('Address/phone')),
        JSON.stringify(items));
    } },
    { name: 'lendabilityChecklist: readinessPct is deterministic (2/7 have → 29%)', run: () => {
      // einConfirmed (1) + debt schedule disclosed (1) = 2 of 7 items have.
      const c = lendabilityChecklist({ foundation: { einConfirmed: true, dunsStatus: 'none', businessBankAccount: false },
        tradelines: [], snapshots: [], debts: [{ id: 'sba' }] }, NOW);
      return ok(c.have === 2 && c.total === 7 && c.readinessPct === 29,
        JSON.stringify({ have: c.have, pct: c.readinessPct }));
    } },
    { name: 'businessCreditStatus: unverified trade line + unsourced snapshot surface in needsVerification', run: () => {
      const st = businessCreditStatus({
        tradelines: [{ id: 't1', vendor: 'Uline', reportsTo: ['D&B'], reportingVerified: false, status: 'active', payments: [] }],
        snapshots: [{ id: 's1', source: 'Nav', score: 80, sourceRef: '' }],
        foundation: {}, debts: [],
      }, NOW);
      const nv = st.needsVerification;
      const tl = nv.find((x) => x.type === 'tradeline');
      const sn = nv.find((x) => x.type === 'snapshot');
      return ok(nv.length === 2 && tl && tl.vendor === 'Uline' && sn && sn.source === 'Nav',
        JSON.stringify(nv));
    } },
    { name: 'financingNote: mentions CAIVRS and does NOT assert SBA financing is closed', run: () => {
      const st = businessCreditStatus({ tradelines: [], snapshots: [], foundation: {}, debts: [] }, NOW);
      const note = st.financingNote;
      const mentionsCaivrs = note.includes('CAIVRS');
      const claimsClosed = /SBA (financing|)\s*is closed/i.test(note) || note.includes('SBA financing is closed');
      return ok(note === FINANCING_NOTE && mentionsCaivrs && !claimsClosed,
        JSON.stringify({ mentionsCaivrs, claimsClosed }));
    } },
    { name: 'latestScorePerSource: latest pulledDate wins per source', run: () => {
      const latest = latestScorePerSource([
        { source: 'D&B Paydex', score: 60, pulledDate: '2026-05-01', sourceRef: 'dnb.com' },
        { source: 'D&B Paydex', score: 80, pulledDate: '2026-07-01', sourceRef: 'dnb.com' },
        { source: 'Nav', score: 55, pulledDate: '2026-06-01', sourceRef: '' },
      ]);
      return ok(latest['D&B Paydex'].score === 80 && latest['D&B Paydex'].verified === true
        && latest['Nav'].score === 55 && latest['Nav'].verified === false,
        JSON.stringify(latest));
    } },
    { name: 'addTradeline round-trips through readTradelines in a temp dir; default status applied', run: () => {
      const dir = tmp();
      const r = addTradeline({ vendor: 'Quill', accountType: 'net-30 office', terms: 'net-30', reportsTo: ['D&B'], creditLimitCents: 50000 }, { dir });
      const all = readTradelines({ dir });
      return ok(r.ok && all.length === 1 && all[0].vendor === 'Quill' && all[0].status === 'applied'
        && all[0].reportingVerified === false && all[0].creditLimitCents === 50000,
        JSON.stringify({ ok: r.ok, count: all.length, status: all[0] && all[0].status }));
    } },
    { name: 'addPayment folds latest-state and appends the payment; on-time math reflects it', run: () => {
      const dir = tmp();
      const r = addTradeline({ vendor: 'Grainger', status: 'active', reportingVerified: true, reportsTo: ['D&B'] }, { dir });
      addPayment(r.tradeline.id, { date: '2026-07-01', onTime: true }, { dir });
      addPayment(r.tradeline.id, { date: '2026-07-15', onTime: false }, { dir });
      const tl = readTradelines({ dir })[0];
      const h = tradelineHealth(tl, NOW);
      return ok(readTradelines({ dir }).length === 1 && tl.payments.length === 2 && h.onTimePct === 50,
        JSON.stringify({ count: readTradelines({ dir }).length, payments: tl.payments.length, pct: h.onTimePct }));
    } },
    { name: 'addSnapshot without sourceRef flags unverified; foundation save/merge round-trips', run: () => {
      const dir = tmp();
      const s = addSnapshot({ source: 'Nav', score: 70 }, { dir });
      const good = addSnapshot({ source: 'D&B Paydex', score: 82, sourceRef: 'https://dnb.com/report' }, { dir });
      saveFoundation({ einConfirmed: true }, { dir });
      const f = saveFoundation({ dunsStatus: 'pending' }, { dir });
      const back = readFoundation({ dir });
      return ok(s.unverified === true && good.unverified === false && readSnapshots({ dir }).length === 2
        && f.ok && back.einConfirmed === true && back.dunsStatus === 'pending',
        JSON.stringify({ unverified: s.unverified, ein: back.einConfirmed, duns: back.dunsStatus }));
    } },
    { name: 'seedIfEmpty: honest start (EIN confirmed, DUNS none) and idempotent', run: () => {
      const dir = tmp();
      const first = seedIfEmpty({ dir });
      const second = seedIfEmpty({ dir });
      const f = readFoundation({ dir });
      return ok(first.foundationSeeded === true && second.foundationSeeded === false
        && f.einConfirmed === true && f.dunsStatus === 'none' && f.businessBankAccount === false,
        JSON.stringify({ first: first.foundationSeeded, second: second.foundationSeeded, ein: f.einConfirmed }));
    } },
  ],
};
