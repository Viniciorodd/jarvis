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

// ── BID COACH (REDOS Port #1) — turn Bid Fit's single "next action" into a RANKED, severity-tagged set of
// ACTIONABLE moves (a move, not an observation), derived deterministically from the same signals. Ranked
// dealbreaker → fix → tip → strength. PURE + eval-pinned. No LLM. ────────────────────────────────────────
const cap1 = (s) => { const t = String(s || '').trim(); return t ? t[0].toUpperCase() + t.slice(1) : t; };
// A concrete MOVE for a weak signal (what to DO about it), keyed by signal name.
const WEAK_MOVE = {
  competitionDepth: { sev: 'fix', text: 'Crowded field (many doc-takers) — submit 2 sharp questions to the CO to reshape scope in your favor before you commit.' },
  geographySub: { sev: 'fix', text: 'No sub on the bench nearby — line up a local crew now (Jarvis can source one) so labor is locked before you bid.' },
  pastPerfDemand: { sev: 'fix', text: 'Past performance is demanded — lead with the sub\'s past performance + your PA/SAM registrations; never claim experience you don\'t hold.' },
  setAsideFit: { sev: 'tip', text: 'Set-aside fit is thin — confirm you can PRIME this before investing in a full response.' },
  recurringValue: { sev: 'tip', text: 'One-time / low recurring value — keep the LOE proportional; don\'t over-invest a full-team response.' },
  awardSize: { sev: 'tip', text: 'Small award — keep the proposal effort lean so the win is worth the hours.' },
  portalGate: { sev: 'fix', text: 'Login-walled portal — register + download early so the submission mechanics don\'t sink the bid.' },
  evaluationType: { sev: 'tip', text: 'Lowest-price/LPTA lean — this is won on PRICE; sharpen the number and trim optional LOE.' },
  naicsCore: { sev: 'tip', text: 'NAICS is off your core lane — double-check it\'s genuinely yours before bidding.' },
};
// A STRENGTH to lean on, keyed by signal name.
const STRONG_MOVE = {
  geographySub: 'Sub on the bench within reach — lean on it in the technical approach as proof of immediate capability.',
  competitionDepth: 'Thin competition — a strong, compliant response has a real shot; pursue it.',
  naicsCore: 'Dead-center in your NAICS lane — make that the opening line of the win theme.',
  setAsideFit: 'Set-aside fits you — lead with the SDB / Minority / Hispanic-owned status as the win theme.',
  recurringValue: 'Multi-year / BPA value — a win here compounds; worth a strong response.',
  evaluationType: 'Best-value / tradeoff — lead the narrative on approach + past performance, not just price.',
};
const ICON = { dealbreaker: '🚨', fix: '⚠️', tip: '💡', price: '💡', strength: '✅' };
const SEV_ORDER = { dealbreaker: 0, fix: 1, tip: 2, price: 3, strength: 4 };

// PURE: the ranked, actionable coach for an opportunity. Returns { score, band, verdict, disqualified, coach:[{severity,icon,text}] }.
export function bidCoach(opp = {}) {
  const fit = bidFit(opp);
  const coach = [];
  for (const dq of fit.reasons) coach.push({ severity: 'dealbreaker', text: `${cap1(dq.reason)} — team with a qualified prime or release it; do not bid as prime.` });
  for (const g of fit.gates) coach.push({ severity: 'fix', text: cap1(g) + '.' });
  if (!fit.disqualified) {
    const ratio = (k) => fit.signals[k] / MAX[k];
    const ranked = Object.keys(fit.signals).sort((a, b) => ratio(a) - ratio(b));
    // up to 2 genuinely-WEAK signals (ratio < 0.7) that have an actionable move — lowest first
    let w = 0; for (const k of ranked) { if (w >= 2) break; if (WEAK_MOVE[k] && ratio(k) < 0.7) { coach.push({ severity: WEAK_MOVE[k].sev, text: WEAK_MOVE[k].text }); w++; } }
    // up to 2 genuinely-STRONG signals (ratio ≥ 0.7) that have a move — highest first
    let s = 0; for (const k of [...ranked].reverse()) { if (s >= 2) break; if (STRONG_MOVE[k] && ratio(k) >= 0.7) { coach.push({ severity: 'strength', text: STRONG_MOVE[k] }); s++; } }
  }
  coach.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
  const seen = new Set();
  const deduped = coach.filter((c) => { if (seen.has(c.text)) return false; seen.add(c.text); return true; }).map((c) => ({ ...c, icon: ICON[c.severity] }));
  return { score: fit.score, band: fit.band, verdict: fit.verdict, disqualified: fit.disqualified, coach: deduped };
}
