// Regression suite for the Finance pod's PURE money core (pods/finance/invoice.mjs). This guards REAL money:
// if amount parsing or the executor gate regresses, the wrong amount — or the wrong thing — could be charged.
// No network here; just the deterministic validators + the gate the Stripe executor obeys.

import { toCents, validateInvoice, idempotencyKey, invoiceFromApproval } from '../pods/finance/invoice.mjs';

const spec = (over = {}) => validateInvoice({ amountUsd: '1250.50', customerEmail: 'a@b.com', description: 'Cleaning', ...over });
const req = (over = {}) => ({ kind: 'approval.request', pod: 'exec', action: 'invoice', payload: { spec: validateInvoice({ amountUsd: 500 }) }, ...over });

export default {
  agent: 'finance',
  cases: [
    { name: 'toCents parses a $-formatted, comma amount to integer cents',
      run: () => { const c = toCents('$1,250.50'); return { pass: c === 125050, detail: String(c) }; } },
    { name: 'toCents accepts a plain number',
      run: () => { const c = toCents(99.99); return { pass: c === 9999, detail: String(c) }; } },
    { name: 'toCents rejects zero, negatives, junk, and 3+ decimals',
      run: () => { const bad = [toCents(0), toCents(-5), toCents('free'), toCents('1.999'), toCents(2_000_000)]; return { pass: bad.every((x) => x === null), detail: JSON.stringify(bad) }; } },
    { name: 'validateInvoice normalizes amount + currency + clamps description',
      run: () => { const v = spec({ currency: 'EUR', description: '  x '.repeat(200) }); return { pass: v.ok && v.cents === 125050 && v.currency === 'eur' && v.description.length <= 250, detail: `${v.cents}/${v.currency}/${v.description.length}` }; } },
    { name: 'validateInvoice rejects a bad amount',
      run: () => { const v = validateInvoice({ amountUsd: 'lots' }); return { pass: !v.ok, detail: v.reason }; } },
    { name: 'validateInvoice rejects a malformed customer email',
      run: () => { const v = validateInvoice({ amountUsd: 10, customerEmail: 'not-an-email' }); return { pass: !v.ok, detail: v.reason }; } },
    { name: 'idempotencyKey is deterministic for the same spec',
      run: () => { const a = idempotencyKey(spec()); const b = idempotencyKey(spec()); return { pass: a === b && a.startsWith('inv_'), detail: a }; } },
    { name: 'idempotencyKey differs when the amount differs (no cross-charge collision)',
      run: () => { const a = idempotencyKey(spec()); const b = idempotencyKey(spec({ amountUsd: 999 })); return { pass: a !== b, detail: `${a} vs ${b}` }; } },
    { name: 'approving an exec invoice WITH a spec → executor creates the link',
      run: () => { const s = invoiceFromApproval(req()); return { pass: !!s && s.cents === 50000, detail: JSON.stringify(s && s.cents) }; } },
    { name: 'a non-exec pod is not handled by the finance executor',
      run: () => { const s = invoiceFromApproval(req({ pod: 'gov' })); return { pass: s === null, detail: JSON.stringify(s) }; } },
    { name: 'a non-invoice action is ignored',
      run: () => { const s = invoiceFromApproval(req({ action: 'send' })); return { pass: s === null, detail: JSON.stringify(s) }; } },
    { name: 'an invoice request with no/zero spec is a no-op',
      run: () => { const s = invoiceFromApproval(req({ payload: { spec: { cents: 0 } } })); return { pass: s === null, detail: JSON.stringify(s) }; } },
  ],
};
