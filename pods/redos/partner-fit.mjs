// partner-fit.mjs — the REDOS Partner Fit Index. Pure, deterministic, eval-pinned.
// Same shape as pods/gov/bid-fit.mjs: hard disqualifiers first, then a weighted 0-100 score.
//
// The weights are not a guess. They come from the 2026-08-05 reverification of the ten-target
// affiliate list, where exactly one attribute separated the real prospects from the plausible ones:
//
//   DOES THIS PERSON ALREADY TAKE COMMISSION ON SOMEONE ELSE'S TOOL?
//
// Three did. All three are the strongest targets, and two of them promote a direct competitor,
// which is a buying signal rather than an obstacle: it proves the category converts for their
// audience and hands you a rate to beat.
//
// Audience size is weighted LOW on purpose. Two of the three best targets have no verifiable
// audience number at all, and the old list's ranking by follower count put a man with a dark
// podcast and the opposite affiliate posture at number one. Mint reached the same conclusion from
// the other direction: they chased Suze Orman and Robert Kiyosaki, failed, and won with mid-level
// names under 40,000 followers.
//
// Fit is a SORT ORDER for the operator. It never authorises a send — that is policy.mjs alone.

export const MAX_SCORE = 100;

/** Any one of these → NOT-A-FIT, score 0. */
export function disqualifiers(t = {}) {
  const dq = [];
  const days = daysSince(t.lastContentAt);
  if (days != null && days > 120) dq.push({ code: 'dark', reason: `no dated content in ${days} days` });
  if (t.dark === true) dq.push({ code: 'dark', reason: 'marked dark: no verifiable recent activity' });
  if (!t.contactRoute) dq.push({ code: 'no-route', reason: 'no confirmed way to reach them' });
  if (t.buildsCompetitor === true) dq.push({ code: 'builds-competitor', reason: 'is building a competing analyser; a paid competitor is a losing pitch' });
  return dq;
}

const SIG = {
  // 35 — the whole finding. Already monetises someone else's tool for commission.
  affiliateBehaviour(t) {
    if (t.affiliateBehaviour === 'promotes-competitor') return 35;   // best: proven category + a rate to beat
    if (t.affiliateBehaviour === 'promotes-other-tools') return 30;
    if (t.affiliateBehaviour === 'runs-own-program') return 12;      // merchant, not promoter. Different ask.
    if (t.affiliateBehaviour === 'none') return 4;
    return 6;                                                        // unknown: neutral middle, never a max
  },
  // 20 — publishing now, on a cadence, verifiably.
  activity(t) {
    const d = daysSince(t.lastContentAt);
    if (d == null) return 6;
    if (d <= 7) return 20;
    if (d <= 30) return 15;
    if (d <= 60) return 8;
    return 2;
  },
  // 15 — do they ship something that competes head-on?
  conflict(t) {
    if (t.conflict === 'none') return 15;
    if (t.conflict === 'adjacent') return 10;      // comps, leads, data: feeds an analysis, is not one
    if (t.conflict === 'bundled') return 5;        // a calculator inside their paid program
    if (t.conflict === 'direct') return 1;
    return 7;
  },
  // 15 — a route that reaches a human, ranked by how reliably it gets read.
  reachability(t) {
    const r = String(t.contactRoute || '').toLowerCase();
    if (/dm|skool|direct email|personal email/.test(r)) return 15;
    if (/email/.test(r)) return 12;
    if (/form/.test(r)) return 7;
    return 4;
  },
  // 10 — Mint's rule: mid-level beats top-tier. Big names do not answer, tiny ones cannot move volume.
  audienceBand(t) {
    const a = Number(t.audience);
    if (!Number.isFinite(a)) return 6;             // unverifiable is NOT a penalty; two best targets are
    if (a < 2000) return 3;
    if (a <= 40000) return 10;                     // the Mint band
    if (a <= 200000) return 7;
    return 4;
  },
  // 5 — is the pitch a known shape, or does it need inventing?
  askClarity(t) {
    if (t.ask === 'affiliate') return 5;
    if (t.ask === 'guest-slot') return 3;
    return 2;
  },
};

const MAXES = { affiliateBehaviour: 35, activity: 20, conflict: 15, reachability: 15, audienceBand: 10, askClarity: 5 };
const LABELS = {
  affiliateBehaviour: 'already takes commission', activity: 'publishing now', conflict: 'competing product',
  reachability: 'contact route', audienceBand: 'audience band', askClarity: 'ask is a known shape',
};

// Thresholds calibrated against the 2026-08-05 hand ranking: they must reproduce the outreach
// pack's Tier A (Dan Lane, Coach Carson, Collecting Keys) as SEND and nothing else. The eval pins
// this, so moving a weight without moving a threshold gets caught.
export function band(score) {
  if (score >= 70) return { band: 'SEND', note: 'send this week' };
  if (score >= 52) return { band: 'QUEUE', note: 'send after the top tier' };
  if (score >= 35) return { band: 'THIN', note: 'only once the pipeline is dry' };
  return { band: 'HOLD', note: 'do not spend a send on this' };
}

/**
 * PURE. Returns { score, band, note, disqualified, reasons, signals, strongest, weakest, line }.
 */
export function partnerFit(t = {}) {
  const dq = disqualifiers(t);
  if (dq.length) {
    return { score: 0, ...band(0), disqualified: true, reasons: dq, signals: {}, strongest: [], weakest: [],
      line: `FIT 0/100 HOLD — ${dq.map((d) => d.reason).join('; ')}` };
  }

  const signals = {};
  let score = 0;
  for (const [k, fn] of Object.entries(SIG)) { const v = fn(t); signals[k] = v; score += v; }
  score = Math.min(MAX_SCORE, Math.round(score));

  const ranked = Object.entries(signals).sort((a, b) => (b[1] / MAXES[b[0]]) - (a[1] / MAXES[a[0]]));
  const strongest = ranked.slice(0, 2).map(([k]) => LABELS[k]);
  const weakest = ranked.slice(-2).map(([k]) => LABELS[k]);
  const b = band(score);

  return { score, ...b, disqualified: false, reasons: [], signals, strongest, weakest,
    line: `FIT ${score}/100 ${b.band} — ${b.note}. Strongest: ${strongest.join(', ')}. Weakest: ${weakest.join(', ')}.` };
}

/** Sort a target list best-first. Ties break on name so the order is stable across runs. */
export function rankTargets(targets = []) {
  return targets
    .map((t) => ({ ...t, fit: partnerFit(t) }))
    .sort((a, b) => b.fit.score - a.fit.score || String(a.name).localeCompare(String(b.name)));
}

function daysSince(iso, now = Date.now()) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.floor((now - t) / 86400000);
}
