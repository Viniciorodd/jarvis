// deals.mjs — the DEAL LEDGER: one explicit, linear record per opportunity so NOTHING is "in the air."
// The middleman method is a straight line, and every deal must know exactly where it stands on it:
//
//   scouted → scored → sow_pulled → outreach_drafted → outreach_sent → quotes_in → priced
//           → proposal_ready → submitted → closed
//
// The board (pipeline.mjs) derives coarse columns from live artifacts; THIS is the fine-grained truth
// the operator asked for: per deal — was the SOW pulled? did outreach actually GO OUT? are quotes in?
// what's our price and profit? what exactly is missing before a proper submission (dealGaps)?
//
// Pure state functions are eval-pinned; persistence follows the subs.json pattern (GOV_DATA_DIR on the
// NAS, else next to the code). Writers are the gov worker / connector / sender / replies — one ledger.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { middlemanPrice, parseQuote } from './pricing.mjs';

const SEED_DIR = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.GOV_DATA_DIR || SEED_DIR;
const DEALS_FILE = path.join(DATA_DIR, 'deals.json');

// ── PURE: the line, in order ────────────────────────────────────────────────────────────────────────
export const STAGES = ['scouted', 'scored', 'sow_pulled', 'outreach_drafted', 'outreach_sent', 'quotes_in', 'priced', 'proposal_ready', 'submitted', 'closed'];
export const STAGE_LABELS = {
  scouted: 'Scouted', scored: 'Scored', sow_pulled: 'SOW pulled', outreach_drafted: 'Outreach drafted',
  outreach_sent: 'Outreach sent', quotes_in: 'Quotes in', priced: 'Priced', proposal_ready: 'Proposal ready',
  submitted: 'Submitted', closed: 'Closed',
};
export const stageIndex = (s) => STAGES.indexOf(s);

// ── PURE: move a deal forward (never backward — history is append-only; skipping stages is fine,
// e.g. a no-sub-needed deal jumps from sow_pulled straight to proposal_ready). Returns a NEW object.
export function advanceState(deal, stage, note = '') {
  if (stageIndex(stage) < 0) return deal;
  if (stageIndex(stage) <= stageIndex(deal.stage || 'scouted') && deal.stage) return deal; // no going back
  const at = new Date().toISOString();
  return { ...deal, stage, updatedAt: at, history: [...(deal.history || []), { stage, at, ...(note ? { note } : {}) }] };
}

// ── PURE: what is still MISSING before this deal is a proper submission? This is the anti-"things in
// the air" function — a deterministic checklist per deal, no LLM, no vibes. Eval-pinned.
export function dealGaps(deal = {}) {
  const gaps = [];
  if (stageIndex(deal.stage) >= stageIndex('submitted')) return gaps; // done — nothing hanging
  if (!deal.sow || !deal.sow.pulled) gaps.push({ key: 'sow', text: 'Scope of work not pulled — analysts are working from a headline, not the SOW' });
  if (deal.subNeeded !== false) {
    const outreach = deal.outreach || [];
    const quotes = deal.quotes || [];
    if (!outreach.length) gaps.push({ key: 'outreach', text: 'No sub outreach drafted — no labor lined up' });
    else if (!outreach.some((o) => o.sentAt)) gaps.push({ key: 'outreach_sent', text: `Outreach drafted but NOT SENT (${outreach.length} waiting on your approval)` });
    if (!quotes.length) gaps.push({ key: 'quotes', text: 'No sub quotes in — cannot price the bid' });
    if (!deal.pricing) gaps.push({ key: 'pricing', text: 'No bid price set (need quote × markup)' });
  }
  if (!deal.proposalFile) gaps.push({ key: 'proposal', text: 'Proposal not drafted' });
  return gaps;
}

// ── PURE: whose move is it? The one-word answer the operator glances at. Eval-pinned. ───────────────
export function whoseMove(deal = {}) {
  const gaps = dealGaps(deal);
  if (stageIndex(deal.stage) >= stageIndex('submitted')) return { who: 'agency', text: 'Submitted — awaiting the agency' };
  if (gaps.some((g) => g.key === 'outreach_sent')) return { who: 'you', text: 'Approve the sub outreach so it actually goes out' };
  if (deal.proposalFile && deal.pendingSubmit) return { who: 'you', text: 'Review, sign & submit the proposal' };
  if ((deal.outreach || []).some((o) => o.sentAt) && !(deal.quotes || []).length) return { who: 'sub', text: 'Waiting on sub quotes — Jarvis is watching the inbox' };
  return { who: 'jarvis', text: gaps[0] ? 'Working: ' + gaps[0].text.toLowerCase() : 'On track' };
}

// ── persistence (thin IO over the pure core) ────────────────────────────────────────────────────────
export function loadDeals() {
  try { return JSON.parse(fs.readFileSync(DEALS_FILE, 'utf8')); } catch { return { deals: {} }; }
}
function saveDeals(db) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(DEALS_FILE, JSON.stringify(db, null, 2)); } catch { /* */ }
}

// Create-or-merge a deal record. `patch` merges shallowly; stage only moves FORWARD via advanceState.
export function upsertDeal(noticeId, patch = {}) {
  if (!noticeId) return null;
  const db = loadDeals();
  const cur = db.deals[noticeId] || { noticeId, stage: 'scouted', createdAt: new Date().toISOString(), history: [{ stage: 'scouted', at: new Date().toISOString() }] };
  const { stage, stageNote, ...rest } = patch;
  let next = { ...cur, ...rest, updatedAt: new Date().toISOString() };
  if (stage) next = advanceState(next, stage, stageNote || '');
  db.deals[noticeId] = next;
  saveDeals(db);
  return next;
}

export function getDeal(noticeId) { return loadDeals().deals[noticeId] || null; }

// Record a drafted outreach (connector). file = repo-relative outreach file.
export function recordOutreach(noticeId, { file, sub = null, trade = '' } = {}) {
  const cur = getDeal(noticeId); if (!cur) return null;
  const outreach = [...(cur.outreach || [])];
  if (!outreach.some((o) => o.file === file)) outreach.push({ file, sub, trade, draftedAt: new Date().toISOString(), sentAt: null });
  return upsertDeal(noticeId, { outreach, stage: 'outreach_drafted', stageNote: `outreach drafted${sub ? ' to ' + sub : ''}` });
}

// Mark an outreach SENT (called by the sender on a real SMTP success). Matches by file basename so the
// executor and the CLI both land here regardless of how the path was spelled.
export function markOutreachSentByFile(file) {
  const base = path.basename(String(file || ''));
  if (!base) return null;
  const db = loadDeals();
  for (const [id, deal] of Object.entries(db.deals)) {
    const hit = (deal.outreach || []).find((o) => path.basename(o.file || '') === base);
    if (hit) {
      hit.sentAt = new Date().toISOString();
      db.deals[id] = advanceState(deal, 'outreach_sent', 'outreach dispatched');
      db.deals[id].outreach = deal.outreach;
      saveDeals(db);
      return db.deals[id];
    }
  }
  return null;
}

// Record a sub's quote against every open deal that reached out to that sub, then PRICE it in code.
// Returns the deals it touched. `subId`/`email` identify the sub; `raw` is the quote text as replied.
export function recordQuoteBySub({ subId = null, email = '', name = '' } = {}, raw) {
  const parsed = parseQuote(raw);
  const db = loadDeals();
  const touched = [];
  for (const [id, deal] of Object.entries(db.deals)) {
    if (stageIndex(deal.stage) >= stageIndex('submitted')) continue;
    const reached = (deal.outreach || []).some((o) => o.sub && (o.sub === subId || o.sub === name));
    if (!reached && subId) continue;            // only deals that actually reached out to this sub
    if (!reached && !subId) continue;
    const quotes = [...(deal.quotes || [])];
    quotes.push({ sub: subId || name, email, raw: String(raw || ''), amount: parsed ? parsed.amount : null, period: parsed ? parsed.period : 'total', at: new Date().toISOString() });
    let next = advanceState({ ...deal, quotes }, 'quotes_in', `quote in from ${name || subId}`);
    const best = quotes.filter((q) => q.amount).sort((a, b) => a.amount - b.amount)[0]; // lowest workable quote
    if (best) {
      const pricing = middlemanPrice({ quote: best.amount });
      if (pricing) next = advanceState({ ...next, pricing: { ...pricing, period: best.period, basedOn: best.sub } }, 'priced', `priced: bid $${pricing.bid} (${pricing.markupPct}% over $${pricing.subQuote})`);
    }
    db.deals[id] = next;
    touched.push(next);
  }
  if (touched.length) saveDeals(db);
  return touched;
}

// ── the Deal Room feed: every open deal + its gaps + whose move, sorted by "needs you" then deadline ─
export function dealsBoard() {
  const db = loadDeals();
  const deals = Object.values(db.deals).map((d) => ({
    ...d,
    gaps: dealGaps(d),
    move: whoseMove(d),
    stageLabel: STAGE_LABELS[d.stage] || d.stage,
    stageIdx: stageIndex(d.stage),
  }));
  deals.sort((a, b) =>
    (a.move.who === b.move.who ? 0 : a.move.who === 'you' ? -1 : 1)
    || (new Date(a.deadline || '2999-01-01') - new Date(b.deadline || '2999-01-01')));
  const open = deals.filter((d) => stageIndex(d.stage) < stageIndex('closed'));
  return {
    deals,
    counts: Object.fromEntries(STAGES.map((s) => [s, deals.filter((d) => d.stage === s).length])),
    needsYou: deals.filter((d) => d.move.who === 'you').length,
    pipeline: open.reduce((s, d) => s + ((d.pricing && d.pricing.bid) || d.value || 0), 0),
    profit: open.reduce((s, d) => s + ((d.pricing && d.pricing.profit) || 0), 0),
  };
}
