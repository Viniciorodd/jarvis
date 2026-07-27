// outreach-policy.mjs — the SAFETY CORE for autonomous outreach (Phase 9). This is the only place in Jarvis
// that can say "yes, send this without asking Vinicio" — so it is PURE, eval-pinned, and FAILS CLOSED: every
// unknown, missing, or unparseable input returns allow:false with a reason, routing to the approval queue.
//
// The hard line (never autonomous, PRD §2): pricing/dollar commitments · anything committing Rodgate to scope,
// price, timeline or a teaming agreement · formal CO submissions · certification claims beyond self-certified
// SDB (L-005) · unverified recipients (L-009). Proposals and bids are ALWAYS human-sent. That never moves.
//
// Guardrails are CODE, not prompts (PRD §4). Auto-send ships OFF (AUTO_SEND_TIER=0) — the operator turns on a
// tier himself, after review, and can kill everything instantly with AUTO_SEND_KILL=1.
import { COMPANY } from './company.mjs';

export const TIERS = { 0: 'off', 1: 'sub-quote requests + follow-ups', 2: '+ prime introductions', 3: '+ sources-sought responses' };
const KIND_TIER = { 'sub-quote': 1, 'follow-up': 1, 'prime-intro': 2, 'sources-sought': 3 };

const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// PURE: the operator's current settings (env, clamped). Default tier 0 = OFF — the shipped state.
export function policy(env = process.env) {
  return {
    tier: clamp(num(env.AUTO_SEND_TIER, 0), 0, 3),
    dailyMax: clamp(num(env.AUTO_SEND_DAILY_MAX, 10), 0, 100),
    cooldownDays: clamp(num(env.AUTO_SEND_COOLDOWN_DAYS, 3), 0, 60),
    kill: String(env.AUTO_SEND_KILL || '') === '1',
  };
}

// ── THE HARD LINE ────────────────────────────────────────────────────────────────────────────────────
// Any hit here means a human sends it, full stop. Deliberately broad: a false block costs one approval tap;
// a false ALLOW could send a price or a false certification to the government in Rodgate's name.
const BLOCKED = [
  ['pricing', /\$\s?\d|\b\d+(?:,\d{3})+(?:\.\d{2})?\s*(?:dollars|usd)\b|\b(?:our|the)\s+(?:price|quote|rate|bid)\b|\bprice\s*(?:is|of|:)|\bwe\s+(?:can\s+)?(?:do|offer)\s+(?:it\s+)?for\b|\bper\s+(?:sq\.?\s?ft|square\s+foot|hour)\b.*\d/i],
  ['commitment', /\bwe\s+(?:agree|commit|guarantee|accept|will\s+perform)\b|\bteaming\s+agreement\b|\bsubcontract\s+agreement\b|\bsigned?\s+(?:by|below)\b|\bbinding\b/i],
  // NOTE: wom[ae]n covers BOTH "woman-owned" and "women-owned" — the singular is the more common phrasing
  // and slipped this filter until an eval caught it (2026-07-27).
  ['false-cert', /\b8\s*\(?a\)?\b|\bhubzone\b|\bsdvosb\b|\bservice[-\s]?disabled\b|\bwosb\b|\bwom[ae]n[-\s]?owned\b|\bedwosb\b|\bveteran[-\s]?owned\b/i],
  ['co-submission', /\b(?:enclosed|attached)\s+is\s+our\s+(?:proposal|bid|quotation)\b|\bin\s+response\s+to\s+(?:solicitation|rfp|rfq)\b.*\bwe\s+(?:submit|propose)\b|\bformal\s+submission\b/i],
];
// PURE: every hard-line reason this body must NOT auto-send ([] = clean). Non-string input → treated as blocked.
export function hasBlockedContent(body) {
  if (typeof body !== 'string' || !body.trim()) return ['unreadable-body']; // fail closed
  return BLOCKED.filter(([, re]) => re.test(body)).map(([name]) => name);
}

// PURE: Canonical-Facts gate (L-005) — any identity/cert/registration claim must match company.mjs exactly.
// A template mutated to claim something Rodgate doesn't hold fails here even if it dodged hasBlockedContent.
export function factsOk(body) {
  if (typeof body !== 'string') return false;
  const t = body.toLowerCase();
  // A UEI/CAGE stated in the body must be OUR UEI/CAGE. The filler group (is/no/number/code/#/:) matters —
  // "UEI is <wrong>" bypassed a stricter character-class version until an eval caught it (2026-07-27).
  const filler = '(?:\\s*(?:is|no\\.?|number|code|[:#-])\\s*)*\\s*';
  const uei = t.match(new RegExp(`\\buei\\b${filler}([a-z0-9]{12})\\b`, 'i'));
  if (uei && uei[1].toUpperCase() !== COMPANY.uei.toUpperCase()) return false;
  const cage = t.match(new RegExp(`\\bcage\\b${filler}([a-z0-9]{5})\\b`, 'i'));
  if (cage && cage[1].toUpperCase() !== COMPANY.cage.toUpperCase()) return false;
  // "certified" claims are only allowed as SELF-certified SDB/minority/small
  if (/\bcertified\b/.test(t) && !/self[-\s]?certified/.test(t)) return false;
  return true;
}

// PURE: what class of outreach is this, and what tier does it require? Unknown template → tier Infinity
// (never auto-sendable) rather than a guess.
export function classifyOutreach({ templateKey, kind } = {}) {
  const k = String(kind || templateKey || '').toLowerCase();
  const hit = Object.keys(KIND_TIER).find((x) => k.includes(x));
  return hit ? { kind: hit, tier: KIND_TIER[hit] } : { kind: 'unknown', tier: Infinity };
}

// PURE: is this recipient on the operator-maintained allowlist? Explicit true ONLY (L-009) — a missing,
// undefined, or truthy-ish value is NOT verified.
export function verifiedRecipient(contact) {
  return !!(contact && contact.verified === true && typeof contact.email === 'string' && /@/.test(contact.email));
}

const DAY = 86400000;

// ── THE ONE DECISION ─────────────────────────────────────────────────────────────────────────────────
// Returns { allow, reason }. allow:true ONLY when every guard passes. Everything else routes to the
// operator's approval queue with a plain-English reason. Eval-pinned; fails closed on bad input.
export function canAutoSend({ templateKey, kind, body, recipient, sentToday = 0, lastToRecipientAt = null, now = new Date(), env = process.env } = {}) {
  const p = policy(env);
  if (p.kill) return { allow: false, reason: 'kill switch is ON — all autonomous sending halted' };
  if (p.tier <= 0) return { allow: false, reason: 'auto-send is OFF (AUTO_SEND_TIER=0) — everything goes to your approval queue' };

  const cls = classifyOutreach({ templateKey, kind });
  if (!Number.isFinite(cls.tier)) return { allow: false, reason: `unknown outreach type "${templateKey || kind || ''}" — only approved templates can auto-send` };
  if (cls.tier > p.tier) return { allow: false, reason: `${cls.kind} needs Tier ${cls.tier}; you're on Tier ${p.tier}` };

  if (!verifiedRecipient(recipient)) return { allow: false, reason: 'recipient is not marked verified in the CRM (L-009) — never auto-send to an unverified contact' };

  const blocked = hasBlockedContent(body);
  if (blocked.length) return { allow: false, reason: `hard line: ${blocked.join(', ')} — a human sends anything with pricing, a commitment, a cert claim, or a formal submission` };
  if (!factsOk(body)) return { allow: false, reason: 'canonical-facts check failed (L-005) — identity/cert text does not match the company record' };

  if (num(sentToday, 0) >= p.dailyMax) return { allow: false, reason: `daily cap reached (${p.dailyMax} auto-sends)` };
  if (lastToRecipientAt) {
    const last = new Date(lastToRecipientAt).getTime();
    const days = Number.isFinite(last) ? (new Date(now).getTime() - last) / DAY : NaN;
    if (!Number.isFinite(days)) return { allow: false, reason: 'could not read the last-contact date — failing closed' };
    if (days < p.cooldownDays) return { allow: false, reason: `per-recipient cooldown (${p.cooldownDays}d; last contacted ${Math.floor(days)}d ago)` };
  }
  return { allow: true, reason: `${cls.kind} to a verified contact, Tier ${cls.tier} ≤ ${p.tier}, all guards passed` };
}
