// Regression suite for the REDOS distribution SAFETY CORE (pods/redos/policy.mjs).
// These guards ARE the feature. Every case is something that must NEVER auto-publish: a stale
// price, invented social proof, a real address, an emoji, a cold first touch, a community forum
// post, a stale target record, an un-enabled tier, a killed switch, a blown cap.
//
// The shipped state — tier 0, everything blocked — is case 1, and it is the one that must never
// go green by accident.

import {
  canAutoSend, classifyPost, contentBlocks, hasFabricatedProof, hasEmoji, hasRealAddress, priceOk, policy,
} from '../pods/redos/policy.mjs';
import { renderTemplate } from '../pods/redos/templates.mjs';

const ok = (pass, detail = '') => ({ pass, detail });

// A stand-in for readPlans() so the suite runs without the DealCalc checkout present.
// Mirrors lib/pricing.ts as of 2026-08-05: $79 / $149 / $249 at 50%.
const PLANS = {
  ok: true,
  plans: [{ name: 'Starter', price: 79 }, { name: 'Investor', price: 149 }, { name: 'Portfolio', price: 249 }],
  commissions: [
    { name: 'Starter', price: 79, commission: 39.5 },
    { name: 'Investor', price: 149, commission: 74.5 },
    { name: 'Portfolio', price: 249, commission: 124.5 },
  ],
  allowed: new Set(['$79', '$149', '$249', '$39.50', '$74.50', '$124.50']),
  error: null,
};

const NOW = Date.parse('2026-08-05T12:00:00Z');
const FRESH = { id: 't', name: 'Dan Lane', verifiedAt: '2026-08-04', replied: true, threadOpened: true };
const CLEAN = 'Dan, the score is live at https://redoshq.com/s#abc and it opens with no account. I pay 50% on a one-time price, so $39.50, $74.50 or $124.50 a sale.';
const T1 = { REDOS_AUTO_TIER: '1' };
const T2 = { REDOS_AUTO_TIER: '2' };
const base = (over = {}) => ({
  templateKey: 'reply-partner-question', body: CLEAN, channel: 'email', recipient: FRESH,
  env: T1, plans: PLANS, now: NOW, ...over,
});

export default {
  agent: 'redos-policy',
  cases: [
    // ── the shipped state ──────────────────────────────────────────────
    { name: 'DEFAULT IS OFF — with no env set, nothing auto-sends (the shipped state)', run: () => {
      const r = canAutoSend(base({ env: {} }));
      return ok(r.allow === false && /tier 0|OFF/i.test(r.reason), JSON.stringify(r));
    } },

    { name: 'KILL SWITCH overrides every other guard', run: () => {
      const r = canAutoSend(base({ env: { ...T2, REDOS_KILL: '1' } }));
      return ok(r.allow === false && /KILL/i.test(r.reason), JSON.stringify(r));
    } },

    // ── the happy path must actually pass, or the suite proves nothing ──
    { name: 'a clean reply to someone who replied, on a fresh record, at tier 1 → ALLOW', run: () => {
      const r = canAutoSend(base());
      return ok(r.allow === true, JSON.stringify(r));
    } },

    // ── cold outreach is never a tier ──────────────────────────────────
    { name: 'COLD first touch is blocked at tier 1', run: () => {
      const r = canAutoSend(base({ templateKey: 'cold-affiliate' }));
      return ok(r.allow === false && /never auto-sends/i.test(r.reason), JSON.stringify(r));
    } },

    { name: 'COLD first touch is blocked at tier 2 as well — it is not a ladder rung', run: () => {
      const r = canAutoSend(base({ templateKey: 'cold-affiliate', env: T2 }));
      return ok(r.allow === false && /never auto-sends/i.test(r.reason), JSON.stringify(r));
    } },

    { name: 'a reply template aimed at someone who never replied is reclassified as COLD', run: () => {
      const r = canAutoSend(base({ recipient: { ...FRESH, replied: false } }));
      return ok(r.allow === false && r.kind === 'cold-outreach', JSON.stringify(r));
    } },

    // ── community forums ───────────────────────────────────────────────
    { name: 'a Reddit post never auto-sends, at any tier', run: () => {
      const r = canAutoSend(base({ templateKey: 'post-teardown', channel: 'reddit', env: T2 }));
      return ok(r.allow === false && /community/i.test(r.reason), JSON.stringify(r));
    } },

    { name: 'a BiggerPockets post never auto-sends', run: () => {
      const r = canAutoSend(base({ templateKey: 'post-teardown', channel: 'biggerpockets', env: T2 }));
      return ok(r.allow === false, JSON.stringify(r));
    } },

    { name: 'an owned-channel post (linkedin) DOES pass at tier 1', run: () => {
      const r = canAutoSend(base({ templateKey: 'post-teardown', channel: 'linkedin' }));
      return ok(r.allow === true, JSON.stringify(r));
    } },

    // ── the price guard ────────────────────────────────────────────────
    { name: 'PRICE GUARD: a body containing the stale $49 is blocked', run: () => {
      const r = canAutoSend(base({ body: 'Grab it for $49 while the founding price lasts.' }));
      return ok(r.allow === false && /price guard/i.test(r.reason) && /\$49/.test(r.reason), JSON.stringify(r));
    } },

    { name: 'PRICE GUARD: an uncited competitor figure is blocked', run: () => {
      const r = canAutoSend(base({ body: CLEAN + ' DealCheck charges $20 a month.' }));
      return ok(r.allow === false && /\$20/.test(r.reason), JSON.stringify(r));
    } },

    { name: 'PRICE GUARD: the same figure passes once a source URL is attached', run: () => {
      const r = canAutoSend(base({
        body: CLEAN + ' DealCheck charges $20 a month.',
        citedFigures: [{ figure: '$20', source: 'https://dealcheck.io/pricing/' }],
      }));
      return ok(r.allow === true, JSON.stringify(r));
    } },

    { name: 'PRICE GUARD: a citation with no URL does not count', run: () => {
      const r = canAutoSend(base({
        body: CLEAN + ' DealCheck charges $20 a month.',
        citedFigures: [{ figure: '$20', source: 'I remember reading it' }],
      }));
      return ok(r.allow === false && /\$20/.test(r.reason), JSON.stringify(r));
    } },

    { name: 'PRICE GUARD: unreadable pricing.ts blocks everything rather than assuming defaults', run: () => {
      const broken = { ok: false, plans: [], commissions: [], allowed: new Set(), error: 'cannot read lib/pricing.ts: ENOENT' };
      const r = canAutoSend(base({ plans: broken }));
      return ok(r.allow === false && /cannot verify prices/i.test(r.reason), JSON.stringify(r));
    } },

    // ── fabricated proof: the highest-risk failure in this business ─────
    { name: 'PROOF GUARD: "join 500+ investors" is blocked', run: () => {
      const r = canAutoSend(base({ body: 'Join 500+ investors already using REDOS. ' + CLEAN }));
      return ok(r.allow === false && /fabricated proof/i.test(r.reason), JSON.stringify(r));
    } },

    { name: 'PROOF GUARD: a star rating is blocked', run: () => {
      return ok(hasFabricatedProof('Rated 4.9 out of 5 by our users.').length > 0);
    } },

    { name: 'PROOF GUARD: a review count is blocked', run: () => {
      return ok(hasFabricatedProof('Over 200 reviews and counting.').length > 0);
    } },

    { name: 'PROOF GUARD: "as featured in" is blocked', run: () => {
      return ok(hasFabricatedProof('As featured in Forbes.').length > 0);
    } },

    { name: 'PROOF GUARD: honest product facts are NOT blocked (1,511 tests, six calculators)', run: () => {
      const body = 'Six calculators, 1,511 tests, and no data leaves your browser.';
      return ok(hasFabricatedProof(body).length === 0, JSON.stringify(hasFabricatedProof(body)));
    } },

    { name: 'PROOF GUARD: the honest zero state is NOT blocked', run: () => {
      return ok(hasFabricatedProof('No reviews yet, be the first.').length === 0);
    } },

    // ── tone and privacy ───────────────────────────────────────────────
    { name: 'EMOJI GUARD: a pictographic emoji is blocked', run: () => {
      const r = canAutoSend(base({ body: CLEAN + ' Hope you like it \u{1F600}' }));
      return ok(r.allow === false && /emoji/i.test(r.reason), JSON.stringify(r));
    } },

    { name: 'EMOJI GUARD: plain punctuation and currency are not emoji', run: () => {
      return ok(hasEmoji(CLEAN) === false);
    } },

    { name: 'ADDRESS GUARD: a real street address is blocked', run: () => {
      const r = canAutoSend(base({ body: CLEAN + ' Example deal: 4417 Maple Grove Avenue, Dayton OH.' }));
      return ok(r.allow === false && /address/i.test(r.reason), JSON.stringify(r));
    } },

    { name: 'ADDRESS GUARD: the fictional Springfield IL set passes', run: () => {
      return ok(hasRealAddress('Example deal: 742 Evergreen Terrace, Springfield, IL 62704.') === false);
    } },

    // ── staleness: the 2026-08-05 lesson, encoded ──────────────────────
    { name: 'STALENESS: a target verified 20 days ago is blocked at the 14-day default', run: () => {
      const r = canAutoSend(base({ recipient: { ...FRESH, verifiedAt: '2026-07-16' } }));
      return ok(r.allow === false && /verification is \d+d old/i.test(r.reason), JSON.stringify(r));
    } },

    { name: 'STALENESS: a target with no verifiedAt fails closed', run: () => {
      const r = canAutoSend(base({ recipient: { id: 't', name: 'X', replied: true } }));
      return ok(r.allow === false && /no verifiedAt/i.test(r.reason), JSON.stringify(r));
    } },

    // ── tier ladder ────────────────────────────────────────────────────
    { name: 'TIER: a bump (tier 2) is blocked while running at tier 1', run: () => {
      const r = canAutoSend(base({ templateKey: 'bump-partner' }));
      return ok(r.allow === false && /needs tier 2/i.test(r.reason), JSON.stringify(r));
    } },

    { name: 'TIER: the same bump passes at tier 2', run: () => {
      const r = canAutoSend(base({ templateKey: 'bump-partner', env: T2 }));
      return ok(r.allow === true, JSON.stringify(r));
    } },

    { name: 'TIER: a bump on a thread the operator never opened is COLD, even at tier 2', run: () => {
      const r = canAutoSend(base({ templateKey: 'bump-partner', env: T2, recipient: { ...FRESH, threadOpened: false } }));
      return ok(r.allow === false && r.kind === 'cold-outreach', JSON.stringify(r));
    } },

    // ── caps and cooldown ──────────────────────────────────────────────
    { name: 'CAP: over the daily maximum is blocked', run: () => {
      const r = canAutoSend(base({ sentToday: 5 }));
      return ok(r.allow === false && /daily cap/i.test(r.reason), JSON.stringify(r));
    } },

    { name: 'COOLDOWN: inside the per-recipient window is blocked', run: () => {
      const r = canAutoSend(base({ lastToRecipientAt: '2026-08-03' }));
      return ok(r.allow === false && /cooldown/i.test(r.reason), JSON.stringify(r));
    } },

    { name: 'COOLDOWN: outside the window passes', run: () => {
      const r = canAutoSend(base({ lastToRecipientAt: '2026-07-01' }));
      return ok(r.allow === true, JSON.stringify(r));
    } },

    // ── fail closed on garbage ─────────────────────────────────────────
    { name: 'FAIL CLOSED: an empty body is blocked with a reason', run: () => {
      const r = canAutoSend(base({ body: '' }));
      return ok(r.allow === false && /no body/i.test(r.reason), JSON.stringify(r));
    } },

    { name: 'FAIL CLOSED: an unrecognised template is blocked', run: () => {
      const r = canAutoSend(base({ templateKey: 'freestyle-genius-idea' }));
      return ok(r.allow === false && /unrecognised|never auto-sends/i.test(r.reason), JSON.stringify(r));
    } },

    { name: 'FAIL CLOSED: no arguments at all returns allow:false, never a throw', run: () => {
      const r = canAutoSend();
      return ok(r && r.allow === false, JSON.stringify(r));
    } },

    { name: 'FAIL CLOSED: an unparseable lastToRecipientAt is blocked', run: () => {
      const r = canAutoSend(base({ lastToRecipientAt: 'last tuesday' }));
      return ok(r.allow === false && /unparseable/i.test(r.reason), JSON.stringify(r));
    } },

    // ── env clamping ───────────────────────────────────────────────────
    { name: 'ENV: a tier above the ladder clamps to 2, it does not unlock cold outreach', run: () => {
      const p = policy({ REDOS_AUTO_TIER: '99' });
      const r = canAutoSend(base({ templateKey: 'cold-affiliate', env: { REDOS_AUTO_TIER: '99' } }));
      return ok(p.tier === 2 && r.allow === false, `${p.tier} ${r.reason}`);
    } },

    // ── templates fail closed too ──────────────────────────────────────
    { name: 'TEMPLATE: a missing required slot throws instead of rendering a hole', run: () => {
      try { renderTemplate('cold-affiliate', { name: 'Dan' }, PLANS); return ok(false, 'rendered anyway'); }
      catch (e) { return ok(/missing slot/i.test(e.message), e.message); }
    } },

    { name: 'TEMPLATE: the share link is a REQUIRED slot on every outward template', run: () => {
      const outward = ['cold-affiliate', 'cold-followup', 'post-teardown', 'post-shortform-script', 'bump-partner'];
      const missing = outward.filter((k) => {
        try { renderTemplate(k, { subject: 's', name: 'N', hook: 'h', hookSource: 'u', deadline: 'Friday', finding: 'f' }, PLANS); return true; }
        catch (e) { return !/share/.test(e.message); }
      });
      return ok(missing.length === 0, `templates that rendered without a share link: ${missing.join(', ')}`);
    } },

    { name: 'TEMPLATE: commissions are injected from the plan set, never typed into the template', run: () => {
      const r = renderTemplate('cold-affiliate', {
        subject: 's', name: 'Dan', hook: 'h', hookSource: 'https://x', share: 'https://redoshq.com/s#a', deadline: 'Friday',
      }, PLANS);
      const clean = contentBlocks(r.body, { plans: PLANS });
      return ok(/\$39\.50/.test(r.body) && /\$74\.50/.test(r.body) && /\$124\.50/.test(r.body) && clean.length === 0, clean.join(' | '));
    } },
  ],
};
