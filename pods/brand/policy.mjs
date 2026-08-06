// policy.mjs — send authority for the Brand pod. The question compliance.mjs does not answer.
//
// `compliance.mjs` asks *may these words be said*. This asks *may anything go out at all, right now,
// from this agent, to this platform*. They are different questions and the PRD merged them, which
// left a real hole:
//
//   🚨 As specified, Telegram `/kill` would halt gov outreach and the brand pod would keep publishing.
//
// `/kill` writes `control-plane/auto-send.json`. `pods/gov/outreach-policy.mjs` reads it on every
// decision; nothing in `pods/brand/` read it at all. A halt that stops one pod is not a halt.
//
// THE KILL SWITCH IS IMPORTED, NOT COPIED. Three lines of file-reading would have been easy to
// duplicate, and then the day someone moves that file the gov pod stops and this one carries on
// publishing under a legal cloud. Importing makes drift impossible: there is one switch, one path,
// one reader. (It also means this module depends on a gov-pod file, which is the wrong shape long
// term — the right fix is extracting the switch to a shared module, and that is a rename, not a
// redesign. Not doing it now because moving a live kill switch to make an import look tidier is a
// bad trade.)
//
// THE SHIPPED STATE IS OFF. Publishing requires an explicit switch, an approval, a clean compliance
// record and a platform under its cap. Absent any of them, nothing goes out.
//
// PURE except for the two file reads it inherits. Eval-pinned.

import fs from 'node:fs';
import { KILL_FILE, killSwitchOn } from '../gov/outreach-policy.mjs';
import { canAgentAct } from '../control-center.mjs';
import { PLATFORMS, assertRoute } from './platforms.mjs';

export { KILL_FILE, killSwitchOn };

// ── The publishing switch, file-backed for the same reason gov's is ──────────────────────────────
// Operator, 2026-08-02: *"If I am away, 200 miles from home, I want to make sure my business is
// still running and that I can operate it."* An env var means editing `.env` on the NAS and
// restarting, which is impossible from a phone. The file wins when set; env is the fallback for a
// fresh install; absent both it is OFF, because the safe default for "does this really publish" is no.
export function brandSendFromFile() {
  try {
    const v = JSON.parse(fs.readFileSync(KILL_FILE, 'utf8')).brandSend;
    return typeof v === 'boolean' ? v : null;
  } catch { return null; }
}
export function brandSendOn(env = process.env) {
  const f = brandSendFromFile();
  if (f !== null) return f;
  return /^(1|true|yes|on)$/i.test(String(env.BRAND_AUTO_PUBLISH || ''));
}

// ── Tiers ────────────────────────────────────────────────────────────────────────────────────────
// Deliberately SHORTER than gov's ladder, because the top rung does not exist here. PRD §3 rule 1:
// nothing publishes without an approval, at any tier. Rogoff autopublishes on a cron and declined the
// approval step when Claude offered it — reasonable with no legal exposure, and not the call here.
//
// So a tier never grants "publish without asking". It grants *which platforms a scheduled, approved
// post may actually reach*.
export const TIERS = {
  0: 'off — approved posts stay queued and nothing reaches a platform',
  1: 'the free platforms (bluesky, mastodon)',
  2: '+ the owned professional channels (linkedin, threads)',
  3: '+ x',
};
const PLATFORM_TIER = { bluesky: 1, mastodon: 1, linkedin: 2, threads: 2, x: 3 };

const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export function tierFromFile() {
  try {
    const t = JSON.parse(fs.readFileSync(KILL_FILE, 'utf8')).brandTier;
    return Number.isFinite(Number(t)) ? Number(t) : null;
  } catch { return null; }
}

// PURE-ish: the current settings. Default tier 0 — the shipped state.
export function policy(env = process.env) {
  const fromFile = tierFromFile();
  const tier = clamp(num(fromFile !== null ? fromFile : env.BRAND_TIER, 0), 0, 3);
  return {
    tier,
    kill: killSwitchOn(),
    publish: brandSendOn(env),
    dailyMax: clamp(num(env.BRAND_DAILY_MAX, 3), 0, 10),
  };
}

// ── May this draft even enter the queue? ─────────────────────────────────────────────────────────
// PRD §3 rules 3 and 4. A blocked draft is not queued at all; a drifting one is regenerated rather
// than shipped. Both refusals name themselves so the producer can act instead of retrying blind.
export function canQueue({ compliance = null, drift = [] } = {}) {
  if (!compliance) return { allow: false, reason: 'no compliance record — a draft is never queued unchecked' };
  if (compliance.ok !== true) {
    const why = (compliance.blocks || []).map((b) => b.why).join('; ') || 'compliance failed';
    return { allow: false, reason: 'blocked: ' + why };
  }
  if (Array.isArray(drift) && drift.length) {
    return { allow: false, reason: 'voice drift: ' + drift.join('; ') + ' — regenerate rather than ship it' };
  }
  return { allow: true, reason: 'cleared content and voice' };
}

// ── May this approved, scheduled post actually reach a platform? ─────────────────────────────────
//
// Fail-closed at every step, and checked at PUBLISH time rather than at approval time. That ordering
// is the point: he can approve seven drafts on Sunday and hit `/kill` on Tuesday, and Tuesday wins.
// A gate that only runs at approval would have already let the week go.
export function canPublish({
  platform = '',
  approvedBy = '',
  compliance = null,
  postedToday = 0,
  postedThisWeek = 0,
  env = process.env,
  agent = '',
  control = null,
} = {}) {
  const p = policy(env);

  // 1. The halt. First, and it beats everything downstream including an approval he already gave.
  if (p.kill) return { allow: false, reason: 'kill switch is ON — nothing publishes until you /resume' };

  // 2. The per-agent switch, enforced here rather than in the UI that renders the toggle: a Tier-0
  //    agent must be UNABLE to act, not merely told not to.
  if (agent && control) {
    const gate = canAgentAct({ state: control, codename: agent, kind: 'act' });
    if (!gate.allow) return { allow: false, reason: gate.reason };
  }

  // 3. The publishing switch. Off is the shipped state.
  if (!p.publish) return { allow: false, reason: 'publishing is OFF — approved posts stay queued (BRAND_AUTO_PUBLISH / brandSend)' };

  // 4. 🚨 The approval. PRD §3 rule 1, made structural rather than procedural: without a recorded
  //    approver there is no path to a platform, so "it published without me" cannot happen by
  //    forgetting a step somewhere upstream.
  if (!String(approvedBy || '').trim()) {
    return { allow: false, reason: 'no recorded approval — nothing publishes without your yes' };
  }

  // 5. Content. Re-checked at publish time, because a draft may have been edited after it cleared.
  if (!compliance || compliance.ok !== true) {
    const why = compliance ? ((compliance.blocks || []).map((b) => b.why).join('; ') || 'failed') : 'never checked';
    return { allow: false, reason: 'compliance: ' + why };
  }

  // 6. Platform, route and tier.
  const meta = PLATFORMS[platform];
  if (!meta) return { allow: false, reason: `unknown platform "${platform}"` };
  try { assertRoute(platform, 'api'); }
  catch (e) { return { allow: false, reason: e.message }; }
  const need = PLATFORM_TIER[platform];
  if (!Number.isFinite(need)) return { allow: false, reason: `no tier defined for "${platform}"` };
  if (need > p.tier) return { allow: false, reason: `${meta.label} needs Tier ${need}; you're on Tier ${p.tier}` };

  // 7. Cadence. The caps live in platforms.mjs so there is one source for them.
  if (num(postedToday, 0) >= num(meta.safeDaily, 1)) {
    return { allow: false, reason: `${meta.label} daily cadence reached (${meta.safeDaily})` };
  }
  if (meta.safeWeekly != null && num(postedThisWeek, 0) >= num(meta.safeWeekly, 99)) {
    return { allow: false, reason: `${meta.label} weekly cadence reached (${meta.safeWeekly})` };
  }
  if (num(postedToday, 0) >= p.dailyMax) {
    return { allow: false, reason: `daily cap across all platforms reached (${p.dailyMax})` };
  }

  return { allow: true, reason: `approved by ${approvedBy}, ${meta.label} Tier ${need} ≤ ${p.tier}, all guards passed` };
}

// PURE: one line for a log or an approval card.
export function policyLine(env = process.env) {
  const p = policy(env);
  if (p.kill) return '🛑 kill switch ON — nothing publishes';
  if (!p.publish) return '⏸ publishing OFF — approved posts stay queued';
  return `▶️ Tier ${p.tier} — ${TIERS[p.tier]}`;
}
