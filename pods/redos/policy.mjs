// policy.mjs — the REDOS distribution SAFETY CORE. Pure, eval-pinned, fails closed.
//
// This is the only code in the REDOS pod that can authorise publishing or sending without the
// operator. Modelled on pods/gov/outreach-policy.mjs (Phase 9) rather than reinvented, because a
// second independent policy engine would be a second place a bad send can escape.
//
// What makes REDOS different from the gov pod:
//   1. REDOS has ZERO customers. Fabricated social proof is the highest-risk failure mode in the
//      business, so it gets its own detector (hasFabricatedProof) with the same standing as the
//      gov pod's pricing guard.
//   2. Prices are not constants here. They are read from DealCalc/lib/pricing.ts at decision time
//      (pods/redos/pricing.mjs). A body containing "$49" — the pre-repricing figure that survived
//      in six vault docs — is blocked by arithmetic, not by anyone remembering.
//   3. Cold outreach is NOT a tier. It can never auto-send at any tier, forever. Operator decision
//      2026-08-05: "auto-send low-risk, gate the rest", where cold outreach is explicitly the rest.
//   4. Target records rot. The 2026-07-24 affiliate list was wrong on four of ten targets twelve
//      days later — two dark, one with the opposite affiliate posture, follower counts off by 2x
//      and 5x. A stale target produces a confident wrong email, so staleness is a hard block.
//
// TIERS (shipped default is 0 — a fresh deploy sends nothing, ever, until the operator changes it):
//   0  off
//   1  replies on an existing thread + scheduled posts to an owned channel
//   2  + follow-up bumps on a thread the operator opened
//   -  cold first-touch, priced, unproven or community-forum content: never, at any tier.

import { readPlans, dollarFigures } from './pricing.mjs';

export const TIERS = { 0: 'off', 1: 'replies + owned-channel posts', 2: '+ follow-up bumps' };

/** Channels the operator owns and may post to unattended. Confirmed 2026-08-05. */
export const OWNED_CHANNELS = ['x', 'linkedin', 'threads', 'email'];

/** Communities that ban promotional links, where a bad post costs the account. Never automated. */
export const COMMUNITY_CHANNELS = ['reddit', 'biggerpockets', 'facebook', 'facebook-group', 'skool', 'discord', 'forum'];

const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export function policy(env = process.env) {
  return {
    tier: clamp(num(env.REDOS_AUTO_TIER, 0), 0, 2),
    dailyMax: clamp(num(env.REDOS_DAILY_MAX, 5), 0, 50),
    cooldownDays: clamp(num(env.REDOS_COOLDOWN_DAYS, 7), 0, 90),
    staleDays: clamp(num(env.REDOS_TARGET_STALE_DAYS, 14), 1, 365),
    kill: String(env.REDOS_KILL || '') === '1',
  };
}

// ───────────────────────────────────────────────────────────── content guards (each PURE)

// Social proof REDOS does not have. Zero customers, zero reviews, zero testimonials, zero logos.
// Deliberately broad: a false positive costs one rewrite, a false negative is a published lie.
const PROOF_PATTERNS = [
  [/\b\d[\d,]*\s*\+?\s*(customers?|users?|investors?|members?|subscribers?|buyers?|installs?|downloads?|teams?|companies)\b/i, 'claims a user or customer count'],
  [/\b(join|trusted by|loved by|used by|powering|serving)\s+[\d,]+\s*\+?/i, 'claims an audience size'],
  [/\b\d[\d,]*\s*\+?\s*(reviews?|ratings?|testimonials?|stars?)\b/i, 'claims a review or rating count'],
  [/\b\d(\.\d)?\s*(out of|\/)\s*5\b/i, 'claims a star rating'],
  [/\b(rated|ranked)\s+(#?\d|top|best|number\s*one)/i, 'claims a rating or ranking'],
  [/\bthousands of\s+(customers?|users?|investors?|people)\b/i, 'claims a vague large user base'],
  [/\b(our|my)\s+(customers?|users?|clients?)\s+(say|report|love|tell)/i, 'attributes a quote to customers'],
  [/\b\d+%\s+of\s+(our|my)\s+(users?|customers?)/i, 'claims a customer statistic'],
  [/\bas (seen|featured) (in|on)\b/i, 'claims media coverage'],
  [/\b\d[\d,]*\s*\+?\s*(deals?|properties)\s+(analy[sz]ed|scored|run)\s+by\s+(users?|investors?|customers?)/i, 'claims customer usage volume'],
];

export function hasFabricatedProof(body = '') {
  const out = [];
  for (const [re, why] of PROOF_PATTERNS) if (re.test(body)) out.push(why);
  return out;
}

// The build fails on any pictographic emoji in DealCalc. Marketing holds the same line.
export function hasEmoji(body = '') {
  return /\p{Extended_Pictographic}/u.test(String(body));
}

// All examples are fictional (Springfield, IL). A real street address must never be published.
const FICTIONAL = /springfield,?\s*(il|illinois)/i;
const STREET = /\b\d{2,6}\s+(?:[A-Z][a-z]+\s+){1,3}(St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Ln|Lane|Blvd|Boulevard|Ct|Court|Way|Pl|Place|Ter|Terrace|Cir|Circle)\b/;

export function hasRealAddress(body = '') {
  const m = String(body).match(STREET);
  if (!m) return false;
  // A street line is fine when the surrounding text is the fictional example set.
  const around = String(body).slice(Math.max(0, m.index - 120), m.index + 200);
  return !FICTIONAL.test(around);
}

/**
 * Every dollar figure in the body must be either a REDOS price/commission read from pricing.ts,
 * or explicitly cited with a source URL by the caller. Nothing else passes.
 *
 * `citedFigures` = [{ figure: '$20', source: 'https://dealcheck.io/pricing/' }]
 * This is the outreach pack's "every number has a URL behind it" rule, enforced in code.
 *
 * Returns [] when clean, else a list of reasons.
 */
export function priceOk(body = '', { plans = null, citedFigures = [] } = {}) {
  const p = plans || readPlans();
  if (!p.ok) return [`cannot verify prices — ${p.error}`];

  const cited = new Set(
    citedFigures
      .filter((c) => c && c.figure && /^https?:\/\//.test(String(c.source || '')))
      .map((c) => String(c.figure).replace(/,/g, '').replace(/\.00$/, ''))
  );

  const bad = [];
  for (const f of dollarFigures(body)) {
    if (p.allowed.has(f) || cited.has(f)) continue;
    bad.push(`"${f}" is not a REDOS price or commission, and carries no cited source`);
  }
  return [...new Set(bad)];
}

/** Every content guard at once. Returns [] when the body is clean. */
export function contentBlocks(body = '', opts = {}) {
  const out = [];
  for (const r of hasFabricatedProof(body)) out.push(`fabricated proof: ${r}`);
  for (const r of priceOk(body, opts)) out.push(`price guard: ${r}`);
  if (hasEmoji(body)) out.push('emoji: the DealCalc build bans pictographic emoji; marketing holds the same line');
  if (hasRealAddress(body)) out.push('address: a real street address outside the fictional Springfield, IL set');
  return out;
}

// ───────────────────────────────────────────────────────────── classification

/**
 * Which class of message this is, and the minimum tier that may send it unattended.
 * tier === null means "never auto-sends, at any tier".
 */
export function classifyPost({ templateKey = '', channel = '', recipient = null } = {}) {
  const ch = String(channel).toLowerCase();
  const key = String(templateKey);

  if (COMMUNITY_CHANNELS.includes(ch)) return { kind: 'community-post', tier: null, why: 'communities ban link drops; a bad post costs the account' };
  if (/^cold-/.test(key)) return { kind: 'cold-outreach', tier: null, why: 'first contact is irreversible and reputational' };
  if (/^reply-/.test(key)) {
    if (!recipient || recipient.replied !== true) return { kind: 'cold-outreach', tier: null, why: 'reply template aimed at someone who has never replied' };
    return { kind: 'reply', tier: 1 };
  }
  if (/^post-/.test(key)) {
    if (!OWNED_CHANNELS.includes(ch)) return { kind: 'post', tier: null, why: `"${channel}" is not an owned channel` };
    return { kind: 'post', tier: 1 };
  }
  if (/^bump-/.test(key)) {
    if (!recipient || recipient.threadOpened !== true) return { kind: 'cold-outreach', tier: null, why: 'bump on a thread the operator never opened' };
    return { kind: 'bump', tier: 2 };
  }
  return { kind: 'unknown', tier: null, why: `unrecognised template "${templateKey}" — failing closed` };
}

// ───────────────────────────────────────────────────────────── the one decision function

const DAY = 86400000;

/**
 * The ONE place that may return allow:true. Every guard must pass; anything else routes to the
 * operator's approval queue with a reason. Bad, missing or malformed input fails closed.
 *
 * @returns {{allow: boolean, reason: string, kind: string}}
 */
export function canAutoSend({
  templateKey, body, channel, recipient,
  env = process.env, plans = null, citedFigures = [],
  sentToday = 0, lastToRecipientAt = null, now = null,
} = {}) {
  const p = policy(env);
  const cls = classifyPost({ templateKey, channel, recipient });
  const deny = (reason) => ({ allow: false, reason, kind: cls.kind });

  if (p.kill) return deny('KILL SWITCH is on — nothing sends');
  if (p.tier === 0) return deny('tier 0 (OFF) — the shipped default; nothing auto-sends');
  if (typeof body !== 'string' || !body.trim()) return deny('no body — failing closed');

  if (cls.tier === null) return deny(`"${cls.kind}" never auto-sends${cls.why ? ` — ${cls.why}` : ''}; routed to approval`);
  if (p.tier < cls.tier) return deny(`"${cls.kind}" needs tier ${cls.tier}, running at tier ${p.tier}`);

  const blocks = contentBlocks(body, { plans, citedFigures });
  if (blocks.length) return deny(blocks.join(' | '));

  // Target freshness. A record older than staleDays produced a confident wrong email once already.
  const t = now == null ? Date.now() : now;
  const verifiedAt = recipient && recipient.verifiedAt ? Date.parse(recipient.verifiedAt) : NaN;
  if (!Number.isFinite(verifiedAt)) return deny('target has no verifiedAt timestamp — failing closed');
  const ageDays = Math.floor((t - verifiedAt) / DAY);
  if (ageDays > p.staleDays) return deny(`target verification is ${ageDays}d old (max ${p.staleDays}d) — reverify before sending`);

  if (sentToday >= p.dailyMax) return deny(`daily cap reached (${sentToday}/${p.dailyMax})`);

  if (lastToRecipientAt) {
    const last = Date.parse(lastToRecipientAt);
    if (!Number.isFinite(last)) return deny('lastToRecipientAt is unparseable — failing closed');
    const since = Math.floor((t - last) / DAY);
    if (since < p.cooldownDays) return deny(`cooldown: last contact ${since}d ago, minimum ${p.cooldownDays}d`);
  }

  return { allow: true, reason: `tier ${p.tier} permits "${cls.kind}"`, kind: cls.kind };
}
