// Regression suite for AUTO-VERIFICATION (pods/gov/sub-verify.mjs). This is what replaces the operator
// hand-approving every lead — so it has to be trustworthy on its own. Pinned: the hard blocks can never be
// out-scored (a debarred firm or a no-reply address is never verified no matter how good it otherwise looks),
// the domain-match is the strongest evidence (it's what proves the address really belongs to that business,
// the L-009 protection), and an unproven lead simply doesn't reach the bar. Fails closed.

import { autoVerify, autoVerifyAll, emailDomain, siteDomain } from '../pods/gov/sub-verify.mjs';

const ok = (pass, detail = '') => ({ pass, detail });
const GOOD = { name: 'Cleaning Express', contact_email: 'info@cleaningexpress.com', website: 'https://cleaningexpress.com', phone: '570-555-1212', rating: 4.6, reviews: 41 };

export default {
  agent: 'gov-sub-verify',
  cases: [
    { name: 'a real firm whose email matches its own website IS auto-verified', run: () => {
      const r = autoVerify(GOOD);
      return ok(r.verified === true && r.checks.some((c) => /matches their own website/.test(c)), JSON.stringify(r));
    } },

    { name: 'HARD BLOCK: a SAM-excluded firm is NEVER verified, however strong it looks', run: () => {
      const r = autoVerify({ ...GOOD, exclusionStatus: 'excluded', past_performance: 5, uei: 'ABCDEFGH1234' });
      return ok(r.verified === false && r.blocks.some((b) => /excluded/i.test(b)), JSON.stringify(r));
    } },

    { name: 'HARD BLOCK: a no-reply / role address is never a verified contact', run: () => {
      const a = autoVerify({ ...GOOD, contact_email: 'no-reply@cleaningexpress.com' });
      const b = autoVerify({ ...GOOD, contact_email: 'postmaster@cleaningexpress.com' });
      return ok(!a.verified && !b.verified && /role\/placeholder/.test(a.blocks[0] || ''), JSON.stringify({ a: a.blocks, b: b.blocks }));
    } },

    { name: 'HARD BLOCK: no email, or a placeholder domain, is never verified', run: () =>
      ok(autoVerify({ ...GOOD, contact_email: '' }).verified === false
        && autoVerify({ ...GOOD, contact_email: 'a@example.com' }).verified === false) },

    { name: 'a bare free-mail lead with nothing else does NOT reach the bar (unproven)', run: () => {
      const r = autoVerify({ name: 'Random Co', contact_email: 'randomguy@gmail.com' });
      return ok(r.verified === false && r.score < r.min, JSON.stringify(r));
    } },

    { name: 'but a free-mail sub WITH real-business evidence (SAM UEI + rating + phone) does verify', run: () => {
      const r = autoVerify({ name: 'Small Sub', contact_email: 'owner@gmail.com', uei: 'ABCDEFGH1234', rating: 4.5, reviews: 12, phone: '5705551212' });
      return ok(r.verified === true, JSON.stringify(r));
    } },

    { name: 'prior work with us is strong evidence on its own', run: () => {
      const r = autoVerify({ name: 'Known Sub', contact_email: 'x@knownsub.com', past_performance: 2, phone: '5705551212' });
      return ok(r.verified === true && r.checks.some((c) => /worked with them before/.test(c)), JSON.stringify(r));
    } },

    { name: 'the bar is configurable — raising min makes verification stricter', run: () => {
      const loose = autoVerify({ name: 'Thin', contact_email: 'a@thin.com', website: 'https://thin.com' }, { min: 3 });
      const strict = autoVerify({ name: 'Thin', contact_email: 'a@thin.com', website: 'https://thin.com' }, { min: 9 });
      return ok(loose.verified === true && strict.verified === false, JSON.stringify({ loose: loose.score, strict: strict.min }));
    } },

    { name: 'autoVerifyAll never downgrades a contact the OPERATOR verified by hand', run: () => {
      const subs = [{ id: '1', name: 'Manual', verified: true, contact_email: 'no-reply@x.com' }];
      const r = autoVerifyAll(subs);
      return ok(subs[0].verified === true && r.verified === 0, JSON.stringify(r));
    } },

    { name: 'autoVerifyAll records WHY each one passed (auditable, not a black box)', run: () => {
      const subs = [{ id: '1', ...GOOD }];
      const r = autoVerifyAll(subs);
      return ok(r.verified === 1 && subs[0].verifiedBy === 'auto' && Array.isArray(subs[0].verifyEvidence) && subs[0].verifyEvidence.length > 0, JSON.stringify(r.changed));
    } },

    { name: 'domain helpers handle www/protocol/garbage without throwing', run: () =>
      ok(siteDomain('https://www.abc.com/x') === 'abc.com' && siteDomain('abc.com') === 'abc.com'
        && siteDomain('') === '' && emailDomain('a@B.com') === 'b.com' && emailDomain('') === '') },
  ],
};
