// Regression suite for bid-winner research (pods/gov/bid-winners.mjs).
// Pins: recipient aggregation (case/space-insensitive), win+dollar ranking, share math, and the
// concentration read (incumbent-heavy vs wide-open). Pure — operates on the award sample price-to-win
// already fetches, so no network in the test.

import { topWinners, winnerSummary } from '../pods/gov/bid-winners.mjs';

const ok = (pass, detail = '') => ({ pass, detail });
const awards = [
  { recipient: 'Acme Facilities', amount: 100000, date: '2025-01-01' },
  { recipient: 'ACME  Facilities', amount: 200000, date: '2025-06-01' }, // same firm, different case/spacing
  { recipient: 'Acme Facilities', amount: 150000, date: '2024-03-01' },
  { recipient: 'Beta Cleaning', amount: 90000, date: '2025-02-01' },
  { recipient: 'Gamma Grounds', amount: 50000, date: '2025-03-01' },
  { recipient: '', amount: 999, date: '2025-01-01' },   // no recipient → ignored
  { recipient: 'Delta', amount: 0, date: '2025-01-01' }, // zero amount → ignored
];

export default {
  agent: 'gov-bid-winners',
  cases: [
    { name: 'aggregates recipients case/space-insensitively (Acme counted 3×)',
      run: () => { const a = topWinners(awards); const acme = a.winners.find((w) => /acme/i.test(w.recipient)); return ok(acme && acme.wins === 3 && acme.total === 450000, JSON.stringify(acme)); } },
    { name: 'drops awards with no recipient or non-positive amount',
      run: () => { const a = topWinners(awards); return ok(a.totalAwards === 5 && a.uniqueWinners === 3, `n=${a.totalAwards} u=${a.uniqueWinners}`); } },
    { name: 'ranks by wins then dollars — Acme first',
      run: () => { const a = topWinners(awards); return ok(a.winners[0].recipient.match(/Acme/i) && a.winners[0].wins === 3, a.winners.map((w) => w.recipient).join(',')); } },
    { name: 'win + dollar share math (Acme 3/5 = 60% wins)',
      run: () => { const a = topWinners(awards); const acme = a.winners[0]; return ok(acme.winSharePct === 60 && acme.avg === 150000, JSON.stringify({ s: acme.winSharePct, avg: acme.avg })); } },
    { name: 'keeps the latest award date per winner',
      run: () => { const a = topWinners(awards); return ok(a.winners[0].lastDate === '2025-06-01', a.winners[0].lastDate); } },
    { name: 'summary flags an incumbent-heavy lane (top ≥40% share)',
      run: () => { const s = winnerSummary(topWinners(awards)); return ok(s.level === 'concentrated' && /Incumbent-heavy/.test(s.text), s.text); } },
    { name: 'summary reads a fragmented lane as wide open',
      run: () => { const many = Array.from({ length: 8 }, (_, i) => ({ recipient: 'Firm ' + i, amount: 10000 + i, date: '2025-01-0' + (i + 1) })); const s = winnerSummary(topWinners(many)); return ok(s.level === 'fragmented' && /Wide open/.test(s.text), s.text); } },
    { name: 'empty awards → honest "no incumbent signal"',
      run: () => ok(winnerSummary(topWinners([])).level === 'none') },
  ],
};
