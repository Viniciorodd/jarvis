// incumbent.mjs — "who holds this contract now, and when does it recompete?" From an opportunity, surface the
// best-signal incumbent + the recompete window, reusing the SAME free USASpending comparable-award sample that
// price-to-win / bid-winners already fetch (no new API load). Doctrine: PURE + deterministic (CODE decides
// who/when, eval-pinned); HONEST about uncertainty — an empty lane yields "no incumbent signal", never a
// fabricated name; a missing period-of-performance end yields "unknown", never a guessed recompete date.
import { inferTrade } from './pipeline.mjs';

const DAY = 86400000;
const MONTH = 30.44 * DAY;
const clampNaics = (n) => String(n || '').replace(/[^0-9]/g, '').slice(0, 6);
const round = (n) => Math.round(Number(n) || 0);

// PURE: the likely CURRENT holder for this lane — the award with the latest period-of-performance end
// (tie-break by dollars). Best signal, not a guarantee (USASpending doesn't link a solicitation to its exact
// predecessor). Empty/no-usable-awards → null (never fabricate an incumbent). Eval-pinned.
export function pickIncumbent(awards = []) {
  const usable = (Array.isArray(awards) ? awards : []).filter((a) => a && a.recipient && Number(a.amount) > 0);
  if (!usable.length) return null;
  const ranked = [...usable].sort((a, b) =>
    String(b.endDate || b.date || '').localeCompare(String(a.endDate || a.date || '')) || Number(b.amount) - Number(a.amount));
  const top = ranked[0];
  return { recipient: top.recipient, awardId: top.awardId || '', amount: round(top.amount), startDate: top.date || '', endDate: top.endDate || '' };
}

// PURE: the recompete window from the incumbent's POP end. Eval-pinned. status ∈
// unknown | stale | recompeting-now | window | locked.
export function recompeteTiming(endDate, now = new Date()) {
  const end = endDate ? new Date(endDate) : null;
  if (!end || isNaN(end.getTime())) return { status: 'unknown', monthsToEnd: null, endsOn: '', note: 'No period-of-performance end on the comparable award — recompete timing unknown.' };
  const endsOn = String(endDate).slice(0, 10);
  const months = Math.round((end.getTime() - now.getTime()) / MONTH);
  if (months < -6) return { status: 'stale', monthsToEnd: months, endsOn, note: `The last comparable contract ended ~${Math.abs(months)} mo ago (${endsOn}) — this solicitation is likely that recompete or a fresh requirement.` };
  if (months <= 0) return { status: 'recompeting-now', monthsToEnd: months, endsOn, note: `The incumbent contract ended ~${endsOn} — this IS the recompete window. Strongest time to displace.` };
  if (months <= 12) return { status: 'window', monthsToEnd: months, endsOn, note: `Incumbent contract ends in ~${months} mo (${endsOn}) — a recompete is imminent; position now.` };
  return { status: 'locked', monthsToEnd: months, endsOn, note: `Incumbent has ~${months} mo left (${endsOn}) — likely locked until then; track it for the recompete.` };
}

// Best-effort network: the incumbent + recompete window + lane concentration for one opp, from the cached
// USASpending comparable-award sample (no new call beyond fetchComparableAwards). Never throws.
export async function incumbentFor(opp = {}, { now = new Date() } = {}) {
  const naics = clampNaics(opp.naics) || inferTrade(opp.title || '').naics;
  const state = String(opp.placeState || '').trim().toUpperCase();
  if (!naics) return { ok: false, error: 'no NAICS to look up' };
  let comp;
  try { const P = await import('./price-to-win.mjs'); comp = await P.fetchComparableAwards({ naics, state }); }
  catch (e) { return { ok: false, error: e.message }; }
  // fetchComparableAwards swallows network errors into a `source: 'error: …'` string rather than throwing —
  // surface that as an honest ok:false so a caller can't mistake a network failure for a real empty lane.
  if (comp && typeof comp.source === 'string' && comp.source.startsWith('error:')) return { ok: false, error: comp.source, sampleSize: 0 };
  const awards = (comp && comp.awards) || [];
  const incumbent = pickIncumbent(awards);
  const recompete = recompeteTiming(incumbent && incumbent.endDate, now);
  let lane = null;
  try { const BW = await import('./bid-winners.mjs'); lane = BW.winnerSummary(BW.topWinners(awards)); } catch { /* lane context best-effort */ }
  return { ok: true, incumbent, recompete, lane, sampleSize: awards.length, source: (comp && comp.source) || '' };
}
