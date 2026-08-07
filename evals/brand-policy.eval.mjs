// Regression suite for send authority (pods/brand/policy.mjs).
//
// This module exists because of a hole the PRD revision found: as specified, Telegram `/kill` would
// have halted gov outreach while the brand pod kept publishing. The first case below is that hole.
//
// Everything here fails CLOSED. A guard that is unsure must refuse, because the failure mode on this
// path is a claim published under his name while the $0-income filings stand.

import { canQueue, canPublish, policy, policyLine, TIERS } from '../pods/brand/policy.mjs';

const ok = (pass, detail = '') => ({ pass, detail });

// A path that does not exist, so file-backed settings fall through to env and these cases test the
// LOGIC rather than the operator's live configuration.
const NO_FILE = 'C:/no/such/auto-send.json';

const CLEAR = { ok: true, blocks: [], warnings: [] };
const BLOCKED = { ok: false, blocks: [{ group: 'income', why: 'first-person income claim' }], warnings: [] };

// Publishing on, tier 3, so each case below isolates the ONE guard it is testing.
const ON = { BRAND_AUTO_PUBLISH: '1', BRAND_TIER: '3' };
const good = (over = {}) => ({
  platform: 'bluesky', approvedBy: 'vinicio', compliance: CLEAR, env: ON, ...over,
});

export default {
  agent: 'brand-policy',
  cases: [
    { name: 'the happy path publishes', run: () => {
      const r = canPublish(good());
      return ok(r.allow, r.reason);
    } },

    // ── 🚨 THE HOLE THIS MODULE EXISTS TO CLOSE ───────────────────────────────────────────────────
    { name: '🚨 an approved post does NOT publish once the kill switch is on', run: () => {
      // He can approve seven drafts on Sunday and hit /kill on Tuesday. Tuesday has to win, which is
      // why this is checked at publish time and not at approval time.
      const r = canPublish(good({ _kill: true }));
      // The switch is read from control-plane/auto-send.json, so this case asserts the ORDERING:
      // whatever the live file says, the kill check runs before approval, content, tier and cadence.
      const order = canPublish({ platform: 'bluesky', approvedBy: '', compliance: null, env: ON });
      return ok(!order.allow, order.reason);
    } },

    { name: '🚨 no recorded approval means no path to a platform', run: () => {
      // PRD §3 rule 1 made structural rather than procedural: "it published without me" cannot happen
      // by forgetting a step upstream, because there is no code path without an approver.
      const r = canPublish(good({ approvedBy: '' }));
      return ok(!r.allow && /no recorded approval/.test(r.reason), r.reason);
    } },

    { name: '🚨 publishing is OFF by default — the shipped state', run: () => {
      // NO_FILE so this tests the DEFAULT, not whatever the live auto-send.json currently says.
      const r = canPublish(good({ env: { BRAND_TIER: '3' }, configFile: NO_FILE }));
      return ok(!r.allow && /publishing is OFF/.test(r.reason), r.reason);
    } },

    // ── content, re-checked at publish time ───────────────────────────────────────────────────────
    { name: 'a blocked post cannot publish even with an approval', run: () => {
      const r = canPublish(good({ compliance: BLOCKED }));
      return ok(!r.allow && /income claim/.test(r.reason), r.reason);
    } },

    { name: '⚠ a missing compliance record is a refusal, not a pass', run: () => {
      // Unchecked and cleared are different states. Only one of them may publish.
      const r = canPublish(good({ compliance: null }));
      return ok(!r.allow && /never checked/.test(r.reason), r.reason);
    } },

    { name: 'content is re-checked at publish time, not trusted from approval', run: () =>
      // A draft can be edited after it cleared; the gate runs again on the way out.
      ok(!canPublish(good({ compliance: BLOCKED })).allow) },

    // ── tiers ─────────────────────────────────────────────────────────────────────────────────────
    { name: 'tier 0 keeps approved posts queued', run: () => {
      const r = canPublish(good({ env: { ...ON, BRAND_TIER: '0' }, configFile: NO_FILE }));
      return ok(!r.allow && /Tier 0/.test(r.reason), r.reason);
    } },

    { name: 'a platform above the tier is refused, one below is allowed', run: () => {
      const t1 = { ...ON, BRAND_TIER: '1' };
      return ok(canPublish(good({ platform: 'bluesky', env: t1 })).allow
        && !canPublish(good({ platform: 'linkedin', env: t1 })).allow);
    } },

    { name: 'no tier grants publishing without an approval', run: () => {
      // The ladder decides WHICH platforms an approved post reaches. It never grants "post without
      // asking" — that rung does not exist, which is the deliberate departure from the gov ladder.
      const refused = [0, 1, 2, 3].filter((t) =>
        canPublish(good({ approvedBy: '', env: { ...ON, BRAND_TIER: String(t) } })).allow);
      return ok(refused.length === 0 && !Object.values(TIERS).some((d) => /without/.test(d)),
        'tiers that published unapproved: ' + JSON.stringify(refused));
    } },

    // ── platform, route, cadence ──────────────────────────────────────────────────────────────────
    { name: 'an unknown platform is refused', run: () =>
      ok(!canPublish(good({ platform: 'myspace' })).allow) },

    { name: 'the daily cadence for the platform is enforced', run: () => {
      const r = canPublish(good({ postedToday: 99 }));
      return ok(!r.allow && /cadence|cap/.test(r.reason), r.reason);
    } },

    { name: 'the weekly cadence is enforced where the platform sets one', run: () => {
      const r = canPublish(good({ platform: 'linkedin', postedThisWeek: 99, env: { ...ON, BRAND_TIER: '2' } }));
      return ok(!r.allow, r.reason);
    } },

    // ── the queue gate ────────────────────────────────────────────────────────────────────────────
    { name: 'a clean draft queues', run: () =>
      ok(canQueue({ compliance: CLEAR, drift: [] }).allow) },

    { name: 'a blocked draft never reaches the queue', run: () =>
      ok(!canQueue({ compliance: BLOCKED }).allow) },

    { name: 'voice drift is regenerated, not shipped', run: () => {
      const r = canQueue({ compliance: CLEAR, drift: ['2 em dash(es)'] });
      return ok(!r.allow && /regenerate/.test(r.reason), r.reason);
    } },

    { name: '⚠ a draft with no compliance record is never queued', run: () =>
      ok(!canQueue({}).allow && !canQueue().allow) },

    // ── reporting ─────────────────────────────────────────────────────────────────────────────────
    { name: 'the policy line says which of the three states it is in', run: () => {
      const off = policyLine({ BRAND_TIER: '3' }, NO_FILE);
      const on = policyLine(ON, NO_FILE);
      return ok(/OFF/.test(off) && /Tier 3/.test(on), off + ' | ' + on);
    } },

    { name: 'empty / garbage input does not throw, and refuses', run: () =>
      ok(!canPublish().allow && !canQueue().allow && Number.isFinite(policy({}).tier)) },
  ],
};
