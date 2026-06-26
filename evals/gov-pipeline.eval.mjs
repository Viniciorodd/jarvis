// Regression suite for the Gov Pipeline board (pods/gov/pipeline.mjs). Pins the deterministic stage,
// fit-score, lane-eligibility and "whose move" logic the operator relies on to know where things stand.

import {
  fitScore, inLane, shortSetAside, shortAgency, inferTrade, deriveStage, nextAction, buildBoard,
} from '../pods/gov/pipeline.mjs';

const ok = (pass, detail = '') => ({ pass, detail });

export default {
  agent: 'gov-pipeline',
  cases: [
    { name: 'fitScore maps 0–100 → 1–5 by threshold', run: () =>
      ok(fitScore(90) === 5 && fitScore(78) === 4 && fitScore(62) === 3 && fitScore(50) === 2 && fitScore(20) === 1) },

    { name: 'inLane: SDB can prime small-business/unrestricted, NOT 8(a)/SDVOSB/WOSB/HUBZone', run: () =>
      ok(inLane('Total Small Business Set-Aside (FAR 19.5)') === true
        && inLane('') === true
        && inLane('Service-Disabled Veteran-Owned Small Business Set Aside') === false
        && inLane('8(a) Set-Aside') === false
        && inLane('HUBZone Set-Aside') === false
        && inLane('Women-Owned Small Business') === false) },

    { name: 'shortSetAside abbreviates the noisy SAM strings', run: () =>
      ok(shortSetAside('Total Small Business Set-Aside (FAR 19.5)') === 'Small Business'
        && shortSetAside('Service-Disabled Veteran-Owned Small Business Set Aside') === 'SDVOSB'
        && shortSetAside('') === 'Unrestricted') },

    { name: 'shortAgency tidies "X, DEPARTMENT OF"', run: () => {
      const a = shortAgency('TRANSPORTATION, DEPARTMENT OF');
      return ok(a === 'Dept of Transportation', a);
    } },

    { name: 'inferTrade guesses trade + NAICS from the title', run: () =>
      ok(inferTrade('MIA District Consolidated Janitorial Services').naics === '561720'
        && inferTrade('New Park Grounds Maintenance').naics === '561730'
        && inferTrade('Base Operations Support (BOS) Services').naics === '561210') },

    { name: 'deriveStage walks Found→Reviewing→Responding→Submitted→Closed', run: () =>
      ok(deriveStage({ recommendation: 'watch' }, {}) === 'found'
        && deriveStage({ recommendation: 'bid' }, {}) === 'reviewing'
        && deriveStage({ recommendation: 'bid' }, { hasProposal: true, hasPendingSubmit: true }) === 'responding'
        && deriveStage({ recommendation: 'bid' }, { hasProposal: true, hasPendingSubmit: false }) === 'submitted'
        && deriveStage({ recommendation: 'bid' }, { disposition: 'won' }) === 'closed') },

    { name: 'nextAction: drafted proposal awaiting a gate = YOUR move', run: () => {
      const a = nextAction({ setAside: 'Total Small Business' }, 'responding', { hasPendingSubmit: true });
      return ok(a.who === 'you' && /sign/i.test(a.text), JSON.stringify(a));
    } },
    { name: 'nextAction: out-of-lane reviewing = Jarvis (subcontract only), not your move', run: () => {
      const a = nextAction({ setAside: 'SDVOSB Set Aside' }, 'reviewing', {});
      return ok(a.who === 'jarvis' && /lane|subcontract/i.test(a.text), JSON.stringify(a));
    } },

    { name: 'buildBoard places cards + derives YOUR single next action', run: () => {
      const board = buildBoard({
        opportunities: [
          { noticeId: 'A', title: 'Janitorial Services Base X', score: 82, recommendation: 'bid', setAside: 'Total Small Business', agency: 'ARMY, DEPARTMENT OF', proposalFile: 'gov-drafts/a.md' },
          { noticeId: 'B', title: 'Custodial Y', score: 50, recommendation: 'watch', setAside: 'Total Small Business' },
          { noticeId: 'C', title: 'Grounds Z', score: 75, recommendation: 'bid', setAside: 'SDVOSB Set Aside' },
        ],
        approvals: [{ pod: 'gov', action: 'submit', noticeId: 'A', file: 'gov-drafts/a.md' }],
      });
      const respond = board.columns.find((c) => c.key === 'responding').cards;
      return ok(board.total === 3
        && respond.length === 1 && respond[0].noticeId === 'A'
        && board.counts.found === 1 && board.counts.reviewing === 1
        && board.yourNextAction && board.yourNextAction.noticeId === 'A'
        && board.columns.find((c) => c.key === 'reviewing').cards[0].inLane === false,
        JSON.stringify(board.counts) + ' | next=' + (board.yourNextAction && board.yourNextAction.noticeId));
    } },

    { name: 'buildBoard never picks an out-of-lane card as YOUR next action', run: () => {
      const board = buildBoard({ opportunities: [
        { noticeId: 'C', title: 'Grounds Z', score: 95, recommendation: 'bid', setAside: 'SDVOSB Set Aside' },
      ] });
      return ok(board.yourNextAction === null, JSON.stringify(board.yourNextAction));
    } },
  ],
};
