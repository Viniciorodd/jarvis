// bid-fit.mjs — the Rodgate Bid Fit Index (PRD "Watcher Health Contract + Bid Fit Index", 2026-07-20).
// Turns bid go/no-go from intuition into arithmetic: hard disqualifiers → auto NO-BID, else a weighted
// 0–100 score → a band. Pure + deterministic (code disposes on money/eligibility, never the LLM), and
// eval-pinned against six known outcomes so the weights can't silently drift. Scores WHETHER to bid — the
// separate pricing SOP scores what to charge.
//
// Tone (PRD §4.5, L-010): a NO-BID is arithmetic, never a verdict on the operator. Callers must render it
// as "numbers say pass — released, next one," never "failed/missed/overdue." This module only returns data.

export const CORE_NAICS = ['561210', '561720', '561990'];          // our lane
const PRIME_NAICS = ['561210', '561720'];                          // exact-fit core
export const FORBIDDEN_SETASIDES = ['8(a)', '8a', 'hubzone', 'sdvosb', 'wosb', 'edwosb', 'vosb']; // we don't hold these
export const VALUE_CAP = 150000;                                   // operator's cap

const clampNaics = (n) => String(n || '').replace(/[^0-9]/g, '').slice(0, 6);

// PURE: the hard disqualifiers (PRD §4.1). Any ONE → auto NO-BID, score 0, stop scoring. Bond (#5) and the
// past-performance gap (#6) are handled as a hard stop ONLY when the caller asserts them explicitly; an
// unknown bond is a FLAG, not a silent pass. Returns [] when clear.
export function disqualifiers(opp = {}) {
  const dq = [];
  const naics = clampNaics(opp.naics);
  if (naics && !CORE_NAICS.includes(naics)) dq.push({ code: 'naics', reason: `NAICS ${naics} is outside our lane (${CORE_NAICS.join('/')})` });
  const sa = String(opp.setAside || '').toLowerCase();
  if (FORBIDDEN_SETASIDES.some((f) => sa.includes(f))) dq.push({ code: 'set-aside', reason: `requires a set-aside we don't hold (${opp.setAside})` });
  const value = Number(opp.value) || 0;
  if (value > VALUE_CAP) dq.push({ code: 'value-cap', reason: `$${value.toLocaleString()} is over the $${VALUE_CAP.toLocaleString()} cap` });
  if (opp.mandatoryPreBidMissed) dq.push({ code: 'pre-bid-missed', reason: 'a mandatory pre-bid/site visit already passed unattended' });
  if (opp.pastPerfRequired && opp.noSubCarriesPastPerf) dq.push({ code: 'past-perf', reason: 'required past performance we can\'t show and no sub will carry it' });
  return dq;
}

// Per-signal scorers (PRD §4.2). Each returns points; unknown inputs get a neutral middle, never a max.
const SIG = {
  naicsCore(o) { const n = clampNaics(o.naics); return PRIME_NAICS.includes(n) ? 15 : n === '561990' ? 8 : n ? 3 : 3; },        // max 15
  setAsideFit(o) { const s = String(o.setAside || '').toLowerCase(); return /total|set-?aside|sdb|small business set/.test(s) ? 10 : /preference|hispanic|minority|sdb/.test(s) ? 6 : 3; }, // 10
  competitionDepth(o) { if (o.nationalsPresent) return 2; const d = o.docTakers; if (d == null) return 8; return d <= 10 ? 15 : d <= 25 ? 8 : 2; }, // 15
  geographySub(o) { if (o.subOnBench) return 15; const h = Number(o.driveHours); if (!Number.isFinite(h)) return 8; return h <= 2 ? 10 : h <= 4 ? 6 : 2; }, // 15
  recurringValue(o) { const r = String(o.recurring || '').toLowerCase(); return /multi|bpa|year(s)?\b|3-?yr|5-?yr/.test(r) ? 12 : /option/.test(r) ? 8 : 4; }, // 12
  awardSize(o) { const v = Number(o.value) || 0; if (!v) return 6; if (v < 20000) return 5; if (v > 140000) return 6; return 10; }, // 10
  evaluationType(o) { const e = String(o.evaluation || '').toLowerCase(); return /best.?value|tradeoff/.test(e) ? 10 : /lpta|ifb|lowest|sealed/.test(e) ? 3 : 6; }, // 10
  portalGate(o) { const p = String(o.portal || '').toLowerCase(); return /email|open|direct/.test(p) ? 8 : /piee|sam-?portal|known|login|pennbid|bonfire|registered/.test(p) ? 4 : p ? 1 : 6; }, // 8
  pastPerfDemand(o) { const p = String(o.pastPerf || (o.pastPerfRequired ? 'required' : '')).toLowerCase(); return /required|must/.test(p) ? 0 : /prefer/.test(p) ? 3 : 5; }, // 5
};
const LABELS = { naicsCore: 'NAICS core', setAsideFit: 'set-aside fit', competitionDepth: 'competition depth', geographySub: 'geography/sub', recurringValue: 'recurring value', awardSize: 'award size', evaluationType: 'evaluation type', portalGate: 'portal-gate', pastPerfDemand: 'past-perf demand' };
const MAX = { naicsCore: 15, setAsideFit: 10, competitionDepth: 15, geographySub: 15, recurringValue: 12, awardSize: 10, evaluationType: 10, portalGate: 8, pastPerfDemand: 5 };

export function band(score) {
  if (score >= 80) return { band: 'PURSUE', verdict: '🎯 PURSUE', note: 'signals converge' };
  if (score >= 60) return { band: 'REVIEW', verdict: '🟡 REVIEW', note: 'pursue if capacity' };
  if (score >= 40) return { band: 'THIN', verdict: '🟠 THIN', note: 'only if the pipeline is empty' };
  return { band: 'NO-BID', verdict: '❌ NO-BID', note: 'numbers say pass — released, next one' };
}

// PURE: the full index. Returns { score, ...band, disqualified, reasons, signals, strongest, weakest, gates, line }.
export function bidFit(opp = {}) {
  const dq = disqualifiers(opp);
  const gates = [];
  // Portal-gate flag (L-011) fires regardless of score — a login-walled bid can die unfiled.
  const portal = String(opp.portal || '').toLowerCase();
  if (/piee|login|pennbid|bonfire|known|registered|portal/.test(portal) && !/email|open|direct/.test(portal)) {
    gates.push(`portal login (${opp.portal}) — 48-hour L-011 clock starts on download`);
  }
  if (opp.bondRequired) gates.push('bond / upfront cash required — currently unavailable; confirm before drafting');

  if (dq.length) {
    const b = band(0);
    return { score: 0, ...b, disqualified: true, reasons: dq, signals: {}, strongest: [], weakest: [], gates,
      line: `BID FIT: 0/100 — ❌ NO-BID (auto)\nDisqualified: ${dq.map((d) => d.reason).join('; ')}${gates.length ? `\n⚠️ Gate: ${gates.join(' · ')}` : ''}\nNext action: release it — numbers say pass, no drama.` };
  }

  const signals = {};
  for (const k of Object.keys(SIG)) signals[k] = SIG[k](opp);
  const score = Object.values(signals).reduce((a, b) => a + b, 0);
  const b = band(score);
  const ranked = Object.keys(signals).sort((x, y) => (signals[y] / MAX[y]) - (signals[x] / MAX[x]));
  const strongest = ranked.slice(0, 3).map((k) => `${LABELS[k]} (${signals[k]})`);
  const weakest = ranked.slice(-2).map((k) => `${LABELS[k]} (${signals[k]})`);
  const line = `BID FIT: ${score}/100 — ${b.verdict}\nStrongest: ${strongest.join(' · ')}\nWeakest: ${weakest.join(' · ')}`
    + (gates.length ? `\n⚠️ Gate: ${gates.join(' · ')}` : '')
    + `\nNext action: ${b.band === 'PURSUE' ? 'pull the RFP + start Step 0 scoping' : b.band === 'REVIEW' ? 'pursue if capacity allows' : b.band === 'THIN' ? 'hold unless the pipeline is empty' : 'release it — numbers say pass'}`;
  return { score, ...b, disqualified: false, reasons: [], signals, strongest, weakest, gates, line };
}
