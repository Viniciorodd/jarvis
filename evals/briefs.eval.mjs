// Regression suite for the curated opportunity briefs (pods/gov/briefs.mjs + the pipeline win-chance /
// strategy helpers). The operator wants a FEW quality opportunities with real detail — these pins ensure
// the ranking stays in-lane, capped, and the win-chance / strategy stay deterministic + specific.

import { winChance, pursuitStrategy, daysUntil } from '../pods/gov/pipeline.mjs';
import { pickBriefs, formatBriefs } from '../pods/gov/briefs.mjs';

const ok = (pass, detail = '') => ({ pass, detail });

export default {
  agent: 'briefs',
  cases: [
    { name: 'winChance rises with fit and is bounded 4–92', run: () =>
      ok(winChance({ fit: 5, inLane: true }) > winChance({ fit: 2, inLane: true })
        && winChance({ fit: 5, inLane: true }) <= 92
        && winChance({ fit: 0, inLane: false }) >= 4) },

    { name: 'winChance penalizes out-of-lane heavily', run: () =>
      ok(winChance({ fit: 5, inLane: false }) < winChance({ fit: 3, inLane: true }),
        `${winChance({ fit: 5, inLane: false })} vs ${winChance({ fit: 3, inLane: true })}`) },

    { name: 'pursuitStrategy is out-of-lane-aware (subcontract only)', run: () => {
      const s = pursuitStrategy({ inLane: false, setAside: 'SDVOSB' });
      return ok(/subcontractor|do not bid as prime/i.test(s), s);
    } },

    { name: 'pursuitStrategy leads with SDB status + flags a tight deadline', run: () => {
      const s = pursuitStrategy({ inLane: true, setAside: 'Total Small Business', trade: 'Janitorial', subNeeded: true, deadline: new Date(Date.now() + 3 * 864e5).toISOString() });
      return ok(/SDB|minority/i.test(s) && /THIS WEEK/i.test(s) && /sub/i.test(s), s);
    } },

    { name: 'daysUntil parses a date and returns null on garbage', run: () =>
      ok(daysUntil(new Date(Date.now() + 5 * 864e5).toISOString()) >= 4 && daysUntil('') === null && daysUntil('not-a-date') === null) },

    { name: 'pickBriefs returns only in-lane bid-worthy, capped at N, best fit first', run: () => {
      const payloads = [
        { noticeId: 'A', title: 'Janitorial Base X', score: 90, recommendation: 'bid', setAside: 'Total Small Business', deadline: new Date(Date.now() + 20 * 864e5).toISOString() },
        { noticeId: 'B', title: 'Custodial Y', score: 72, recommendation: 'bid', setAside: 'Total Small Business', deadline: new Date(Date.now() + 20 * 864e5).toISOString() },
        { noticeId: 'C', title: 'Grounds Z (SDVOSB)', score: 95, recommendation: 'bid', setAside: 'SDVOSB Set Aside' },
        { noticeId: 'D', title: 'Low fit', score: 20, recommendation: 'no-bid', setAside: 'Total Small Business' },
      ];
      const briefs = pickBriefs(payloads, 2);
      return ok(briefs.length === 2 && briefs[0].noticeId === 'A' && !briefs.some((b) => b.noticeId === 'C') && !briefs.some((b) => b.noticeId === 'D')
        && briefs[0].winChance > 0 && typeof briefs[0].strategy === 'string' && briefs[0].strategy.length > 20,
        JSON.stringify(briefs.map((b) => b.noticeId)));
    } },

    { name: 'pickBriefs drops opportunities whose deadline has passed', run: () => {
      const briefs = pickBriefs([{ noticeId: 'P', title: 'Past due', score: 90, recommendation: 'bid', setAside: 'Total Small Business', deadline: new Date(Date.now() - 5 * 864e5).toISOString() }], 3);
      return ok(briefs.length === 0, JSON.stringify(briefs));
    } },

    { name: 'formatBriefs renders detail + a calm empty state', run: () => {
      const empty = formatBriefs([]);
      const one = formatBriefs([{ title: 'Janitorial X', agency: 'Army', place: 'PA', deadline: '2026-07-20', daysLeft: 12, lookingFor: 'Custodial services', score: 82, fit: 4, winChance: 70, strategy: 'Lead with SDB.', url: 'https://sam.gov/x' }]);
      return ok(/keep watching/i.test(empty) && /Win chance ~70%/.test(one) && /Strategy:/.test(one) && /What they want:/.test(one), one.slice(0, 60));
    } },
  ],
};
