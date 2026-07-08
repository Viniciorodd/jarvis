// Regression suite for the Canonical-Facts guard (pods/gov/facts-check.mjs) — doctrine + Lessons Ledger
// L-005/L-006/L-007. If this regresses, a false "certified" or "COI on file" claim could reach a federal
// proposal (misrepresentation). The valid "SELF-certified" claim must NEVER be flagged.

import { factsCheck } from '../pods/gov/facts-check.mjs';

const flags = (t) => factsCheck(t).ok === false;
const clean = (t) => factsCheck(t).ok === true;
const ok = (pass, detail = '') => ({ pass, detail });

export default {
  agent: 'facts-check',
  cases: [
    { name: 'L-005: "Pennsylvania-certified SDB" is FLAGGED', run: () => ok(flags('Rodgate is a Pennsylvania-certified SDB and minority-owned firm.')) },
    { name: 'L-005: bare "certified SDB" is FLAGGED', run: () => ok(flags('As a certified SDB, Rodgate qualifies for this set-aside.')) },
    { name: 'the VALID "Self-Certified Small Disadvantaged Business" is CLEAN (no false positive)', run: () =>
      ok(clean('Rodgate, LLC is a Self-Certified Small Disadvantaged Business (SDB), Minority-Owned, and Hispanic American Owned small business.')) },
    { name: '8(a) / HUBZone / SDVOSB / WOSB are each FLAGGED', run: () =>
      ok(flags('We hold 8(a) status.') && flags('a HUBZone firm') && flags('SDVOSB set-aside eligible') && flags('a Women-Owned Small Business')) },
    { name: 'L-007: "COI on file" is FLAGGED; "COI available upon binding" is CLEAN', run: () =>
      ok(flags('Certificate of insurance on file and current.') && flags('COI on file') && clean('COI available upon binding.')) },
    { name: 'L-006: promising "prompt payment" to subs is FLAGGED', run: () =>
      ok(flags('We pay promptly, Net-15.') && flags('Rodgate offers prompt payment to subcontractors.')) },
    { name: 'a clean, honest identity paragraph passes', run: () =>
      ok(clean('Rodgate, LLC (DBA Rodgate Group) is a Small Business and Minority-Owned, Hispanic American Owned firm under NAICS 561720. UEI Z1SWBFEK7EM4, CAGE 18S75.')) },
    { name: 'factsCheck returns structured violations', run: () => {
      const r = factsCheck('We are a Pennsylvania-certified SDB with 8(a) status.');
      return ok(!r.ok && r.violations.length >= 2 && r.violations.every((v) => v.rule && v.why), JSON.stringify(r.violations.map((v) => v.rule)));
    } },
  ],
};
