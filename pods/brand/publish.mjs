// publish.mjs — the loop. The only path from an approved draft to a platform.
//
// DRY RUN IS THE DEFAULT AND THE SHIPPED STATE. Same contract as pods/redos/executor.mjs: nothing
// here holds a credential, the caller injects the adapter, so a misconfigured deploy publishes
// nothing rather than publishing wrongly.
//
// Guardrails are CODED, per CLAUDE.md — "enforce limits with scoped credentials, never by telling the
// agent don't". In order, and every one fails closed:
//
//   1. BRAND_KILL file            (the handoff's switch)
//   2. control-plane/auto-send.json  (the switch Telegram /kill actually writes)
//   3. policy.canPublish()        agent roster · publishing switch · approval · tier · cadence
//   4. ledgerClearsPublish()      the history contains a real approval event
//   5. complianceCheckPublish()   em dashes · emoji · guaranteed · banned words · unverified figures
//   6. the hard rate cap          2 per platform per day, 10 per week, not agent-configurable
//   7. verified read-back         a claimed send is not a send (L-014)
//
// TWO KILL SWITCHES ON PURPOSE. The handoff specifies data/BRAND_KILL; the rest of Jarvis already
// halts on control-plane/auto-send.json, which is what `/kill` from his phone writes. Honouring only
// the new one would mean `/kill` stops gov and not this. Honouring only the old one would break the
// documented contract. Both halt, and either alone is sufficient — that is the safe direction.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canPublish, killSwitchOn } from './policy.mjs';
import { complianceCheckPublish } from './compliance.mjs';
import { load, append, recordClaim, ledgerClearsPublish } from './store.mjs';

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
export const BRAND_KILL = path.join(ROOT, 'data', 'BRAND_KILL');

// HARD CAPS. Not read from env, not settable by an agent, not overridable by a flag. The handoff is
// explicit that these are hard-coded, and the reason is that a rate limit an agent can raise is a
// rate limit that gets raised.
export const HARD_DAILY = 2;
export const HARD_WEEKLY = 10;

export function brandKillOn() {
  try { return fs.existsSync(BRAND_KILL); } catch { return false; }
}

// PURE: has this platform hit a hard cap? Separate from the per-platform `safeDaily` in
// platforms.mjs — that is the cadence that reads well, this is the ceiling that cannot be crossed.
export function capReached({ postedToday = 0, postedThisWeek = 0 } = {}) {
  if (postedToday >= HARD_DAILY) return `hard cap: ${HARD_DAILY} posts per platform per day`;
  if (postedThisWeek >= HARD_WEEKLY) return `hard cap: ${HARD_WEEKLY} posts per week`;
  return '';
}

const dayOf = (ts) => String(ts || '').slice(0, 10);
const weekAgo = (now) => new Date(new Date(now).getTime() - 7 * 86400000).toISOString().slice(0, 10);

// PURE: what has already gone out, from the ledger itself rather than a counter someone maintains.
export function counts(records = [], platform = '', now = new Date().toISOString()) {
  const pub = (Array.isArray(records) ? records : []).filter((r) =>
    r && r.status === 'published' && r.platform === platform && r.publishedAt);
  return {
    postedToday: pub.filter((r) => dayOf(r.publishedAt) === dayOf(now)).length,
    postedThisWeek: pub.filter((r) => dayOf(r.publishedAt) >= weekAgo(now)).length,
  };
}

/**
 * runOnce({ adapters, dryRun, now, env, control, agent, verifiedFigures })
 *
 * `adapters` is `{ bluesky: fn, mastodon: fn, ... }` — injected, so this module never touches a
 * credential and cannot publish anywhere the caller did not hand it a way to reach.
 */
export async function runOnce({
  adapters = {},
  dryRun = true,
  now = new Date().toISOString(),
  env = process.env,
  control = null,
  agent = '',
  verifiedFigures = null,
} = {}) {
  const out = { checked: 0, published: [], skipped: [], failed: [], halted: '' };

  // Per-platform tally for THIS run, folded into the cap check below. A dry run counts too — otherwise
  // a dry run reports seven "would publish" that a live run would never actually perform.
  const sentThisRun = {};

  // 1 + 2. The halts, before anything is even read.
  if (brandKillOn()) { out.halted = `BRAND_KILL exists at ${BRAND_KILL} — nothing publishes`; return out; }
  if (killSwitchOn()) { out.halted = 'kill switch is ON (control-plane/auto-send.json) — nothing publishes'; return out; }

  const { records } = load();
  const due = records.filter((r) => r && r.status === 'scheduled'
    && (!r.scheduledFor || r.scheduledFor <= now));
  out.checked = due.length;

  for (const rec of due) {
    const skip = (reason) => out.skipped.push({ id: rec.id, platform: rec.platform, reason });

    // 4. The ledger's own gate: is there a real approval event in the history?
    const led = ledgerClearsPublish(rec);
    if (!led.allow) { skip(led.reason); continue; }

    // 5. Compliance, at publish time. A draft can be edited after it cleared.
    const comp = complianceCheckPublish(rec.body || '', { verifiedFigures });
    if (!comp.ok) {
      // A compliance failure is recorded as failed, never quietly retried, and never published around.
      append({ id: rec.id, type: 'fail', error: 'compliance: ' + comp.blocks.map((b) => b.why).join('; ') });
      out.failed.push({ id: rec.id, reason: 'compliance', blocks: comp.blocks.map((b) => b.why) });
      continue;
    }

    // 6. Caps, counted from the ledger PLUS what this very run has already sent.
    //
    // 🚨 `records` is a snapshot taken before the loop and it never updates as posts publish. Counting
    // from it alone meant every post in a run saw postedToday: 0, so a batch of seven all cleared a cap
    // of two and went out together. The hard cap that "cannot be raised by an agent" was not being
    // applied within a single run at all. Found when the social pod first proposed a real batch.
    const c = counts(records, rec.platform, now);
    const live = { postedToday: c.postedToday + (sentThisRun[rec.platform] || 0),
      postedThisWeek: c.postedThisWeek + (sentThisRun[rec.platform] || 0) };
    const capped = capReached(live);
    if (capped) { skip(capped); continue; }

    // 3. Policy: roster, switch, approval, tier, platform cadence.
    const gate = canPublish({
      platform: rec.platform, approvedBy: rec.approvedBy, compliance: comp,
      postedToday: c.postedToday, postedThisWeek: c.postedThisWeek, env, agent, control,
    });
    if (!gate.allow) { skip(gate.reason); continue; }

    const adapter = adapters[rec.platform];
    if (typeof adapter !== 'function') { skip(`no adapter supplied for ${rec.platform}`); continue; }

    if (dryRun) {
      sentThisRun[rec.platform] = (sentThisRun[rec.platform] || 0) + 1;
      out.skipped.push({ id: rec.id, platform: rec.platform, reason: 'dry run — would have published' });
      continue;
    }

    // 7. Publish, then verify. The adapter is responsible for the read-back and for reporting an
    //    unverifiable send as a failure rather than a success.
    let res;
    try { res = await adapter({ text: rec.body, mediaPath: rec.mediaPath || null }); }
    catch (e) { res = { ok: false, error: e.message }; }

    if (!res || !res.ok) {
      append({ id: rec.id, type: 'fail', error: (res && res.error) || 'adapter returned nothing' });
      out.failed.push({ id: rec.id, reason: (res && res.error) || 'adapter returned nothing' });
      continue;
    }

    sentThisRun[rec.platform] = (sentThisRun[rec.platform] || 0) + 1;
    append({ id: rec.id, type: 'publish', platformPostId: res.remoteId || '', url: res.url || '' });
    // The claims log gets the compliance record that cleared it, not a boolean.
    recordClaim({ id: rec.id, text: rec.body, platform: rec.platform, url: res.url || '', compliance: comp });
    out.published.push({ id: rec.id, platform: rec.platform, url: res.url || '', verified: !!res.verified });
  }

  return out;
}
