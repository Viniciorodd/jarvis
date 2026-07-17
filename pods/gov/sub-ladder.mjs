// sub-ladder.mjs — the SUB PRIMARY/BACKUP TIER LADDER (GovCon Master Reference §3–4, "auto-activation").
// connector.mjs rates a shortlist of 3 subs for a bid and then only ever contacts the TOP one. If that sub
// never replies, the bid STALLS SILENTLY — nobody activates #2, and a federal deadline passes with no quote
// in hand. The operator is a one-person shop: he cannot hand-chase subs. This module is the escalation clock.
//
// The ladder: shortlist → tier 1 'primary', tier 2 'backup', tier 3+ 'backup-2'. Contact the primary; if it
// goes quiet for GOV_SUB_WAIT_DAYS, activate the next PENDING tier. The moment ANY tier responds the ladder
// CLOSES — we have our sub, so no backup is ever chased behind a "yes". When a stale tier has no next tier,
// the ladder closes as 'bench-exhausted' and the operator is TOLD (a dead bench is a decision — source a new
// sub or no-bid — not a silent stall).
//
// DOCTRINE (non-negotiable, enforced in code — not in a prompt):
//   • §9 rule 2 — activating a backup DRAFTS outreach and raises a HUMAN-GATED send. It NEVER auto-sends;
//     the activation path goes through connector.reachOutToSub(), the same gate a primary goes through.
//   • FAR — a backup passes the SAME exclusion HARD-STOP as a primary. checkSubExclusion runs BEFORE any
//     outreach; an excluded sub is marked 'excluded' and skipped, and we fall through to the next tier.
//   • Never fabricate a response. respondedAt is only ever set by a REAL inbound reply (replies.mjs) or an
//     explicit operator call — the clock can only escalate, it can never invent a "yes".
//
// Ledger = gov-drafts/sub-ladder.jsonl (append-only; mirrors pods/idea-vault.mjs). Each line is the FULL
// current state of one ladder; updating = append a new full-state line; readLadders() folds by
// `${noticeId}|${trade}`, latest line wins. Never delete — the escalation history of every bid survives.
//
// Design (doctrine §11): the tier/clock core is PURE + eval-pinned (no model, no clock, no IO in the hot
// path) — an escalation that could drift with a model's mood would be worse than no escalation. All IO takes
// a { dir } override so tests never touch the real ledger, and is best-effort: it NEVER throws.
//
// CLI: node pods/gov/sub-ladder.mjs [status|run]

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DRAFTS, emit, mirror } from './lib.mjs';
import { checkSubExclusion } from './exclusions.mjs';

const DEFAULT_DIR = DRAFTS;
const ledgerFile = (dir) => path.join(dir, 'sub-ladder.jsonl');

export const ladderKey = (noticeId, trade) => `${noticeId || ''}|${trade || ''}`;

// Tier statuses. 'pending' = never contacted (activatable). 'contacted' = outreach gate raised, clock ticking.
// 'responded' = a REAL reply landed (closes the ladder). 'declined'/'excluded'/'skipped' = permanently out.
export const TIER_STATUSES = ['pending', 'contacted', 'responded', 'declined', 'excluded', 'skipped'];
const OUT = new Set(['declined', 'excluded', 'skipped']); // never activatable — the ladder steps over them

// ── the wait knob. How long a contacted sub gets to reply before we activate the next tier. Default 3 days
// (federal response windows are short — a week of silence is a lost bid). Clamped 1–14 so a typo can't
// escalate the same hour (spamming the bench) nor park the ladder past the deadline. ─────────────────────
export const DEFAULT_WAIT_DAYS = 3;
export function subWaitDays(override) {
  const raw = override === undefined || override === null || override === '' ? process.env.GOV_SUB_WAIT_DAYS : override;
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_WAIT_DAYS;
  return Math.min(14, Math.max(1, Math.round(n)));
}

// ── PURE: shortlist → tiers. Order is PRESERVED (rateSubs already ranked them — re-sorting here would
// silently override the rating system). Eval-pinned. ─────────────────────────────────────────────────────
export function roleForTier(n) { return n <= 1 ? 'primary' : n === 2 ? 'backup' : 'backup-2'; }
export function assignTiers(shortlist) {
  return (Array.isArray(shortlist) ? shortlist : [])
    .filter(Boolean)
    .map((s, i) => ({
      subId: s.id || s.subId || '',
      name: s.name || '',
      email: s.contact_email || s.email || '',
      tier: i + 1,
      role: roleForTier(i + 1),
      contactedAt: null,
      respondedAt: null,
      status: 'pending',
    }));
}

const sortedTiers = (ladder) =>
  (Array.isArray(ladder && ladder.tiers) ? ladder.tiers : []).filter(Boolean).slice().sort((a, b) => (a.tier || 0) - (b.tier || 0));

// ── PURE: has a contacted tier gone quiet past the wait window? A tier that already responded is NEVER
// stale (there is nothing left to wait for). Unparseable dates → not stale (never escalate on garbage).
export function isStale(tier, nowIso = new Date().toISOString(), waitDays) {
  const wd = subWaitDays(waitDays);
  const t = tier || {};
  if (!t.contactedAt || t.respondedAt) return false;
  const c = Date.parse(t.contactedAt), now = Date.parse(nowIso);
  if (!Number.isFinite(c) || !Number.isFinite(now)) return false;
  return c + wd * 864e5 <= now;
}

// ── PURE: which tier (if any) should be activated right now? The whole escalation decision lives here —
// deterministic, eval-pinned. Returns the tier object, or null. RULES, in order:
//   1. ladder closed            → null (we're done with this trade)
//   2. ANY tier responded       → null ← THE LINE THAT MATTERS: we have our sub; never chase a backup
//                                       behind a "yes", and set nothing.
//   3. nothing contacted yet    → tier 1 (the primary)
//   4. highest contacted tier is stale (contactedAt + waitDays <= now) → the next PENDING tier below it,
//      stepping OVER excluded/declined/skipped tiers
//   5. stale, but no next pending tier → null (the caller closes the ladder as 'bench-exhausted')
//   6. still inside the wait window    → null (patience is the correct move; the sub may just be busy)
export function nextTierToActivate(ladder, nowIso = new Date().toISOString(), { waitDays } = {}) {
  const wd = subWaitDays(waitDays);
  const l = ladder || {};
  if (l.closed) return null;
  const tiers = sortedTiers(l);
  if (!tiers.length) return null;
  if (tiers.some((t) => t.status === 'responded' || t.respondedAt)) return null;
  const contacted = tiers.filter((t) => t.contactedAt);
  if (!contacted.length) return tiers.find((t) => t.status === 'pending') || null;
  const last = contacted[contacted.length - 1]; // the HIGHEST contacted tier — the one we're waiting on
  if (!isStale(last, nowIso, wd)) return null;
  const idx = tiers.indexOf(last);
  for (let i = idx + 1; i < tiers.length; i++) if (tiers[i].status === 'pending' && !OUT.has(tiers[i].status)) return tiers[i];
  return null; // bench exhausted for this trade — the caller closes + tells the operator
}

// ── PURE: the plain-English read of one ladder — what the operator/board sees. Eval-pinned. ─────────────
export function ladderStatus(ladder, nowIso = new Date().toISOString(), { waitDays } = {}) {
  const wd = subWaitDays(waitDays);
  const l = ladder || {};
  const tiers = sortedTiers(l);
  const respondedTier = tiers.find((t) => t.status === 'responded' || t.respondedAt) || null;
  const contactedTiers = tiers.filter((t) => t.contactedAt);
  const last = contactedTiers.length ? contactedTiers[contactedTiers.length - 1] : null;
  const next = nextTierToActivate(l, nowIso, { waitDays: wd });
  const waitingOn = !respondedTier && last && !last.respondedAt ? last : null;
  const now = Date.parse(nowIso);
  const since = waitingOn ? Date.parse(waitingOn.contactedAt) : NaN;
  const daysWaiting = Number.isFinite(since) && Number.isFinite(now) ? Math.max(0, Math.floor((now - since) / 864e5)) : null;
  const exhausted = !respondedTier && !next && !!waitingOn && isStale(waitingOn, nowIso, wd)
    ? true
    : l.closedReason === 'bench-exhausted';

  let nextAction;
  if (respondedTier) nextAction = `${respondedTier.name || 'A sub'} responded — work the quote. No backup needed for ${l.trade || 'this trade'}.`;
  else if (exhausted) nextAction = `Bench exhausted for ${l.trade || 'this trade'} — every rated sub was contacted and none replied. Source a new sub or no-bid.`;
  else if (l.closed) nextAction = `Ladder closed${l.closedReason ? ` — ${l.closedReason}` : ''}. Nothing to chase.`;
  else if (next && !last) nextAction = `Contact ${next.name || next.subId} (${next.role}) for ${l.trade || 'this trade'} — nobody has been approached yet.`;
  else if (next) nextAction = `${waitingOn ? waitingOn.name || waitingOn.subId : 'The primary'} has been silent ${daysWaiting}d (limit ${wd}d) — activating ${next.name || next.subId} (${next.role}). You review & send.`;
  else if (waitingOn) nextAction = `Waiting on ${waitingOn.name || waitingOn.subId} (${waitingOn.role}) — ${daysWaiting}d of ${wd}d. Backup activates automatically after that.`;
  else nextAction = 'Nothing to do — no rated subs on this ladder.';

  return {
    noticeId: l.noticeId || null,
    trade: l.trade || null,
    activeTier: l.activeTier ?? (last ? last.tier : null),
    contacted: contactedTiers.length,
    responded: !!respondedTier,
    waitingOn: waitingOn ? waitingOn.name || waitingOn.subId : null,
    daysWaiting,
    exhausted,
    nextAction,
  };
}

// ── best-effort ledger IO (append-only; { dir } override so tests never touch the real ledger) ───────────
function appendState(ladder, dir) {
  try { fs.mkdirSync(dir, { recursive: true }); fs.appendFileSync(ledgerFile(dir), JSON.stringify(ladder) + '\n'); return true; }
  catch { return false; }
}

// Read the ledger and fold by `${noticeId}|${trade}` — the LATEST full-state line for each key wins.
export function readLadders({ dir = DEFAULT_DIR } = {}) {
  let raw; try { raw = fs.readFileSync(ledgerFile(dir), 'utf8'); } catch { return []; }
  const byKey = new Map();
  for (const line of String(raw).split('\n')) {
    if (!line.trim()) continue;
    try { const l = JSON.parse(line); if (l && l.key) byKey.set(l.key, l); } catch { /* skip bad line */ }
  }
  return Array.from(byKey.values());
}

export function openLadders({ dir = DEFAULT_DIR } = {}) { return readLadders({ dir }).filter((l) => !l.closed); }

export function getLadder(noticeId, trade, { dir = DEFAULT_DIR } = {}) {
  const key = ladderKey(noticeId, trade);
  return readLadders({ dir }).find((l) => l.key === key) || null;
}

export function saveLadder(ladder, { dir = DEFAULT_DIR } = {}) {
  if (!ladder || !ladder.key) return { ok: false, error: 'ladder.key required' };
  return appendState(ladder, dir) ? { ok: true, ladder } : { ok: false, error: 'ledger write failed', ladder };
}

// Start (or return) the ladder for one notice+trade. IDEMPOTENT: an existing ladder is returned untouched —
// re-running maybeConnect for the same bid must never wipe the contacted/responded clock we already have.
export function startLadder({ op = {}, trade = '', shortlist = [] } = {}, { dir = DEFAULT_DIR, nowIso } = {}) {
  try {
    const noticeId = (op && op.noticeId) || '';
    const existing = getLadder(noticeId, trade, { dir });
    if (existing) return { ok: true, ladder: existing, existed: true };
    const ladder = {
      key: ladderKey(noticeId, trade),
      noticeId,
      trade,
      ts: nowIso || new Date().toISOString(),
      tiers: assignTiers(shortlist),
      activeTier: null,
      closed: false,
      closedReason: null,
    };
    appendState(ladder, dir);
    return { ok: true, ladder, existed: false };
  } catch (e) { return { ok: false, error: e.message }; }
}

// Internal: fold → mutate one tier → append the new full state. Best-effort; never throws.
function patchTier(noticeId, trade, match, mutate, dir) {
  try {
    const ladder = getLadder(noticeId, trade, { dir });
    if (!ladder) return { ok: false, error: 'no ladder for this notice/trade' };
    const tiers = Array.isArray(ladder.tiers) ? ladder.tiers : [];
    const tier = tiers.find(match);
    if (!tier) return { ok: false, error: 'tier not found', ladder };
    mutate(tier, ladder);
    appendState(ladder, dir);
    return { ok: true, ladder, tier };
  } catch (e) { return { ok: false, error: e.message }; }
}

// The outreach gate for this tier was RAISED (drafted + waiting on the human). The clock starts here —
// NOT at "sent", because a draft the operator sits on is exactly the stall this module exists to break.
export function recordContact(noticeId, trade, subId, { dir = DEFAULT_DIR, nowIso } = {}) {
  const now = nowIso || new Date().toISOString();
  return patchTier(noticeId, trade, (t) => t.subId === subId, (t, l) => {
    t.status = 'contacted';
    t.contactedAt = t.contactedAt || now;
    l.activeTier = t.tier;
  }, dir);
}

// A REAL reply landed (replies.mjs matched it by email). Close the ladder — we have our sub for this trade,
// so no backup is ever chased behind a "yes". Matches by subId OR email (replies.mjs matches by email).
export function recordResponse(noticeId, trade, subIdOrEmail, { dir = DEFAULT_DIR, nowIso } = {}) {
  const now = nowIso || new Date().toISOString();
  const q = String(subIdOrEmail || '').toLowerCase();
  return patchTier(noticeId, trade, (t) => t.subId === subIdOrEmail || String(t.email || '').toLowerCase() === q, (t, l) => {
    t.status = 'responded';
    t.respondedAt = t.respondedAt || now;
    t.contactedAt = t.contactedAt || now;
    l.activeTier = t.tier;
    l.closed = true;
    l.closedReason = 'sub responded';
  }, dir);
}

// Take a tier permanently out of the running ('excluded' — FAR hard stop, or 'declined' — they said no).
export function markTier(noticeId, trade, subId, status, { dir = DEFAULT_DIR } = {}) {
  if (!TIER_STATUSES.includes(status)) return { ok: false, error: `unknown status "${status}"` };
  return patchTier(noticeId, trade, (t) => t.subId === subId, (t) => { t.status = status; }, dir);
}

// Close a whole ladder (bench exhausted / operator call). Best-effort.
export function closeLadder(noticeId, trade, closedReason = 'closed', { dir = DEFAULT_DIR } = {}) {
  try {
    const ladder = getLadder(noticeId, trade, { dir });
    if (!ladder) return { ok: false, error: 'no ladder for this notice/trade' };
    ladder.closed = true;
    ladder.closedReason = closedReason;
    appendState(ladder, dir);
    return { ok: true, ladder };
  } catch (e) { return { ok: false, error: e.message }; }
}

// ── best-effort IO: resolve the full CRM row for a tier so the exclusion check has a UEI/legal name to
// match on. Dynamic import — connector.mjs imports THIS module, so a static import would be a cycle.
async function crmRow(tier) {
  try {
    const { loadSubs } = await import('./connector.mjs');
    const row = (loadSubs() || []).find((s) => s.id === tier.subId);
    if (row) return row;
  } catch { /* CRM unavailable — fall back to what the ladder itself knows */ }
  return { id: tier.subId, name: tier.name, contact_email: tier.email };
}

// ── the auto-activation ladder. For every OPEN ladder: is a tier due? Then (1) EXCLUSION HARD-STOP on that
// sub — the same FAR gate a primary passes; excluded → mark + emit + fall through to the NEXT tier; (2) emit
// the activation; (3) connector.reachOutToSub() DRAFTS the outreach and raises a HUMAN-GATED send (nothing is
// ever auto-sent); (4) recordContact starts that tier's clock. A stale tier with no next tier closes the
// ladder 'bench-exhausted' and TELLS the operator. NEVER throws. ─────────────────────────────────────────
export async function runSubLadder({ nowIso, dir = DEFAULT_DIR } = {}) {
  const out = { checked: 0, activated: [], exhausted: [] };
  let ladders = [];
  try { ladders = openLadders({ dir }); } catch { return out; }
  for (const l of ladders) {
    out.checked++;
    try {
      // Loop: an excluded sub is skipped and we immediately try the tier behind it (bounded by tier count).
      for (let guard = 0; guard <= (Array.isArray(l.tiers) ? l.tiers.length : 0); guard++) {
        const fresh = getLadder(l.noticeId, l.trade, { dir }) || l;
        const next = nextTierToActivate(fresh, nowIso || new Date().toISOString());
        if (!next) {
          // Nothing to activate. Only a STALE contacted tier with no bench left is an EXHAUSTED ladder —
          // "still inside the wait window" and "already responded" are both healthy, silent states.
          const st = ladderStatus(fresh, nowIso || new Date().toISOString());
          if (st.exhausted && !fresh.closed) {
            closeLadder(fresh.noticeId, fresh.trade, 'bench-exhausted', { dir });
            out.exhausted.push({ noticeId: fresh.noticeId, trade: fresh.trade });
            await emit({ kind: 'action', actor: 'CONNECT-01', pod: 'gov', action: 'sub.ladder.exhausted', status: 'need', reversible: true, rationale: `Bench exhausted for ${fresh.trade} on ${fresh.noticeId} — every rated sub was contacted and none replied. Source a new sub or no-bid.`, payload: { noticeId: fresh.noticeId, trade: fresh.trade, tiers: fresh.tiers } });
            await mirror('CONNECT-01', 'need', `⚠ Bench exhausted for ${fresh.trade} (${fresh.noticeId}) — no more subs to try. Source a new one or no-bid.`);
          }
          break;
        }
        // FAR HARD-STOP — a backup passes the SAME exclusion gate as a primary. No exception for "we're
        // in a hurry": bidding an excluded sub is disqualification + False Claims Act exposure.
        const row = await crmRow(next);
        let excl;
        try { excl = await checkSubExclusion(row); }
        catch (e) { excl = { excluded: false, unverified: true, matches: [], reason: `exclusion check failed: ${e.message}` }; }
        if (excl && excl.excluded) {
          markTier(fresh.noticeId, fresh.trade, next.subId, 'excluded', { dir });
          await emit({ kind: 'action', actor: 'CONNECT-01', pod: 'gov', action: 'sub.excluded', status: 'error', reversible: true, rationale: `⛔ ${next.name} is on the SAM EXCLUSIONS list — cannot subcontract (${fresh.trade}). Skipped; trying the next tier.`, payload: { noticeId: fresh.noticeId, trade: fresh.trade, sub: next.subId, matches: excl.matches || [] } });
          continue; // step over the excluded tier and try the next one
        }
        await emit({ kind: 'action', actor: 'CONNECT-01', pod: 'gov', action: 'sub.ladder.activate', reversible: true, rationale: `${next.role} activated for ${fresh.trade} on ${fresh.noticeId}: ${next.name} (tier ${next.tier}) — the tier above went quiet past ${subWaitDays()}d. Outreach is DRAFTED and gated; you review & send.`, payload: { noticeId: fresh.noticeId, trade: fresh.trade, sub: next.subId, tier: next.tier, role: next.role, exclusionUnverified: !!(excl && excl.unverified) } });
        // DRAFTS + raises a HUMAN-GATED send. This is the ONLY outreach path — nothing here auto-sends.
        try { const C = await import('./connector.mjs'); await C.reachOutToSub({ id: next.subId }); }
        catch { /* drafting is best-effort — the tier is still recorded so the clock doesn't restart forever */ }
        recordContact(fresh.noticeId, fresh.trade, next.subId, { dir, nowIso });
        out.activated.push({ noticeId: fresh.noticeId, trade: fresh.trade, sub: next.subId, name: next.name, tier: next.tier, role: next.role });
        break; // one activation per ladder per run — never spam the whole bench at once
      }
    } catch { /* one bad ladder must never stop the rest */ }
  }
  return out;
}

// ── CLI: node pods/gov/sub-ladder.mjs [status|run] ──────────────────────────────────────────────────────
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const cmd = process.argv[2] || 'status';
  if (cmd === 'status') {
    const all = readLadders({});
    if (!all.length) console.log('No sub ladders yet — one starts when a bid needs a sub (pods/gov/connector.mjs).');
    for (const l of all) {
      const s = ladderStatus(l);
      console.log(`\n${s.trade} · ${s.noticeId}${l.closed ? ' [closed]' : ''}`);
      for (const t of (l.tiers || [])) console.log(`  ${t.tier}. ${t.role.padEnd(9)} ${String(t.name || t.subId).padEnd(30)} ${t.status}${t.contactedAt ? ` · contacted ${String(t.contactedAt).slice(0, 10)}` : ''}${t.respondedAt ? ` · REPLIED ${String(t.respondedAt).slice(0, 10)}` : ''}`);
      console.log(`  → ${s.nextAction}`);
    }
  } else if (cmd === 'run') {
    const r = await runSubLadder({});
    console.log(JSON.stringify(r, null, 2));
  } else {
    console.log('usage: node pods/gov/sub-ladder.mjs [status|run]');
  }
}
