// Regression suite for the daily gov growth digest renderer (pods/gov/digest.mjs).
// Pins the calm one-message contract: header with the date, at most 3 items per section, 60ch titles /
// 40ch names, graceful empties + failed scans, and the closing totals + "open /quickwins or /teaming" pointer.

import { renderDigest } from '../pods/gov/digest.mjs';

const ok = (pass, detail = '') => ({ pass, detail });

const qwLead = (i) => ({ score: 9 - i, title: `Quick win number ${i}`, agency: 'GENERAL SERVICES ADMINISTRATION', due: '2026-07-20' });
const tmLead = (i) => ({ recipient: `PRIME ${i} FACILITIES LLC`, amount: 4200000, state: 'PA' });

export default {
  agent: 'gov-digest',
  cases: [
    { name: 'both engines populated → header, top titles, days-left, $XM/state, totals line', run: () => {
      const text = renderDigest({
        quickwins: { ok: true, count: 12, leads: [{ score: 8, title: 'One-time deep cleaning of administration building', agency: 'GENERAL SERVICES ADMINISTRATION', due: '2026-07-20T14:00:00-04:00' }] },
        teaming: { ok: true, count: 8, leads: [{ recipient: 'ACME FACILITIES INC', amount: 4200000, state: 'PA' }] },
        dateStr: '2026-07-12',
      });
      return ok(text.includes('Gov growth — 2026-07-12')
        && text.includes('One-time deep cleaning of administration building')
        && text.includes('8d left')
        && text.includes('ACME FACILITIES INC — $4.2M · PA')
        && text.includes('12 quick wins · 8 teaming primes — open /quickwins or /teaming to act'), text);
    } },
    { name: 'no quick wins → calm "no new quick wins today" + zero in the totals', run: () => {
      const text = renderDigest({ quickwins: { ok: true, count: 0, leads: [] }, teaming: { ok: true, count: 1, leads: [tmLead(1)] }, dateStr: '2026-07-12' });
      return ok(text.includes('no new quick wins today') && text.includes('0 quick wins · 1 teaming primes'), text);
    } },
    { name: 'teaming radar failed ({ok:false}) → section notes it, totals count it as 0', run: () => {
      const text = renderDigest({ quickwins: { ok: true, count: 1, leads: [qwLead(1)] }, teaming: { ok: false, error: 'USASpending HTTP 500' }, dateStr: '2026-07-12' });
      return ok(text.includes('radar unavailable (USASpending HTTP 500)') && text.includes('0 teaming primes'), text);
    } },
    { name: 'long titles trimmed to 60ch, names to 40ch, missing due date handled', run: () => {
      const long = 'X'.repeat(80);
      const text = renderDigest({
        quickwins: { ok: true, count: 1, leads: [{ score: 5, title: long, agency: 'A'.repeat(60), due: '' }] },
        teaming: { ok: true, count: 0, leads: [] }, dateStr: '2026-07-12',
      });
      return ok(!text.includes(long) && text.includes('X'.repeat(59) + '…')
        && !text.includes('A'.repeat(60)) && text.includes('A'.repeat(39) + '…')
        && text.includes('no due date'), text);
    } },
    { name: 'at most 3 items per section even when the scans return more', run: () => {
      const text = renderDigest({
        quickwins: { ok: true, count: 5, leads: [1, 2, 3, 4, 5].map(qwLead) },
        teaming: { ok: true, count: 5, leads: [1, 2, 3, 4, 5].map(tmLead) }, dateStr: '2026-07-12',
      });
      const numbered = (text.match(/^\d+\. /gm) || []).length;
      return ok(numbered === 6 && !text.includes('Quick win number 4') && !text.includes('PRIME 4'), `numbered=${numbered}`);
    } },
    { name: 'missing inputs entirely → both sections degrade, never throws', run: () => {
      const text = renderDigest({ dateStr: '2026-07-12' });
      return ok(text.includes('scan unavailable') && text.includes('radar unavailable')
        && text.includes('0 quick wins · 0 teaming primes'), text);
    } },
  ],
};
