// Regression suite for the Bid Brief one-pager (pods/gov/bid-brief.mjs, REDOS Port #3). Pins the PURE assembly:
// the brief carries the opportunity, the Bid Fit verdict, the Coach play, and — the doctrine line — an EMPTY
// past-performance set yields the honest "newer prime, do NOT claim experience we don't hold" note, never a
// fabricated citation; a needsReview stub is never cited.

import { renderBidBrief } from '../pods/gov/bid-brief.mjs';

const ok = (pass, detail = '') => ({ pass, detail });
const OPP = { title: 'Base Custodial Services', agency: 'ARMY', naics: '561720', setAside: 'Total Small Business', deadline: '2026-08-15', value: 90000, url: 'https://sam.gov/x' };
const FIT = { verdict: '🎯 PURSUE', score: 84, note: 'signals converge' };
const COACH = [{ icon: '⚠️', text: 'Line up a local crew now.' }, { icon: '✅', text: 'Set-aside fits you — lead with SDB status.' }];

export default {
  agent: 'gov-bid-brief',
  cases: [
    { name: 'renderBidBrief carries the opportunity facts + the Bid Fit verdict/score', run: () => {
      const md = renderBidBrief({ opp: OPP, fit: FIT });
      return ok(/Bid Brief — Base Custodial Services/.test(md) && /ARMY/.test(md) && /561720/.test(md) && /🎯 PURSUE · 84\/100/.test(md), md.slice(0, 120));
    } },

    { name: 'includes the Coach play + the compliance-matrix coverage line', run: () => {
      const md = renderBidBrief({ opp: OPP, fit: FIT, coach: COACH, matrix: { total: 40, gap: 6, coveragePct: 55 } });
      return ok(/## The play/.test(md) && /Line up a local crew/.test(md) && /55% coverage · 6 gaps/.test(md), 'missing play/matrix');
    } },

    { name: 'EMPTY past performance → honest "newer prime, do NOT claim" note (never fabricated)', run: () => {
      const md = renderBidBrief({ opp: OPP, fit: FIT, pastPerformance: [] });
      return ok(/newer prime/i.test(md) && /do NOT claim/i.test(md) && !/fort|contract #|\$\d{3},\d{3}\s·\sArmy — awarded/i.test(md), md.slice(-160));
    } },

    { name: 'a needsReview stub is NOT cited as real past performance', run: () => {
      const md = renderBidBrief({ opp: OPP, fit: FIT, pastPerformance: [{ title: 'Awarded contract', needsReview: true }] });
      return ok(!/Awarded contract/.test(md) && /newer prime/i.test(md), 'stub leaked');
    } },

    { name: 'a REAL past-performance record IS cited', run: () => {
      const md = renderBidBrief({ opp: OPP, fit: FIT, pastPerformance: [{ title: 'Custodial — Fort X', agency: 'Army', value: 120000 }] });
      return ok(/Custodial — Fort X/.test(md) && /Army/.test(md), md.slice(-160));
    } },

    { name: 'never throws on empty input; always closes with the "estimates — Vinicio signs" disclaimer', run: () => {
      const md = renderBidBrief({});
      return ok(typeof md === 'string' && /Vinicio prices and signs every bid/.test(md), md.slice(-80));
    } },
  ],
};
