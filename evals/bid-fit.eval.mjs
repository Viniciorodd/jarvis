// Regression suite for the Rodgate Bid Fit Index (pods/gov/bid-fit.mjs).
// The PRD's own acceptance test (§4.7): score six real opportunities and require the index to REPRODUCE
// what we already learned the hard way. If a backtest disagrees with reality, the weights are wrong — the
// fixtures here use the facts the PRD documents for each opportunity.

import { bidFit, disqualifiers, band, CORE_NAICS, VALUE_CAP } from '../pods/gov/bid-fit.mjs';

const ok = (pass, detail = '') => ({ pass, detail });

// Fixtures built from the PRD's documented facts for each opportunity.
const SCTA = { title: 'SCTA Bus Shelter REBID', naics: '561720', docTakers: 8, driveHours: 0.5, recurring: '3-year', evaluation: 'best-value', portal: 'open' };
const ERIE = { title: 'Erie Janitorial 6562-26', naics: '561720', docTakers: 45, nationalsPresent: true, driveHours: 4.5, evaluation: 'ifb', portal: 'pennbid', bondRequired: true };
const USACE = { title: 'USACE W912DR26QA051', naics: '561720', portal: 'PIEE login', evaluation: 'best-value', docTakers: 6, driveHours: 2 };
const DELCO = { title: 'Delaware County eDPW-081926', naics: '561720', mandatoryPreBidMissed: true };
const CTRL = { title: 'Control Towers (JBMDL)', naics: '561720', setAside: 'total small business set-aside', docTakers: 6, driveHours: 2, recurring: 'option years', value: 80000, evaluation: 'best-value', portal: 'PIEE' };
const SALEM = { title: 'Salem VA', naics: '561720', setAside: 'SDB set-aside', driveHours: 6, recurring: 'option years' };

export default {
  agent: 'gov-bid-fit',
  cases: [
    // ── structure ──
    { name: 'band thresholds: 80+→PURSUE, 60+→REVIEW, 40+→THIN, <40→NO-BID',
      run: () => ok(band(84).band === 'PURSUE' && band(60).band === 'REVIEW' && band(44).band === 'THIN' && band(12).band === 'NO-BID') },
    { name: 'DQ: outside-lane NAICS auto-disqualifies',
      run: () => { const d = disqualifiers({ naics: '236220' }); return ok(d.some((x) => x.code === 'naics'), JSON.stringify(d)); } },
    { name: 'DQ: a forbidden set-aside (8a/HUBZone/SDVOSB/WOSB) auto-disqualifies (L-005)',
      run: () => ok(disqualifiers({ setAside: 'HUBZone set-aside' }).some((x) => x.code === 'set-aside') && disqualifiers({ setAside: '8(a)' }).length > 0) },
    { name: 'DQ: value over the $150k cap auto-disqualifies',
      run: () => ok(disqualifiers({ value: 180000 }).some((x) => x.code === 'value-cap')) },
    { name: 'output line carries score, verdict, strongest/weakest + next action',
      run: () => { const r = bidFit(SCTA); return ok(/BID FIT: \d+\/100/.test(r.line) && /Strongest:/.test(r.line) && /Next action:/.test(r.line), r.line); } },

    // ── the six backtests (PRD §4.7) ──
    { name: 'BACKTEST SCTA Bus Shelter REBID → ≥80 / PURSUE',
      run: () => { const r = bidFit(SCTA); return ok(r.score >= 80 && r.band === 'PURSUE', `score=${r.score} band=${r.band}`); } },
    { name: 'BACKTEST Erie Janitorial 6562-26 → <50 (competition/geography/IFB drag it down) + bond flagged',
      run: () => { const r = bidFit(ERIE); return ok(r.score < 50 && r.gates.some((g) => /bond/i.test(g)), `score=${r.score} gates=${JSON.stringify(r.gates)}`); } },
    { name: 'BACKTEST USACE → raises the portal-gate flag (PIEE / L-011) regardless of score',
      run: () => { const r = bidFit(USACE); return ok(r.gates.some((g) => /portal login|PIEE/i.test(g)), JSON.stringify(r.gates)); } },
    { name: 'BACKTEST Delaware County → auto NO-BID (mandatory pre-bid missed)',
      run: () => { const r = bidFit(DELCO); return ok(r.disqualified && r.score === 0 && r.band === 'NO-BID' && r.reasons.some((x) => x.code === 'pre-bid-missed'), `score=${r.score} band=${r.band}`); } },
    { name: 'BACKTEST Control Towers (JBMDL) → within ±10 of Gideon\'s 92',
      run: () => { const r = bidFit(CTRL); return ok(Math.abs(r.score - 92) <= 10, `score=${r.score} (need 82–102)`); } },
    { name: 'BACKTEST Salem VA → ≥60 (we sent it; it must not read as a mistake)',
      run: () => { const r = bidFit(SALEM); return ok(r.score >= 60, `score=${r.score} band=${r.band}`); } },

    { name: 'a NO-BID never uses shaming language (L-010) — line reads "released, next one"',
      run: () => { const r = bidFit(DELCO); return ok(!/failed|missed|should have|overdue/i.test(r.line) && /release/i.test(r.line), r.line); } },
  ],
};
