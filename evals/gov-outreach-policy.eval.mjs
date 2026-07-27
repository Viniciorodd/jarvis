// Regression suite for the autonomous-outreach SAFETY CORE (pods/gov/outreach-policy.mjs, Phase 9). This is
// the only code in Jarvis that can authorize sending email without the operator — so these guards ARE the
// feature. Mirrors the PRD's acceptance tests (§7). Every case here is a thing that must NEVER auto-send:
// pricing, a commitment, a false certification, an unverified recipient, an un-enabled tier, a killed switch,
// a blown cap — and the shipped default (tier 0) where NOTHING sends at all. Fails closed on bad input.

import { canAutoSend, hasBlockedContent, factsOk, classifyOutreach, verifiedRecipient, policy } from '../pods/gov/outreach-policy.mjs';

const ok = (pass, detail = '') => ({ pass, detail });
const VERIFIED = { email: 'jane@subco.com', verified: true };
const CLEAN = 'Hi Jane — Rodgate LLC is bidding a janitorial requirement in your area and I\'d like to request a quote for floor care. Could you send your availability and rates? Thanks — Vinicio';
// Tier 1 enabled, for the cases that test the OTHER guards.
const T1 = { AUTO_SEND_TIER: '1', AUTO_SEND_DAILY_MAX: '10', AUTO_SEND_COOLDOWN_DAYS: '3' };

export default {
  agent: 'gov-outreach-policy',
  cases: [
    // ── the shipped state ──
    { name: 'DEFAULT IS OFF — with no env set, nothing auto-sends (the shipped state)', run: () => {
      const r = canAutoSend({ templateKey: 'sub-quote', body: CLEAN, recipient: VERIFIED, env: {} });
      return ok(r.allow === false && /OFF/.test(r.reason), JSON.stringify(r));
    } },

    { name: 'happy path: verified sub + Tier 1 + clean template → ALLOW', run: () => {
      const r = canAutoSend({ templateKey: 'sub-quote', body: CLEAN, recipient: VERIFIED, env: T1 });
      return ok(r.allow === true, JSON.stringify(r));
    } },

    // ── PRD acceptance test 2: unverified recipient ──
    { name: 'GUARD: unverified recipient is BLOCKED (L-009) — verified must be exactly true', run: () => {
      const no = canAutoSend({ templateKey: 'sub-quote', body: CLEAN, recipient: { email: 'x@y.com', verified: false }, env: T1 });
      const missing = canAutoSend({ templateKey: 'sub-quote', body: CLEAN, recipient: { email: 'x@y.com' }, env: T1 });
      const truthy = canAutoSend({ templateKey: 'sub-quote', body: CLEAN, recipient: { email: 'x@y.com', verified: 'yes' }, env: T1 });
      return ok(!no.allow && !missing.allow && !truthy.allow, JSON.stringify({ no: no.allow, missing: missing.allow, truthy: truthy.allow }));
    } },

    // ── PRD acceptance test 3: facts guard ──
    { name: 'GUARD: a template mutated to claim "8(a) certified" is BLOCKED (L-005)', run: () => {
      const r = canAutoSend({ templateKey: 'sub-quote', body: CLEAN + ' We are an 8(a) certified firm.', recipient: VERIFIED, env: T1 });
      return ok(!r.allow && /hard line|false-cert/.test(r.reason), JSON.stringify(r));
    } },

    { name: 'GUARD: HUBZone / SDVOSB / WOSB claims are all blocked', run: () =>
      ok(hasBlockedContent('we are a HUBZone firm').includes('false-cert')
        && hasBlockedContent('SDVOSB certified').includes('false-cert')
        && hasBlockedContent('a woman-owned small business').includes('false-cert')) },

    // ── PRD acceptance test 4: proposal/pricing guard ──
    { name: 'GUARD: anything containing pricing is BLOCKED (proposals are always human-sent)', run: () => {
      const dollars = canAutoSend({ templateKey: 'sub-quote', body: 'Our price is $4,200 per month.', recipient: VERIFIED, env: T1 });
      const words = hasBlockedContent('We can do it for 4200 dollars');
      const ourQuote = hasBlockedContent('our quote for the work');
      return ok(!dollars.allow && words.includes('pricing') && ourQuote.includes('pricing'), JSON.stringify({ dollars: dollars.reason, words, ourQuote }));
    } },

    { name: 'GUARD: commitment language ("we agree to", teaming agreement) is BLOCKED', run: () =>
      ok(hasBlockedContent('we agree to perform the work').includes('commitment')
        && hasBlockedContent('please sign the teaming agreement').includes('commitment')) },

    // ── tier gate ──
    { name: 'GUARD: a prime intro (Tier 2) is BLOCKED while on Tier 1', run: () => {
      const r = canAutoSend({ templateKey: 'prime-intro', body: CLEAN, recipient: VERIFIED, env: T1 });
      return ok(!r.allow && /Tier 2/.test(r.reason), JSON.stringify(r));
    } },

    { name: 'GUARD: sources-sought (Tier 3) blocked on Tier 2; allowed only at Tier 3', run: () => {
      const at2 = canAutoSend({ templateKey: 'sources-sought', body: CLEAN, recipient: VERIFIED, env: { AUTO_SEND_TIER: '2' } });
      const at3 = canAutoSend({ templateKey: 'sources-sought', body: CLEAN, recipient: VERIFIED, env: { AUTO_SEND_TIER: '3' } });
      return ok(!at2.allow && at3.allow === true, JSON.stringify({ at2: at2.allow, at3: at3.allow }));
    } },

    // ── PRD acceptance test 6: kill switch ──
    { name: 'GUARD: the kill switch blocks everything, even a perfect send', run: () => {
      const r = canAutoSend({ templateKey: 'sub-quote', body: CLEAN, recipient: VERIFIED, env: { ...T1, AUTO_SEND_KILL: '1' } });
      return ok(!r.allow && /kill switch/i.test(r.reason), JSON.stringify(r));
    } },

    // ── caps + cooldown ──
    { name: 'GUARD: the daily cap and the per-recipient cooldown both block', run: () => {
      const capped = canAutoSend({ templateKey: 'sub-quote', body: CLEAN, recipient: VERIFIED, sentToday: 10, env: T1 });
      const cooling = canAutoSend({ templateKey: 'sub-quote', body: CLEAN, recipient: VERIFIED, lastToRecipientAt: new Date(Date.now() - 86400000).toISOString(), env: T1 });
      return ok(!capped.allow && /cap/.test(capped.reason) && !cooling.allow && /cooldown/.test(cooling.reason), JSON.stringify({ capped: capped.reason, cooling: cooling.reason }));
    } },

    // ── fail closed ──
    { name: 'FAILS CLOSED: unknown template, empty body, and garbage input all block', run: () => {
      const unknown = canAutoSend({ templateKey: 'something-new', body: CLEAN, recipient: VERIFIED, env: T1 });
      const empty = canAutoSend({ templateKey: 'sub-quote', body: '', recipient: VERIFIED, env: T1 });
      const nothing = canAutoSend({});
      const badDate = canAutoSend({ templateKey: 'sub-quote', body: CLEAN, recipient: VERIFIED, lastToRecipientAt: 'not-a-date', env: T1 });
      return ok(!unknown.allow && !empty.allow && !nothing.allow && !badDate.allow, JSON.stringify({ unknown: unknown.allow, empty: empty.allow, nothing: nothing.allow, badDate: badDate.allow }));
    } },

    { name: 'factsOk: a wrong UEI/CAGE or a non-self-certified "certified" claim fails', run: () =>
      ok(factsOk('Rodgate, UEI Z1SWBFEK7EM4, self-certified SDB') === true
        && factsOk('our UEI is AAAAAAAAAAAA') === false
        && factsOk('we are a certified minority firm') === false) },

    { name: 'classifyOutreach maps kinds to tiers; unknown → never auto-sendable', run: () =>
      ok(classifyOutreach({ templateKey: 'sub-quote' }).tier === 1
        && classifyOutreach({ templateKey: 'prime-intro' }).tier === 2
        && classifyOutreach({ templateKey: 'sources-sought' }).tier === 3
        && !Number.isFinite(classifyOutreach({ templateKey: 'mystery' }).tier)) },

    { name: 'policy() clamps a bad tier and reads the kill switch', run: () => {
      const p = policy({ AUTO_SEND_TIER: '99', AUTO_SEND_KILL: '1' });
      return ok(p.tier === 3 && p.kill === true && policy({}).tier === 0, JSON.stringify(p));
    } },

    { name: 'verifiedRecipient requires an email AND verified===true', run: () =>
      ok(verifiedRecipient({ email: 'a@b.com', verified: true }) === true
        && verifiedRecipient({ email: 'a@b.com' }) === false
        && verifiedRecipient({ verified: true }) === false
        && verifiedRecipient(null) === false) },
  ],
};
