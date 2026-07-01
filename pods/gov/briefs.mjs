// Opportunity briefs — the operator asked for "a FEW quality opportunities with real detail, not a flood
// I get paralyzed by." So this returns the TOP N (default 3) bid-worthy, in-lane opportunities, each with:
//   • what they're looking for (description + trade/place)   • a fit score (1–5 + the 0–100)
//   • a win-chance %   • a concrete pursuit strategy   • the deadline + the SAM link
// Deterministic (doctrine #1): the ranking, win-chance and strategy are code, so this works even when the
// LLM is down and never floods you. Feeds the cockpit (/api/gov/briefs) + the Telegram /opps command +
// an optional post-scan push to your phone.

import { CP_URL } from '../lib.mjs';
import { buildBoard, fitScore, winChance, pursuitStrategy, daysUntil, inferTrade, shortSetAside, shortAgency, inLane } from './pipeline.mjs';

// PURE: given the raw bid.score payloads, pick the top N briefs. Eval-tested.
export function pickBriefs(scorePayloads = [], topN = 3) {
  // build board cards from the scored opps (same shape govBoardData feeds buildBoard)
  const byId = new Map();
  for (const pl of scorePayloads) {
    const id = pl.noticeId || pl.title; if (!id) continue;
    byId.set(id, pl); // last write wins (freshest score)
  }
  const opportunities = [...byId.values()].map((pl) => ({
    noticeId: pl.noticeId, title: pl.title, score: pl.score, recommendation: pl.recommendation,
    setAside: pl.setAside, agency: pl.agency, place: pl.place, placeState: pl.placeState,
    deadline: pl.deadline, url: pl.url,
  }));
  const board = buildBoard({ opportunities });
  const cards = (board.columns || []).flatMap((c) => c.cards || []);
  // in-lane, still-open, bid-worthy; best fit first
  const open = cards.filter((c) => c.inLane && c.stage !== 'closed' && c.stage !== 'submitted'
    && (c.fit >= 3 || c.stage === 'reviewing' || c.stage === 'responding'))
    .filter((c) => { const dd = daysUntil(c.deadline); return dd == null || dd >= 0; })
    .sort((a, b) => b.fit - a.fit || b.score - a.score);
  return open.slice(0, topN).map((c) => {
    const pl = byId.get(c.noticeId) || {};
    const subNeeded = pl.subcontractor_needed;
    const card = { ...c, subNeeded };
    const desc = String(pl.description || '').replace(/\s+/g, ' ').trim();
    return {
      noticeId: c.noticeId, title: c.title, agency: c.agency, place: c.place,
      trade: c.trade, naics: c.naics, setAside: c.setAside, deadline: c.deadline,
      daysLeft: daysUntil(c.deadline),
      score: c.score, fit: c.fit,
      winChance: winChance(card),
      lookingFor: desc ? desc.slice(0, 320) : `${c.trade || 'Services'}${c.place ? ' — ' + c.place : ''} (see the SAM notice for the full scope).`,
      strategy: pursuitStrategy(card),
      url: c.url,
    };
  });
}

// PURE: format the briefs as a plain-text message (Telegram / notification / CLI). Eval-tested.
export function formatBriefs(briefs = []) {
  if (!briefs.length) return 'No new bid-worthy opportunities in your lane right now. I\'ll keep watching.';
  const lines = [`🏛 Your top ${briefs.length} gov opportunit${briefs.length === 1 ? 'y' : 'ies'} right now:\n`];
  briefs.forEach((b, i) => {
    lines.push(`${i + 1}. ${b.title}`);
    lines.push(`   • ${b.agency || 'Agency'}${b.place ? ' · ' + b.place : ''}${b.deadline ? ' · due ' + String(b.deadline).slice(0, 10) + (b.daysLeft != null ? ` (${b.daysLeft}d)` : '') : ''}`);
    lines.push(`   • What they want: ${b.lookingFor}`);
    lines.push(`   • Fit ${b.fit}/5 (${b.score}/100) · Win chance ~${b.winChance}%`);
    lines.push(`   • Strategy: ${b.strategy}`);
    if (b.url) lines.push(`   • ${b.url}`);
    lines.push('');
  });
  lines.push('Reply "pursue 1" (or 2/3) and I\'ll draft the proposal, or open the Submit Wizard in the app.');
  return lines.join('\n');
}

// Fetch the scored opps from the control-plane event log and build the briefs. topN kept small on purpose.
export async function buildBriefs({ topN = 3, cpUrl = CP_URL } = {}) {
  let ev = [];
  try { ev = await fetch(cpUrl.replace(/\/$/, '') + '/events?pod=gov', { signal: AbortSignal.timeout(6000) }).then((r) => r.json()); } catch { ev = []; }
  const payloads = (Array.isArray(ev) ? ev : []).filter((e) => e.action === 'bid.score' && e.payload).map((e) => e.payload);
  const briefs = pickBriefs(payloads, topN);
  return { briefs, text: formatBriefs(briefs) };
}

if (process.argv[1] && process.argv[1].endsWith('briefs.mjs')) {
  buildBriefs({ topN: Number(process.argv[2]) || 3 }).then((r) => console.log(r.text)).catch((e) => { console.error(e); process.exitCode = 1; });
}
