// Regression suite for the GovCon capture & learning desk (pods/gov/capture.mjs) — pins the elite-tier
// procedures: bid/no-bid selectivity (ladder traps → NO_BID, in-lane sources sought → RESPOND_SS),
// the debrief request (FAR cite, gracious tone, NEVER a cert we don't hold), the win/loss ledger
// roundtrip (temp dirs only), lessons math, and the relationship cadence.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bidScore, debriefRequestEmail, recordOutcome, readOutcomes, lessonsSummary, relationshipsDue } from '../pods/gov/capture.mjs';

const ok = (pass, detail = '') => ({ pass, detail });

export default {
  agent: 'gov-capture',
  cases: [
    { name: 'in-lane sources sought → always RESPOND_SS (even a big one — responding is free)', run: () => {
      const a = bidScore({ fit: 4, isSourcesSought: true, setAside: 'Total Small Business', state: 'PA', valueUsd: 120000 });
      const b = bidScore({ fit: 5, isSourcesSought: true, valueUsd: 900000, state: 'NJ' }); // over the bid ceiling, still respond
      return ok(a.verdict === 'RESPOND_SS' && b.verdict === 'RESPOND_SS'
        && a.reasons.some((r) => /sources sought/i.test(r)), JSON.stringify({ a: a.verdict, b: b.verdict }));
    } },
    { name: '8(a) set-aside → NO_BID (cert we do not hold), plain-English reason', run: () => {
      const r = bidScore({ fit: 5, setAside: '8(a) Set-Aside', state: 'PA', valueUsd: 100000, deadlineDays: 20 });
      return ok(r.verdict === 'NO_BID' && r.reasons.some((x) => /8\(a\)/.test(x) && /don't hold|self-certified/i.test(x)), r.reasons[0]);
    } },
    { name: 'value above the ~$250k ceiling → NO_BID', run: () => {
      const r = bidScore({ fit: 5, setAside: 'Total Small Business', state: 'PA', valueUsd: 400000, deadlineDays: 30 });
      return ok(r.verdict === 'NO_BID' && r.reasons.some((x) => /250k/.test(x)), r.reasons[0]);
    } },
    { name: 'deadline under 3 days with no draft → NO_BID; with a draft started it can still BID', run: () => {
      const base = { fit: 5, setAside: 'Total Small Business', state: 'PA', valueUsd: 90000, incumbentKnown: false };
      const rushed = bidScore({ ...base, deadlineDays: 2 });
      const drafted = bidScore({ ...base, deadlineDays: 2, hasDraft: true });
      return ok(rushed.verdict === 'NO_BID' && drafted.verdict === 'BID', JSON.stringify({ rushed: rushed.verdict, drafted: drafted.verdict }));
    } },
    { name: 'strong in-lane small-biz near home → BID with a high score; weak far full-and-open → NO_BID', run: () => {
      const strong = bidScore({ fit: 5, setAside: 'Total Small Business', state: 'PA', valueUsd: 90000, deadlineDays: 21, incumbentKnown: false });
      const weak = bidScore({ fit: 2, setAside: '', state: 'TX', valueUsd: 200000, deadlineDays: 10, incumbentKnown: true });
      return ok(strong.verdict === 'BID' && strong.score >= 60 && weak.verdict === 'NO_BID' && weak.score < 60,
        JSON.stringify({ strong: strong.score, weak: weak.score }));
    } },
    { name: 'debrief email: FAR cite + gracious tone + NEVER claims a cert we lack', run: () => {
      const { subject, body } = debriefRequestEmail({
        opp: { title: 'Janitorial Services — VA Outpatient Clinic', noticeId: 'ABC123', agency: 'Department of Veterans Affairs', contactName: 'Jane Smith' },
        result: 'lost',
      });
      const certClaim = /8\s*\(\s*a\s*\)|\b8a\b|8-a|HUBZone|SDVOSB|VOSB|WOSB|EDWOSB/i;
      return ok(/FAR 15\.506/.test(body) && !certClaim.test(body)
        && /thank you/i.test(body) && /grateful/i.test(body) && /improve/i.test(body)
        && /technical/.test(body) && /pricing/.test(body) && /future/i.test(body)
        && subject.includes('ABC123') && body.includes('Rodgate, LLC'), body.slice(0, 140));
    } },
    { name: 'recordOutcome/readOutcomes roundtrip (temp dir) + computed price gap + bad result rejected', run: () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gov-capture-'));
      try {
        const r1 = recordOutcome({ noticeId: 'N1', title: 'T1', agency: 'GSA', result: 'lost', ourPriceCents: 12_000_000, winnerPriceCents: 10_000_000, lessons: ['priced too high'], debriefRequested: true }, { dir });
        const r2 = recordOutcome({ noticeId: 'N2', title: 'T2', agency: 'GSA', result: 'won' }, { dir });
        const bad = recordOutcome({ noticeId: 'N3', result: 'maybe' }, { dir });
        const all = readOutcomes({ dir });
        return ok(r1.ok && r2.ok && !bad.ok && all.length === 2
          && all[0].noticeId === 'N1' && all[0].priceGapPct === 20 && all[0].debriefRequested === true
          && all[1].result === 'won', JSON.stringify({ n: all.length, gap: all[0] && all[0].priceGapPct }));
      } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    } },
    { name: 'lessonsSummary math: winRate, byAgency, loss-reason ordering, debriefRate, price gap avg', run: () => {
      const s = lessonsSummary([
        { agency: 'GSA', result: 'won' },
        { agency: 'GSA', result: 'lost', lessons: ['price too high', 'no past performance'], debriefRequested: true, priceGapPct: 20 },
        { agency: 'VA', result: 'lost', lessons: ['price too high'], debriefRequested: false, priceGapPct: 10 },
        { agency: 'VA', result: 'no_award' },
      ]);
      return ok(s.total === 4 && s.wins === 1 && s.losses === 2 && s.winRatePct === 33
        && s.byAgency.GSA.bids === 2 && s.byAgency.GSA.wins === 1 && s.byAgency.VA.bids === 2 && s.byAgency.VA.wins === 0
        && s.topLossReasons[0].reason === 'price too high' && s.topLossReasons[0].count === 2
        && s.debriefRate === 0.5 && s.priceGapAvgPct === 15, JSON.stringify(s));
    } },
    { name: 'relationshipsDue: default cadence by role, override respected, stalest first, suggestions present', run: () => {
      const due = relationshipsDue([
        { name: 'CO Alice', org: 'USACE', role: 'co', lastTouched: '2026-06-01' },                    // 41d ≥ 30 → due
        { name: 'Mentor Bob', org: 'APEX', role: 'mentor', lastTouched: '2026-06-01' },               // 41d < 90 → not due
        { name: 'Prime Carol', org: 'BigFacilities', role: 'prime', lastTouched: '2026-03-01' },      // 133d → stalest
        { name: 'Sub Dan', org: 'CrewCo', role: 'sub', lastTouched: '2026-07-01', cadenceDays: 5 },   // 11d ≥ 5 override → due
      ], '2026-07-12T00:00:00Z');
      const alice = due.find((d) => d.name === 'CO Alice');
      return ok(due.length === 3 && due[0].name === 'Prime Carol' && due[2].name === 'Sub Dan'
        && !due.find((d) => d.name === 'Mentor Bob')
        && alice && alice.cadenceDays === 30 && alice.staleDays === 41 && alice.overdueDays === 11
        && due.every((d) => d.suggestion && d.suggestion.length > 10),
        JSON.stringify(due.map((d) => [d.name, d.staleDays])));
    } },
  ],
};
