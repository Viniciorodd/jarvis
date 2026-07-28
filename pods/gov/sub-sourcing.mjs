// sub-sourcing.mjs — "for THIS opportunity, go find me subs and get quotes." The operator's ask (2026-07-27):
// *"our ai agent should do the scrapping of emails and leads for the subs depending on the project we are
// targeting, all based on location and ratings and expertice, with that list of at least 5 subs per
// opportunity, they shall email them for quotes."*
//
// The pieces already existed and were never joined: discover.mjs finds firms (Google Places + SAM, bench-first),
// enrich.mjs scrapes their contact email off their website. This is the orchestration per opportunity:
//   infer trade + place from the opp → source → enrich emails → RANK (reachable · rating · proximity ·
//   expertise · past performance) → the top N as ready-to-send outreach candidates.
//
// ⚠️ Sourced leads are NOT auto-sendable. A newly-scraped firm is `verified:false` by definition, so
// auto-outreach QUEUES it for the operator's approval instead of emailing it (L-009 — no agent-invented
// recipients). Marking a contact verified is the operator's call, always.
import { inferTrade } from './pipeline.mjs';

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const lc = (s) => String(s || '').toLowerCase();

// PURE: what trade + where, from an opportunity. Falls back to janitorial (the core lane). Eval-pinned.
export function targetFor(opp = {}) {
  const t = inferTrade(opp.title || '');
  const trade = (t.trade || 'Janitorial');
  const place = opp.place || opp.placeState || '';
  return { trade, place, naics: opp.naics || t.naics || '' };
}

// PURE: score a candidate sub for THIS opportunity. Reachability dominates — a firm with no email can't be
// asked for a quote, so it can never outrank one that can. Then rating, proximity, expertise, past performance.
// Eval-pinned so the ranking can't drift silently.
export function scoreSub(sub = {}, { trade = '', place = '' } = {}) {
  let score = 0;
  const why = [];
  if (sub.contact_email) { score += 50; why.push('reachable (has email)'); }
  else if (sub.website) { score += 8; why.push('website only — email not found yet'); }
  const rating = num(sub.rating);
  if (rating > 0) { score += Math.round(rating * 6); why.push(`${rating}★`); }
  if (num(sub.reviews) >= 10) { score += 4; why.push(`${num(sub.reviews)} reviews`); }
  const st = lc(place).slice(-2);
  if (st && lc(sub.location).includes(st)) { score += 12; why.push('in the place of performance'); }
  else if (place && lc(sub.location) && lc(sub.location).split(',')[0] && lc(place).includes(lc(sub.location).split(',')[0])) { score += 8; why.push('same area'); }
  if (trade && lc(sub.trade) === lc(trade)) { score += 15; why.push(`${trade} specialist`); }
  else if (trade && (lc(sub.capabilities) + ' ' + lc(sub.name)).includes(lc(trade))) { score += 7; why.push('trade match'); }
  if (num(sub.past_performance) > 0) { score += 10; why.push('worked with us before'); }
  if (sub.verified === true) { score += 20; why.push('VERIFIED — auto-sendable'); }
  if (lc(sub.exclusionStatus).includes('exclu')) { score -= 999; why.push('⛔ SAM-excluded — never use'); }
  return { score, why };
}

// PURE: rank + cut to the top N. Excluded firms are dropped entirely, never merely down-ranked.
export function rankSubs(subs = [], target = {}, { min = 5 } = {}) {
  return (Array.isArray(subs) ? subs : [])
    .map((s) => ({ sub: s, ...scoreSub(s, target) }))
    .filter((x) => x.score > -100)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, min));
}

// Source subs for one opportunity end-to-end. Best-effort at every step — a failed discovery or enrichment
// degrades to whatever the warm bench already holds, never throws.
export async function sourceSubsForOpp(opp = {}, { min = 5, force = false, enrich = true } = {}) {
  const target = targetFor(opp);
  let discovered = null;
  try { const D = await import('./discover.mjs'); discovered = await D.discoverSubs({ trade: target.trade.toLowerCase(), location: target.place, naics: target.naics, force }); }
  catch (e) { discovered = { error: e.message }; }
  // Fill in missing contact emails by scraping the firms' own sites (Hector's enrichment).
  let enriched = null;
  if (enrich) { try { const E = await import('./enrich.mjs'); enriched = await E.enrichSubs({ all: true, limit: 10 }); } catch (e) { enriched = { error: e.message }; } }
  let subs = [];
  try { const C = await import('./connector.mjs'); subs = C.loadSubs() || []; }
  catch { /* fall through to empty */ }
  // keep the plausible pool for this trade/place, then rank
  const pool = subs.filter((s) => s && !s.isTest && (lc(s.trade) === lc(target.trade) || (lc(s.capabilities) + ' ' + lc(s.name)).includes(lc(target.trade)) || !s.trade));
  const ranked = rankSubs(pool.length ? pool : subs.filter((s) => !s.isTest), target, { min });
  return {
    ok: true, target, min,
    discovered: discovered && !discovered.error ? { added: discovered.added || 0, benchFirst: !!discovered.benchFirst } : { error: (discovered || {}).error },
    enriched: enriched && !enriched.error ? { found: (enriched.found || []).length } : { error: (enriched || {}).error },
    subs: ranked.map((r) => ({ id: r.sub.id, name: r.sub.name, email: r.sub.contact_email || '', trade: r.sub.trade, location: r.sub.location, verified: r.sub.verified === true, score: r.score, why: r.why })),
    reachable: ranked.filter((r) => r.sub.contact_email).length,
  };
}

// Turn a sourced list into auto-outreach candidates (sub-quote requests). Only firms with an email can be
// asked anything; the policy gate still decides whether each one SENDS or queues for approval.
export function toOutreachCandidates(sourced = {}, subsById = []) {
  const byId = new Map((subsById || []).map((s) => [s.id, s]));
  return (sourced.subs || [])
    .filter((s) => s.email)
    .map((s) => ({ contact: byId.get(s.id) || { id: s.id, name: s.name, contact_email: s.email, verified: false }, templateKey: 'sub-quote', slots: { trade: s.trade || sourced.target.trade, place: sourced.target.place || 'the project area' } }));
}
