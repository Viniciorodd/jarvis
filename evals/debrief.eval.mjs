// Regression suite for the post-loss debrief core (pods/gov/debrief.mjs, WS6 #5).
// Pins: only genuinely-lost bids are selected (won/passed/none excluded, dedup honored); the draft is a
// professional CO debrief request; and the rendered file passes the executor's OWN sendability parser —
// so a debrief with a known CO email is sendable, and one WITHOUT an email is unsendable (never a blank
// gate). No auto-send is exercised anywhere.

import { lostBidsNeedingDebrief, buildDebriefDraft, renderDebriefFile } from '../pods/gov/debrief.mjs';
import { parseEmailFile } from '../pods/gov/sender.mjs';

const ok = (pass, detail = '') => ({ pass, detail });
const opps = [
  { noticeId: 'n-lost', title: 'Janitorial — Bldg 3', agency: 'USACE' },
  { noticeId: 'n-won', title: 'Grounds — Depot' },
  { noticeId: 'n-pass', title: 'BOS — Base X' },
  { noticeId: 'n-open', title: 'Custodial — Annex' },
  { noticeId: 'n-lost2', title: 'Pest — Warehouse' },
];
const dispositions = { 'n-lost': 'lost', 'n-won': 'won', 'n-pass': 'passed', 'n-lost2': 'lost' };
const CO = { email: 'jane.co@usace.army.mil', name: 'Ms. Jane Carter' };

export default {
  agent: 'gov-debrief',
  cases: [
    { name: 'selects only lost bids (excludes won / passed / no-disposition)',
      run: () => { const r = lostBidsNeedingDebrief({ opportunities: opps, dispositions, debriefed: new Set() }); return ok(r.length === 2 && r.every((o) => /lost/.test(o.noticeId)), r.map((o) => o.noticeId).join(',')); } },
    { name: 'dedup: an already-debriefed lost bid is skipped',
      run: () => { const r = lostBidsNeedingDebrief({ opportunities: opps, dispositions, debriefed: new Set(['n-lost']) }); return ok(r.length === 1 && r[0].noticeId === 'n-lost2', r.map((o) => o.noticeId).join(',')); } },
    { name: 'empty dispositions → nothing to debrief',
      run: () => ok(lostBidsNeedingDebrief({ opportunities: opps, dispositions: {}, debriefed: new Set() }).length === 0) },
    { name: 'draft has CO email as To, a debrief Subject, and a professional body',
      run: () => { const d = buildDebriefDraft(opps[0], CO); return ok(d.to === CO.email && /Debrief request/.test(d.subject) && /n-lost/.test(d.subject) && /Jane Carter/.test(d.body) && /Rodgate LLC/.test(d.body), d.subject); } },
    { name: 'no CO email → To is blank (draft is intentionally unsendable, never a blank gate)',
      run: () => { const d = buildDebriefDraft(opps[0], {}); return ok(d.to === '' && /Contracting Officer/.test(d.body)); } },
    { name: 'rendered file with a CO email PARSES as sendable via the executor parser',
      run: () => { const p = parseEmailFile(renderDebriefFile(buildDebriefDraft(opps[0], CO))); return ok(p.ok && p.to === CO.email && /Debrief/.test(p.subject), p.reason || p.to); } },
    { name: 'rendered file WITHOUT a CO email is UNSENDABLE by the same parser',
      run: () => { const p = parseEmailFile(renderDebriefFile(buildDebriefDraft(opps[0], {}))); return ok(!p.ok, 'expected unsendable'); } },
    { name: 'debrief request never asserts a win/relationship — losses stay honest',
      run: () => { const d = buildDebriefDraft(opps[0], CO); return ok(/award has been made to another offeror/.test(d.body) && !/we won|congratulations/i.test(d.body)); } },
  ],
};
