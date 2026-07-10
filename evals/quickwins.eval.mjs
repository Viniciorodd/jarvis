// Regression suite for the wide-net "quick wins" scout classifier (pods/gov/quickwins.mjs).
// Pins that it catches in-lane one-offs, screens out the traps, and respects the certs Rodgate lacks.

import { classifyQuickWin, QUICKWIN_NAICS } from '../pods/gov/quickwins.mjs';

const ok = (pass, detail = '') => ({ pass, detail });

export default {
  agent: 'gov-quickwins',
  cases: [
    { name: 'a one-time janitorial deep clean is a quick win', run: () => {
      const c = classifyQuickWin({ title: 'One-time deep cleaning of admin building', naicsCode: '561720', typeOfSetAside: 'SBA', type: 'o' });
      return ok(c.ok && c.oneTime && c.score >= 6, JSON.stringify(c));
    } },
    { name: 'a chimney/gutter one-off matches by keyword even off-NAICS', run: () => {
      const c = classifyQuickWin({ title: 'Chimney sweep and gutter cleaning services', naicsCode: '999999', type: 'o' });
      return ok(c.ok && /keyword/.test(c.why), JSON.stringify(c));
    } },
    { name: 'base-ops / O&M is a trap → rejected', run: () =>
      ok(!classifyQuickWin({ title: 'Base Operations Support Services (BOS)', naicsCode: '561210', type: 'o' }).ok
        && !classifyQuickWin({ title: 'Operations and Maintenance of facilities', naicsCode: '561210', type: 'o' }).ok) },
    { name: '8(a)-only set-aside → rejected (not certified)', run: () =>
      ok(!classifyQuickWin({ title: 'Custodial services', naicsCode: '561720', typeOfSetAside: '8A', type: 'o' }).ok) },
    { name: 'out-of-lane (IT/software) → rejected', run: () =>
      ok(!classifyQuickWin({ title: 'Enterprise software development', naicsCode: '541511', type: 'o' }).ok) },
    { name: 'WOSB real bid rejected, but WOSB sources-sought allowed', run: () => {
      const bid = classifyQuickWin({ title: 'Grounds maintenance', naicsCode: '561730', typeOfSetAside: 'WOSB', type: 'o' });
      const ss = classifyQuickWin({ title: 'Grounds maintenance', naicsCode: '561730', typeOfSetAside: 'WOSB', type: 'r' });
      return ok(!bid.ok && ss.ok && ss.sourcesSought, JSON.stringify({ bid: bid.ok, ss: ss.ok }));
    } },
    { name: 'sources-sought flagged as a free relationship', run: () => {
      const c = classifyQuickWin({ title: 'Sources sought: window washing', naicsCode: '561790', type: 'r' });
      return ok(c.ok && c.sourcesSought && /free relationship/.test(c.why), JSON.stringify(c));
    } },
    { name: 'the wide NAICS net includes adjacent trades the primary scout omits', run: () =>
      ok(QUICKWIN_NAICS.includes('561740') && QUICKWIN_NAICS.includes('562119') && QUICKWIN_NAICS.includes('238320') && QUICKWIN_NAICS.length > 8) },
  ],
};
