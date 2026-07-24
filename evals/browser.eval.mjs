// Regression suite for the browser automation safety guards (pods/browser.mjs).
// These are the guarantees that keep an autonomous browser from doing something irreversible: it never
// clicks a submit/pay/send control, never fills a credential/payment field, and only plans our own data.
// (The IO functions readPage/stageFormFill are exercised by a live smoke test, not here.)

import { isClickSafe, isFieldFillable, planOutreachFill } from '../pods/browser.mjs';

const ok = (pass, detail = '') => ({ pass, detail });

export default {
  agent: 'browser-safety',
  cases: [
    { name: 'isClickSafe: BLOCKS submit / send / pay / buy / place order / checkout / confirm purchase',
      run: () => ok(['Submit', 'Send message', 'Pay now', 'Buy', 'Place Order', 'Checkout', 'Confirm purchase', 'Complete payment'].every((l) => !isClickSafe(l)), 'a forbidden label slipped through') },
    { name: 'isClickSafe: ALLOWS benign controls (Next, Save draft, Preview, Add, Search)',
      run: () => ok(['Next', 'Save draft', 'Preview', 'Add another', 'Search', 'Back'].every((l) => isClickSafe(l))) },
    { name: 'isFieldFillable: BLOCKS credential/payment fields',
      run: () => ok(['password', 'passcode', 'CVV', 'card number', 'SSN', 'social security', 'account number', 'routing', 'PIN'].every((f) => !isFieldFillable(f))) },
    { name: 'isFieldFillable: ALLOWS ordinary contact fields',
      run: () => ok(['name', 'email', 'company', 'phone', 'message', 'comments'].every((f) => isFieldFillable(f))) },
    { name: 'planOutreachFill: maps our data to fields, skips empties',
      run: () => { const p = planOutreachFill({ name: 'Rodgate LLC', email: 'a@b.com', message: 'Teaming?' }); return ok(p.length === 3 && p.find((x) => x.intent === 'email').value === 'a@b.com' && !p.some((x) => x.intent === 'phone'), JSON.stringify(p.map((x) => x.intent))); } },
    { name: 'planOutreachFill: never plans a credential field even if passed one',
      run: () => { const p = planOutreachFill({ name: 'x', email: 'y@z.com', password: 'nope', ssn: '123' }); return ok(!p.some((f) => /pass|ssn/i.test(f.intent))); } },
    { name: 'planOutreachFill: each field carries locate-keywords for the DOM matcher',
      run: () => { const p = planOutreachFill({ email: 'a@b.com' }); return ok(p[0].match.includes('email') && p[0].match.includes('e-mail')); } },
  ],
};
