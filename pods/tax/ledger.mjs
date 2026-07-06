// Append-only tax ledger — one JSONL file per tax year (tax-ledger/<year>.jsonl, gitignored).
// The category taxonomy is FIXED and mapped to real form lines (Schedule C 8–27, Schedule E 5–19):
// the classifier (rules or LLM) picks FROM this list; validCategory() rejects anything else, so an
// LLM can never invent a category (directive #1). Amounts go through toCents (same contract as the
// finance pod). Every entry carries a content hash — re-importing the same row cannot double-count.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT } from '../lib.mjs';

const line = (form, id, label) => [form + ':' + id, { form, label }];
export const CATEGORIES = Object.fromEntries([
  // Schedule C expense lines
  line('schC', 'advertising', 'Advertising (line 8)'),
  line('schC', 'car', 'Car & truck (line 9)'),
  line('schC', 'commissions', 'Commissions & fees (line 10)'),
  line('schC', 'contract-labor', 'Contract labor (line 11) — 1099-NEC watch'),
  line('schC', 'insurance', 'Insurance (line 15)'),
  line('schC', 'interest', 'Interest (line 16) — SBA loan interest lives here'),
  line('schC', 'legal', 'Legal & professional (line 17)'),
  line('schC', 'office', 'Office expense (line 18)'),
  line('schC', 'rent-lease', 'Rent/lease (line 20)'),
  line('schC', 'repairs', 'Repairs & maintenance (line 21)'),
  line('schC', 'supplies', 'Supplies (line 22)'),
  line('schC', 'taxes-licenses', 'Taxes & licenses (line 23)'),
  line('schC', 'travel', 'Travel (line 24a)'),
  line('schC', 'meals', 'Meals — 50% (line 24b)'),
  line('schC', 'utilities', 'Utilities (line 25)'),
  line('schC', 'software', 'Software/subscriptions (line 27a other)'),
  line('schC', 'other', 'Other (line 27a)'),
  // Schedule E expense lines (partnership books for the LLC; would-be Sch E for any future personal rental)
  line('schE', 'advertising', 'Advertising (line 5)'),
  line('schE', 'auto', 'Auto & travel (line 6)'),
  line('schE', 'cleaning', 'Cleaning & maintenance (line 7)'),
  line('schE', 'insurance', 'Insurance (line 9)'),
  line('schE', 'legal', 'Legal & professional (line 10)'),
  line('schE', 'management', 'Management fees (line 11)'),
  line('schE', 'mortgage-interest', 'Mortgage interest (line 12)'),
  line('schE', 'other-interest', 'Other interest (line 13)'),
  line('schE', 'repairs', 'Repairs (line 14)'),
  line('schE', 'supplies', 'Supplies (line 15)'),
  line('schE', 'taxes', 'Taxes (line 16)'),
  line('schE', 'utilities', 'Utilities (line 17)'),
  line('schE', 'other', 'Other (line 19)'),
  // Income + meta
  line('income', 'gross-receipts', 'Business income (Sch C line 1)'),
  line('income', 'rent', 'Rent received'),
  line('income', 'hap', 'Section 8 HAP received'),
  line('income', 'other', 'Other income (incl. 1099-C cancellation of debt)'),
  line('meta', 'est-tax-payment', 'Estimated tax payment (1040-ES / PA / local)'),
  line('meta', 'debt-payment', 'Debt payment (principal — not deductible; interest via schC:interest)'),
  line('meta', 'personal', 'Personal / not deductible'),
]);
export const validCategory = (id) => Object.prototype.hasOwnProperty.call(CATEGORIES, String(id || ''));

// Money string/number → integer cents. Same rigor as pods/finance/invoice.mjs toCents.
export function toCents(amount) {
  let n;
  if (typeof amount === 'number') { if (!Number.isFinite(amount)) return null; n = amount; }
  else if (typeof amount === 'string') { const c = amount.replace(/[$,\s]/g, ''); if (!/^\d+(\.\d{1,2})?$/.test(c)) return null; n = parseFloat(c); }
  else return null;
  if (!(n > 0) || n > 1_000_000) return null;
  return Math.round(n * 100);
}

export function entryHash({ dateISO, cents, payee, entity }) {
  return crypto.createHash('sha256').update(`${dateISO}|${cents}|${String(payee).toLowerCase().trim()}|${entity}`)
    .digest('hex').slice(0, 12);
}

// Validate + normalize one ledger entry. status: 'confirmed' | 'needs_review'.
export function makeEntry({ dateISO, amount, payee = '', memo = '', entity, property = null,
  category, source, status = 'confirmed' }) {
  const cents = toCents(amount);
  if (cents == null) return { error: `invalid amount ${JSON.stringify(amount)}` };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateISO || ''))) return { error: `invalid date ${dateISO}` };
  if (!validCategory(category)) return { error: `unknown category ${category} — must be one of the fixed taxonomy` };
  if (!entity) return { error: 'entity required' };
  const e = { ts: new Date().toISOString(), dateISO, cents, payee: String(payee).trim().slice(0, 120),
    memo: String(memo).trim().slice(0, 250), entity, property, category, source,
    status: status === 'needs_review' ? 'needs_review' : 'confirmed' };
  e.hash = entryHash(e);
  return e;
}

export const dedupe = (entries) => {
  const seen = new Set();
  return entries.filter((e) => e && e.hash && !seen.has(e.hash) && seen.add(e.hash));
};

// Roll entries up for the estimator + status view. Income categories add, expenses subtract.
// Partnership entities keep separate books (LLC net gets the 19% k1Share later — engine's job).
export function summarize(entries, registry) {
  const kinds = Object.fromEntries((registry.entities || []).map((e) => [e.id, e.kind]));
  const schCByEntity = {}, llcBooks = { incomeCents: 0, expenseCents: 0, netCents: 0 };
  let incomeCents = 0, estPaidCents = 0;
  for (const e of entries) {
    if (!e || e.error || e.status === 'needs_review') continue;
    const isIncome = e.category.startsWith('income:');
    if (e.category === 'meta:est-tax-payment') { estPaidCents += e.cents; continue; }
    if (e.category.startsWith('meta:')) continue; // personal / principal payments — not tax items
    const kind = kinds[e.entity];
    if (kind === 'schC') {
      const b = (schCByEntity[e.entity] ||= { incomeCents: 0, expenseCents: 0, netCents: 0 });
      isIncome ? (b.incomeCents += e.cents) : (b.expenseCents += e.cents);
      b.netCents = b.incomeCents - b.expenseCents;
      if (isIncome) incomeCents += e.cents;
    } else if (kind === 'partnership') {
      isIncome ? (llcBooks.incomeCents += e.cents) : (llcBooks.expenseCents += e.cents);
      llcBooks.netCents = llcBooks.incomeCents - llcBooks.expenseCents;
      if (isIncome) incomeCents += e.cents;
    } // kind 'excluded' (mom) → tracked operationally elsewhere, never in tax math
  }
  return { schCByEntity, llcBooks, incomeCents, estPaidCents };
}

// ── thin fs wrappers (not eval-tested; evals stay pure) ────────────────────────────────────────────
const LDIR = (dir) => dir || path.join(ROOT, 'tax-ledger');
export function appendEntry(entry, dir) {
  if (!entry || entry.error) throw new Error(entry ? entry.error : 'no entry');
  const d = LDIR(dir); fs.mkdirSync(d, { recursive: true });
  const file = path.join(d, entry.dateISO.slice(0, 4) + '.jsonl');
  const existing = readLedger(Number(entry.dateISO.slice(0, 4)), dir);
  if (existing.some((x) => x.hash === entry.hash)) return { ok: true, deduped: true, hash: entry.hash };
  fs.appendFileSync(file, JSON.stringify(entry) + '\n');
  return { ok: true, deduped: false, hash: entry.hash };
}
export function readLedger(year, dir) {
  try {
    return fs.readFileSync(path.join(LDIR(dir), year + '.jsonl'), 'utf8')
      .split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  } catch { return []; }
}
