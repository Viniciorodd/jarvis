// win-rate.mjs — Projected-vs-Actual (REDOS Port #2): the engine that learns whether Rodgate's OWN bid
// forecasts came true, and by how much. At bid time we PROJECT (Bid Fit band/score, price-to-win, LOE); at
// award we record the ACTUAL (won/lost, winning price, real LOE). forecastAccuracy grades the forecast — were
// PURSUEs actually winning? is price-to-win biased high or low? — and recalibrationHints turns that into
// concrete moves. Doctrine: PURE + eval-pinned; the hints are RECOMMENDATIONS the operator applies — we NEVER
// silently rewrite the eval-pinned Bid Fit weights (a backtest disagreeing with reality is a human decision).
// Feeds the [[🧠 Lessons Ledger]]. This is the win-rate loop that "climbs every quarter because it learns."
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib.mjs';

const DIR = path.join(ROOT, 'gov-winrate');
const LEDGER = path.join(DIR, 'ledger.json');
const readJson = (p, f) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return f; } };
const pct = (num, den) => (den ? Math.round((num / den) * 100) : null);
const avgBiasPct = (rows, proj, act) => {
  const use = rows.filter((r) => Number(r[proj]) > 0 && Number(r[act]) > 0);
  return use.length ? Math.round((use.reduce((s, r) => s + (r[proj] - r[act]) / r[act], 0) / use.length) * 1000) / 10 : null;
};

// PURE (eval-pinned): grade the CLOSED bids. records carry { band, result:'won'|'lost', priceToWin?, winningPrice?, loeHours?, actualLoe? }.
export function forecastAccuracy(records = []) {
  const closed = (Array.isArray(records) ? records : []).filter((r) => r && (r.result === 'won' || r.result === 'lost'));
  const n = closed.length;
  const won = closed.filter((r) => r.result === 'won').length;
  const byBand = {};
  for (const b of ['PURSUE', 'REVIEW', 'THIN', 'NO-BID']) {
    const bb = closed.filter((r) => r.band === b);
    byBand[b] = { total: bb.length, won: bb.filter((r) => r.result === 'won').length, winRate: bb.length ? pct(bb.filter((r) => r.result === 'won').length, bb.length) : null };
  }
  return {
    sampleSize: n, wins: won, overallWinRate: pct(won, n), byBand,
    priceToWinBiasPct: avgBiasPct(closed, 'priceToWin', 'winningPrice'), // + = we priced ABOVE the winner
    loeBiasPct: avgBiasPct(closed, 'loeHours', 'actualLoe'),             // + = we OVER-estimated proposal hours
  };
}

// PURE (eval-pinned): concrete recalibration recommendations from the accuracy. NEVER auto-applied.
export function recalibrationHints(acc = {}) {
  const hints = [];
  const P = (acc.byBand && acc.byBand.PURSUE) || {};
  if (P.total >= 4 && P.winRate != null && P.winRate < 40) hints.push({ severity: 'recalibrate', text: `PURSUE bids won only ${P.winRate}% (${P.won}/${P.total}) — the Bid Fit score reads too optimistic; tighten the weights (competition-depth / geography) so fewer marginal bids land in PURSUE.` });
  if (acc.priceToWinBiasPct != null && acc.priceToWinBiasPct > 8) hints.push({ severity: 'pricing', text: `Your price-to-win ran ~${acc.priceToWinBiasPct}% ABOVE the actual winning price — you're pricing above the winners; trim markup/LOE on competitive bids.` });
  if (acc.priceToWinBiasPct != null && acc.priceToWinBiasPct < -8) hints.push({ severity: 'pricing', text: `Your price-to-win ran ~${Math.abs(acc.priceToWinBiasPct)}% BELOW the winning price — you're leaving money on the table; you can price higher and still win.` });
  if (acc.loeBiasPct != null && acc.loeBiasPct < -15) hints.push({ severity: 'loe', text: `Proposal LOE was under-estimated by ~${Math.abs(acc.loeBiasPct)}% — budget more hours per bid so quality doesn't slip under deadline.` });
  const ordered = ['PURSUE', 'REVIEW', 'THIN'].map((b) => (acc.byBand && acc.byBand[b])).filter((x) => x && x.total >= 2 && x.winRate != null);
  if (ordered.length >= 2 && ordered[0].winRate < ordered[ordered.length - 1].winRate) hints.push({ severity: 'calibrate', text: `Lower bands are winning MORE than PURSUE — the bands aren't discriminating; revisit the scoring signals.` });
  if (!hints.length && acc.sampleSize >= 4) hints.push({ severity: 'ok', text: `Forecasts are tracking reality — no recalibration needed yet (${acc.overallWinRate}% win rate across ${acc.sampleSize} closed bids).` });
  return hints;
}

// ── ledger IO (best-effort, upsert by noticeId; gitignored — real bid outcomes are business data) ──
export function loadWinRate() { const d = readJson(LEDGER, {}); return d && typeof d === 'object' ? d : {}; }
function save(map) { try { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(LEDGER, JSON.stringify(map, null, 2)); } catch { /* best-effort */ } }

// record the PROJECTION at bid time (band/score + optional price-to-win / LOE / margin target).
export function recordBid(noticeId, projected = {}) {
  if (!noticeId) return { ok: false };
  const map = loadWinRate();
  map[noticeId] = { ...(map[noticeId] || {}), noticeId, ...projected, projectedAt: (map[noticeId] && map[noticeId].projectedAt) || new Date().toISOString() };
  save(map); return { ok: true, record: map[noticeId] };
}
// record the ACTUAL at award (result + optional winning price / actual LOE / realized margin).
export function recordAward(noticeId, actual = {}) {
  if (!noticeId || !['won', 'lost'].includes(actual.result)) return { ok: false };
  const map = loadWinRate();
  map[noticeId] = { ...(map[noticeId] || { noticeId }), ...actual, decidedAt: new Date().toISOString() };
  save(map); return { ok: true, record: map[noticeId] };
}

// the one call the endpoint uses: the ledger's accuracy + recalibration hints.
export function winRateReport() {
  const records = Object.values(loadWinRate());
  const accuracy = forecastAccuracy(records);
  return { accuracy, hints: recalibrationHints(accuracy), openBids: records.filter((r) => !r.result).length, closedBids: accuracy.sampleSize };
}
