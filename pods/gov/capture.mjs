// capture.mjs — the GovCon capture & learning desk: the procedures that separate elite contractors from
// the bottom tiers (per the operator's GovCon Tier Ladder research). Bottom-tier firms spray bids at
// everything and learn nothing; top-tier firms do four things religiously: (1) be SELECTIVE — a
// bid/no-bid gate before a single proposal hour is spent, (2) request a debrief on EVERY loss (FAR
// 15.505/15.506 — it's a right, and it's free intel), (3) mine every win AND loss into lessons that
// change the next bid, (4) keep relationships warm on a cadence (COs, small-biz specialists, primes,
// subs, mentors). Rodgate reality this module encodes: brand-new small prime, NO past performance yet,
// self-certified SDB + minority/Hispanic-owned SMALL business — NOT 8(a)/HUBZone/SDVOSB/WOSB (doctrine
// L-005: never claim a cert we don't hold); lane = janitorial/custodial/grounds/facility support under
// ~$250k near PA/NJ/FL; we subcontract labor but must self-perform 50% on set-aside service awards.
// DOCTRINE: everything here PROPOSES — the debrief email is a draft the operator sends himself; nothing
// auto-sends. Pure logic (bidScore, debriefRequestEmail, lessonsSummary, relationshipsDue) is
// eval-pinned; the ledger is gov-capture/outcomes.jsonl (JSONL, append-only, gitignored).
// CLI: node pods/gov/capture.mjs [summary | score '{"fit":5,...}']

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMPANY } from './company.mjs';

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const DIR = path.join(ROOT, 'gov-capture');
const OUTCOMES = (dir) => path.join(dir, 'outcomes.jsonl');

// Our geography: home turf scores highest, the ring around it still counts.
const HOME_STATES = ['PA', 'NJ', 'FL'];
const NEAR_STATES = ['NY', 'DE', 'MD', 'VA', 'CT'];
// The ladder's #1 trap for a new prime: chasing awards too big to perform. Stay under ~$250k.
const VALUE_CEILING = 250_000;
// BID line: below this the weighted score says our hours are better spent elsewhere.
const BID_THRESHOLD = 60;

// ── PURE: classify a set-aside string → what it means for a self-certified SDB with no formal certs.
// Cert traps (8(a)/HUBZone/SDVOSB/WOSB) are checked FIRST because e.g. "SDVOSB Set-Aside" also contains
// the words "small business". Eval-pinned via bidScore. ─────────────────────────────────────────────
export function classifySetAside(setAside = '') {
  const s = String(setAside || '').toLowerCase();
  if (!s || /full\s*(&|and)?\s*open|unrestricted|none/.test(s)) return { kind: 'open', label: 'full & open' };
  if (/8\s*\(?\s*a\s*\)?(\s|set|sole|comp|$)/.test(s)) return { kind: 'trap', label: '8(a)' };
  if (/hubzone|\bhz[cs]\b/.test(s)) return { kind: 'trap', label: 'HUBZone' };
  if (/sdvosb|\bvosb\b|veteran/.test(s)) return { kind: 'trap', label: 'SDVOSB/VOSB' };
  if (/wosb|edwosb|women/.test(s)) return { kind: 'trap', label: 'WOSB/EDWOSB' };
  if (/\bsdb\b|disadvantaged/.test(s)) return { kind: 'sdb', label: 'SDB' };
  if (/small\s*business|\bsba?\b|total_small/.test(s)) return { kind: 'small', label: 'total small business' };
  return { kind: 'other', label: String(setAside).trim() };
}

// ── PURE: the bid/no-bid gate. Ladder rule #1 — selectivity IS the strategy for a firm with zero past
// performance: every proposal hour spent on a trap is an hour not spent on a winnable micro-award.
// Input: { fit (1-5 scout score), isSourcesSought, valueUsd, setAside, agency, state, deadlineDays,
//          incumbentKnown, hasPastPerformanceInNaics, hasDraft }.
// Returns { score 0-100, verdict 'BID'|'NO_BID'|'RESPOND_SS', reasons[] } — reasons in plain English so
// the operator can sanity-check the machine's call at a glance. Eval-pinned. ─────────────────────────
export function bidScore(opp = {}) {
  const fit = Math.min(5, Math.max(1, Number(opp.fit) || 3));
  const state = String(opp.state || '').trim().toUpperCase();
  const valueUsd = Number(opp.valueUsd) || 0;
  const deadlineDays = opp.deadlineDays == null ? null : Number(opp.deadlineDays);
  const sa = classifySetAside(opp.setAside);
  const reasons = [];

  // ── Score first (it's useful for prioritizing even a NO_BID or a sources-sought queue) ──
  let score = fit * 12;
  reasons.push(`lane fit ${fit}/5 from the scout`);
  if (HOME_STATES.includes(state)) { score += 15; reasons.push(`${state} — home turf, we can put eyes on the site`); }
  else if (NEAR_STATES.includes(state)) { score += 7; reasons.push(`${state} — a drive away, still workable`); }
  else if (state) reasons.push(`${state} — outside our service area, no proximity edge`);
  if (sa.kind === 'sdb') { score += 15; reasons.push('SDB set-aside — our self-certification qualifies, tiny competitor pool'); }
  else if (sa.kind === 'small') { score += 12; reasons.push('total small-business set-aside — the big firms are locked out'); }
  else if (sa.kind === 'open') { score -= 10; reasons.push('full & open — we compete against everyone, including the giants'); }
  if (opp.incumbentKnown === false) { score += 8; reasons.push('no known incumbent — nobody has the inside track'); }
  else if (opp.incumbentKnown === true) reasons.push('a known incumbent is defending this — expect a fight');
  if (valueUsd > 0 && valueUsd <= 100_000) { score += 5; reasons.push('under $100k — the band the big firms skip'); }
  if (opp.hasPastPerformanceInNaics) { score += 5 + 5; reasons.push('we have past performance in this NAICS — rare edge for us, use it'); }
  if (deadlineDays != null && deadlineDays >= 14) { score += 5; reasons.push(`${deadlineDays} days of runway — time to write it right`); }
  else if (deadlineDays != null && deadlineDays >= 3 && deadlineDays < 7) { score -= 5; reasons.push(`only ${deadlineDays} days left — tight but doable`); }
  score = Math.max(0, Math.min(100, Math.round(score)));

  // ── Sources sought in our lane → ALWAYS respond. It's a free relationship: an hour of capability
  // statement + a named contact, and our response can push the set-aside decision our way. ──
  if (opp.isSourcesSought) {
    if (fit >= 3) {
      return { score, verdict: 'RESPOND_SS', reasons: [
        'sources sought in our lane — responding is free: no proposal, no pricing, just a capability statement',
        'a response puts Rodgate on the contracting officer\'s radar and can shape the set-aside decision',
        ...reasons,
      ] };
    }
    return { score, verdict: 'NO_BID', reasons: [`sources sought, but lane fit is only ${fit}/5 — outside our janitorial/grounds/facilities lane`, ...reasons] };
  }

  // ── Trap gates (ladder rule: the fastest way to stay bottom-tier is bidding what you can't win/perform) ──
  if (sa.kind === 'trap') {
    return { score, verdict: 'NO_BID', reasons: [
      `needs an ${sa.label} certification we don't hold — Rodgate is self-certified SDB only, bidding this is a wasted proposal`,
      ...reasons,
    ] };
  }
  if (valueUsd > VALUE_CEILING) {
    return { score, verdict: 'NO_BID', reasons: [
      `~$${Math.round(valueUsd / 1000)}k value is above our ~$${VALUE_CEILING / 1000}k ceiling — too big for a first-award prime to perform (and we must self-perform 50% on set-aside service work)`,
      ...reasons,
    ] };
  }
  if (deadlineDays != null && deadlineDays < 3 && !opp.hasDraft) {
    return { score, verdict: 'NO_BID', reasons: [
      `closes in ${deadlineDays} day(s) and no draft is started — a rushed proposal loses AND burns the hours`,
      ...reasons,
    ] };
  }

  if (score >= BID_THRESHOLD) return { score, verdict: 'BID', reasons: [`score ${score}/100 clears our ${BID_THRESHOLD} bid line — worth the proposal hours`, ...reasons] };
  return { score, verdict: 'NO_BID', reasons: [`score ${score}/100 is under our ${BID_THRESHOLD} bid line — winnable bids exist, this isn't one`, ...reasons] };
}

// ── Win/loss ledger IO — gov-capture/outcomes.jsonl, one JSON object per line, append-only. The `dir`
// override exists so evals never touch the real ledger. ─────────────────────────────────────────────
const RESULTS = ['won', 'lost', 'no_award', 'withdrawn'];

export function recordOutcome(outcome = {}, { dir = DIR } = {}) {
  const result = String(outcome.result || '').toLowerCase();
  if (!RESULTS.includes(result)) return { ok: false, error: `result must be one of: ${RESULTS.join(', ')}` };
  if (!outcome.noticeId && !outcome.title) return { ok: false, error: 'need at least a noticeId or a title' };
  const our = Number(outcome.ourPriceCents) || 0;
  const winner = Number(outcome.winnerPriceCents) || 0;
  let priceGapPct = outcome.priceGapPct == null ? null : Number(outcome.priceGapPct);
  if (priceGapPct == null && our > 0 && winner > 0) priceGapPct = Math.round(((our - winner) / winner) * 1000) / 10;
  const entry = {
    ts: new Date().toISOString(),
    noticeId: String(outcome.noticeId || ''),
    title: String(outcome.title || ''),
    agency: String(outcome.agency || ''),
    naics: String(outcome.naics || ''),
    result,
    ourPriceCents: our || null,
    winnerPriceCents: winner || null,
    winnerName: String(outcome.winnerName || ''),
    techGap: String(outcome.techGap || ''),
    priceGapPct,
    lessons: Array.isArray(outcome.lessons) ? outcome.lessons.map((l) => String(l).trim()).filter(Boolean) : [],
    debriefRequested: !!outcome.debriefRequested,
    debriefNotes: String(outcome.debriefNotes || ''),
  };
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(OUTCOMES(dir), JSON.stringify(entry) + '\n');
  return { ok: true, entry };
}

export function readOutcomes({ dir = DIR } = {}) {
  let text;
  try { text = fs.readFileSync(OUTCOMES(dir), 'utf8'); } catch { return []; }
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* skip a corrupt line, keep the ledger readable */ }
  }
  return out;
}

// ── PURE: the debrief request — ladder rule #2, request one on EVERY loss. FAR 15.505 (pre-award) /
// 15.506 (post-award) make it a right; the 3-day window makes it urgent. Tone: human, gracious, hungry
// to improve — a debrief is also a relationship touch with the CO. NEVER claims any certification
// (doctrine L-005), and it is NEVER auto-sent: the operator reads it, edits it, and sends it himself.
// Eval-pinned. ──────────────────────────────────────────────────────────────────────────────────────
export function debriefRequestEmail({ opp = {}, result = 'lost' } = {}) {
  const c = COMPANY;
  const title = String(opp.title || 'the referenced solicitation').trim();
  const noticeId = String(opp.noticeId || '').trim();
  const agency = String(opp.agency || 'your agency').trim();
  const contact = String(opp.contactName || '').trim() || 'Contracting Officer';
  // Lost after award → post-award debrief (FAR 15.506). Excluded / no-award → pre-award rights (15.505).
  const far = result === 'lost'
    ? 'FAR 15.506, we would like to respectfully request a post-award debriefing'
    : 'FAR 15.505 and 15.506, we would like to respectfully request a debriefing (or any feedback you are able to share)';
  const subject = `Debrief request — ${title}${noticeId ? ` (${noticeId})` : ''}`;
  const body = [
    `Dear ${contact},`,
    ``,
    `Thank you — to you and the evaluation team — for the time you invested in reviewing responses to ${title}${noticeId ? ` (Notice ID ${noticeId})` : ''}. We're grateful for the opportunity to compete for ${agency}'s work.`,
    ``,
    `Under ${far}. We are sending this request promptly to stay within the three-day window. We're a small business that treats every evaluation as a chance to get better: any insight into where our technical approach and our pricing stood relative to the successful offeror would genuinely help us improve.`,
    ``,
    `Whatever the outcome here, we remain very interested in supporting ${agency} on future custodial, janitorial, grounds, and facility-support requirements, and we hope to earn your confidence on the next one.`,
    ``,
    `Thank you again for your consideration.`,
    ``,
    `Respectfully,`,
    `${c.contact.name} · ${c.contact.role}`,
    `${c.legalName} (UEI ${c.uei} · CAGE ${c.cage})`,
    `${c.contact.email} · ${c.contact.phone}`,
  ].join('\n');
  return { subject, body };
}

// ── PURE: mine the ledger into the numbers that change behavior — win rate, which agencies we actually
// win with, WHY we lose (ranked), whether we're keeping the debrief discipline, and how far off our
// pricing runs. winRatePct is wins over DECIDED bids (won+lost); debriefRate is requested/losses as a
// 0-1 fraction. Eval-pinned. ────────────────────────────────────────────────────────────────────────
export function lessonsSummary(outcomes = []) {
  const total = outcomes.length;
  let wins = 0, losses = 0, debriefs = 0;
  const byAgency = {};
  const reasonCounts = new Map();
  const gaps = [];
  for (const o of outcomes) {
    const agency = String(o.agency || '').trim();
    if (agency) {
      byAgency[agency] = byAgency[agency] || { bids: 0, wins: 0 };
      byAgency[agency].bids++;
      if (o.result === 'won') byAgency[agency].wins++;
    }
    if (o.result === 'won') wins++;
    if (o.result === 'lost') {
      losses++;
      if (o.debriefRequested) debriefs++;
      for (const l of o.lessons || []) {
        const r = String(l).trim();
        if (r) reasonCounts.set(r, (reasonCounts.get(r) || 0) + 1);
      }
    }
    const gap = o.priceGapPct != null ? Number(o.priceGapPct)
      : (Number(o.ourPriceCents) > 0 && Number(o.winnerPriceCents) > 0
        ? ((o.ourPriceCents - o.winnerPriceCents) / o.winnerPriceCents) * 100 : null);
    if (gap != null && Number.isFinite(gap)) gaps.push(gap);
  }
  const decided = wins + losses;
  const topLossReasons = [...reasonCounts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
  return {
    total, wins, losses,
    winRatePct: decided ? Math.round((wins / decided) * 100) : 0,
    byAgency,
    topLossReasons,
    debriefRate: losses ? Math.round((debriefs / losses) * 100) / 100 : 0,
    priceGapAvgPct: gaps.length ? Math.round((gaps.reduce((a, b) => a + b, 0) / gaps.length) * 10) / 10 : null,
  };
}

// ── PURE: relationship cadence — ladder rule #4, warm beats cold every time. Default touch cadence by
// role (days); a contact's own cadenceDays overrides. Returns everyone OVERDUE (days since last touch
// >= cadence), stalest first, each with a suggested one-line touch so the operator never stares at a
// blank compose box. A contact never touched is due immediately (staleDays 9999). Eval-pinned. ───────
const DEFAULT_CADENCE = { co: 30, 'small-biz-specialist': 45, prime: 30, sub: 60, mentor: 90 };
const TOUCH_BY_ROLE = {
  co: 'ask what is coming next quarter and whether any janitorial/grounds needs are on the forecast',
  'small-biz-specialist': 'share the new capability statement and ask about upcoming small-business set-asides',
  prime: 'congratulate them on any recent award and ask about subcontracting needs on it',
  sub: 'confirm crew availability and current rates for the next job',
  mentor: 'send a short progress update and ask one specific question',
};

export function relationshipsDue(contacts = [], nowIso = new Date().toISOString()) {
  const now = Date.parse(nowIso);
  const due = [];
  for (const c of contacts) {
    const role = String(c.role || '').toLowerCase();
    const cadenceDays = Number(c.cadenceDays) > 0 ? Number(c.cadenceDays) : (DEFAULT_CADENCE[role] || 45);
    const last = Date.parse(c.lastTouched || '');
    const neverTouched = !Number.isFinite(last);
    const staleDays = neverTouched ? 9999 : Math.floor((now - last) / 86400000);
    if (staleDays < cadenceDays) continue;
    due.push({
      name: String(c.name || ''), org: String(c.org || ''), role, cadenceDays,
      staleDays, overdueDays: staleDays - cadenceDays,
      suggestion: neverTouched
        ? 'introduce yourself and share the capability statement'
        : (TOUCH_BY_ROLE[role] || 'send a short hello and share what Rodgate has been up to'),
    });
  }
  due.sort((a, b) => b.staleDays - a.staleDays);
  return due;
}

// ── CLI ─────────────────────────────────────────────────────────────────────────────────────────────
if (process.argv[1] && process.argv[1].endsWith('capture.mjs')) {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === 'score') {
    let opp;
    try { opp = JSON.parse(arg || '{}'); } catch (e) { console.error('score: bad JSON —', e.message); process.exit(1); }
    const r = bidScore(opp);
    console.log(`\n${r.verdict}  (score ${r.score}/100)`);
    for (const reason of r.reasons) console.log(`  · ${reason}`);
    console.log('');
  } else {
    const outcomes = readOutcomes();
    const s = lessonsSummary(outcomes);
    console.log(`\nGovCon capture ledger — ${s.total} outcome(s) · ${s.wins} won / ${s.losses} lost · win rate ${s.winRatePct}%`);
    console.log(`Debrief discipline: ${Math.round(s.debriefRate * 100)}% of losses debriefed (target: 100%)`);
    if (s.priceGapAvgPct != null) console.log(`Avg price gap vs winner: ${s.priceGapAvgPct > 0 ? '+' : ''}${s.priceGapAvgPct}%`);
    const agencies = Object.entries(s.byAgency);
    if (agencies.length) {
      console.log('\nBy agency:');
      for (const [a, v] of agencies) console.log(`  ${a}: ${v.wins}/${v.bids} won`);
    }
    if (s.topLossReasons.length) {
      console.log('\nTop loss reasons:');
      for (const r of s.topLossReasons.slice(0, 5)) console.log(`  ${r.count}× ${r.reason}`);
    }
    if (!outcomes.length) console.log('Ledger is empty — record outcomes via recordOutcome() as awards resolve.');
    console.log('');
  }
}
