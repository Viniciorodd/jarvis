// Debt & Credit desk — registry + payment nudges + PURE payoff math. Jarvis never negotiates,
// never pays, never disputes; it computes, schedules, reminds. Settlements create 1099-C income
// (codIncome) that flows straight into the estimator so even debt relief can't cause an April surprise.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { emit } from '../lib.mjs';
import { makeEntry, appendEntry } from './ledger.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REAL = path.join(HERE, 'debts.json'), SEED = path.join(HERE, 'debts.seed.json');

export function loadDebts() {
  if (!fs.existsSync(REAL)) fs.copyFileSync(SEED, REAL); // first run: seed → real (real is gitignored)
  return JSON.parse(fs.readFileSync(REAL, 'utf8'));
}
export function saveDebts(d) { fs.writeFileSync(REAL, JSON.stringify(d, null, 2)); }

// PURE: which active payments are coming up, soonest first. An UNCONFIGURED dueDay yields
// daysUntil null (never a fabricated date) and sorts last — the `setup` field tells the UI why.
// paidThisMonth flips via recordPayment.
export function paymentsDue({ debts = [], todayISO }) {
  const [y, m, day] = String(todayISO).split('-').map(Number);
  const dim = new Date(y, m, 0).getDate();
  return debts.filter((d) => d.status === 'paying')
    .map((d) => {
      let daysUntil = null;
      if (d.dueDay) {
        const dd = Math.min(d.dueDay, dim);
        daysUntil = dd >= day ? dd - day : (dim - day) + dd; // wraps into next month
      }
      return { id: d.id, creditor: d.creditor, dueDay: d.dueDay, monthlyPaymentCents: d.monthlyPaymentCents,
        daysUntil, paidThisMonth: (d.lastPaid || '').slice(0, 7) === todayISO.slice(0, 7), setup: d.setup || null };
    })
    .sort((a, b) => (a.daysUntil == null) - (b.daysUntil == null) || (a.daysUntil || 0) - (b.daysUntil || 0));
}

// Log a real payment: marks the debt paid this month + writes a ledger event. Principal is
// meta:debt-payment (not deductible); pass interestCents to book the deductible slice (SBA →
// schC:interest under Rodgate — business loan).
export async function recordPayment({ debtId, amount, interestAmount = null, dateISO, dir } = {}) {
  const store = loadDebts();
  const d = (store.debts || []).find((x) => x.id === debtId);
  if (!d) return { error: `unknown debt ${debtId}` };
  const entry = makeEntry({ dateISO, amount, payee: d.creditor, memo: `payment on ${d.id}`,
    entity: d.deductibleInterest ? 'rodgate' : 'sidehustles', category: 'meta:debt-payment', source: 'debt' });
  if (entry.error) return entry;
  const appended = appendEntry(entry, dir);
  if (appended.deduped) return { ...entry, deduped: true }; // replayed payment — ledger already had it; do NOT decrement twice
  if (interestAmount != null && d.deductibleInterest) {
    const i = makeEntry({ dateISO, amount: interestAmount, payee: d.creditor, memo: `interest on ${d.id}`,
      entity: 'rodgate', category: 'schC:interest', source: 'debt' });
    if (!i.error) appendEntry(i, dir);
  }
  d.lastPaid = dateISO;
  if (typeof d.balanceCents === 'number') d.balanceCents = Math.max(0, d.balanceCents - entry.cents); // overpay → 0, never desync
  saveDebts(store);
  await emit({ kind: 'action', actor: 'TAX-01', pod: 'exec', action: 'tax.debt.payment', reversible: true,
    payload: { debtId, cents: entry.cents } });
  return entry;
}

// PURE payoff simulation. strategy 'snowball' = smallest balance first, 'avalanche' = highest APR
// first. Budget is applied to the target debt; overflow rolls to the next. Monthly interest accrues
// at aprPct/12 on carried balances. Returns per-debt payoff month (1-based) + total months.
export function payoffPlan({ debts = [], monthlyBudgetCents = 0, strategy = 'snowball' }) {
  const live = debts.filter((d) => (d.balanceCents || 0) > 0 && d.status !== 'disputed')
    .map((d) => ({ id: d.id, bal: d.balanceCents, apr: d.aprPct || 0 }));
  const order = [...live].sort(strategy === 'avalanche'
    ? (a, b) => b.apr - a.apr || a.bal - b.bal
    : (a, b) => a.bal - b.bal || a.id.localeCompare(b.id)).map((d) => d.id);
  if (!monthlyBudgetCents || !live.length) return { order, months: null, schedule: [] };
  const byId = Object.fromEntries(live.map((d) => [d.id, d]));
  const schedule = []; let month = 0;
  while (live.some((d) => d.bal > 0) && month < 600) {
    month += 1;
    for (const d of live) if (d.bal > 0 && d.apr > 0) d.bal += Math.round(d.bal * (d.apr / 100) / 12);
    let budget = monthlyBudgetCents;
    for (const id of order) {
      const d = byId[id];
      if (d.bal <= 0 || budget <= 0) continue;
      const pay = Math.min(d.bal, budget);
      d.bal -= pay; budget -= pay;
      if (d.bal === 0) schedule.push({ id, paidOffMonth: month });
    }
  }
  return { order, months: month >= 600 ? null : month, schedule };
}

// Settling for less than you owe usually makes the FORGIVEN part taxable income (Form 1099-C).
export const codIncome = ({ balanceCents, settlementCents }) =>
  Math.max(0, Math.round(balanceCents || 0) - Math.round(settlementCents || 0));
