// Regression suite for the APPROVED outreach templates (pods/gov/outreach-templates.mjs, Phase 9).
// The load-bearing invariant: EVERY approved template must survive the safety core at its own tier. A template
// that trips its own guard is dead weight (it can never send); a template that sneaks pricing or a false cert
// past the guard is a liability. Both directions are pinned here, plus fail-closed slot handling.

import { TEMPLATES, renderTemplate, templateKeys } from '../pods/gov/outreach-templates.mjs';
import { canAutoSend, hasBlockedContent, factsOk } from '../pods/gov/outreach-policy.mjs';
import { COMPANY } from '../pods/gov/company.mjs';

const ok = (pass, detail = '') => ({ pass, detail });
const SLOTS = { contactName: 'Jane', trade: 'floor care', place: 'Erie, PA', company: 'ABC Prime', solicitation: 'W912-26-R-0001', subjectRef: 'the quote request' };
const VERIFIED = { contact_email: 'jane@subco.com', verified: true };

export default {
  agent: 'gov-outreach-templates',
  cases: [
    { name: 'EVERY approved template passes the safety core at its own tier (or it can never send)', run: () => {
      const bad = [];
      for (const k of templateKeys()) {
        const r = renderTemplate(k, SLOTS);
        const d = canAutoSend({ templateKey: k, body: r.body, recipient: VERIFIED, env: { AUTO_SEND_TIER: String(r.tier) } });
        if (!d.allow) bad.push(`${k}: ${d.reason}`);
      }
      return ok(bad.length === 0, bad.join(' | '));
    } },

    { name: 'no approved template contains pricing, a commitment, or a false certification', run: () => {
      const bad = templateKeys().map((k) => [k, hasBlockedContent(renderTemplate(k, SLOTS).body)]).filter(([, b]) => b.length);
      return ok(bad.length === 0, JSON.stringify(bad));
    } },

    { name: 'every template passes the canonical-facts gate + carries the REAL UEI/CAGE (L-005)', run: () => {
      const bad = templateKeys().filter((k) => {
        const b = renderTemplate(k, SLOTS).body;
        return !factsOk(b) || !b.includes(COMPANY.uei) || !b.includes(COMPANY.cage);
      });
      return ok(bad.length === 0, JSON.stringify(bad));
    } },

    { name: 'templates claim ONLY self-certified status — never 8(a)/HUBZone/SDVOSB/WOSB', run: () => {
      const bad = templateKeys().filter((k) => /8\s*\(?a\)?|hubzone|sdvosb|wosb|veteran[-\s]?owned/i.test(renderTemplate(k, SLOTS).body));
      return ok(bad.length === 0, JSON.stringify(bad));
    } },

    { name: 'FAILS CLOSED: a missing required slot throws (never a half-filled email)', run: () => {
      let threw = false;
      try { renderTemplate('sub-quote', { contactName: 'Jane' }); } catch (e) { threw = /missing required slot/i.test(e.message); }
      return ok(threw, 'a missing slot did not throw');
    } },

    { name: 'FAILS CLOSED: an unknown template key throws (only approved templates exist)', run: () => {
      let threw = false;
      try { renderTemplate('free-compose', SLOTS); } catch (e) { threw = /unknown outreach template/i.test(e.message); }
      return ok(threw, 'an unknown template did not throw');
    } },

    { name: 'a MUTATED template (pricing added) is caught by the guard, not sent', run: () => {
      const r = renderTemplate('sub-quote', SLOTS);
      const d = canAutoSend({ templateKey: 'sub-quote', body: r.body + '\n\nOur price is $4,200/month.', recipient: VERIFIED, env: { AUTO_SEND_TIER: '1' } });
      return ok(!d.allow && /pricing/.test(d.reason), JSON.stringify(d));
    } },

    { name: 'tiers are correctly assigned (sub-quote/follow-up 1 · prime-intro 2 · sources-sought 3)', run: () =>
      ok(TEMPLATES['sub-quote'].tier === 1 && TEMPLATES['follow-up'].tier === 1
        && TEMPLATES['prime-intro'].tier === 2 && TEMPLATES['sources-sought'].tier === 3) },
  ],
};
