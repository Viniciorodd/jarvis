// Regression suite for matrix-grounded drafting (pods/gov/grounding.mjs). Pins the DETERMINISTIC prompt
// assembly the proposal draft is built on: every requirement is listed (gaps first), the library sections are
// included, and — the doctrine line (L-006) — a needsReview stub is NEVER cited and an empty past-performance
// set produces an explicit "do NOT fabricate" instruction, so a bid can't be handed an invented citation.

import { groundingBlock } from '../pods/gov/grounding.mjs';

const ok = (pass, detail = '') => ({ pass, detail });

const MATRIX = [
  { id: 'R1', section: 'C', status: 'addressed', requirement: 'The contractor shall provide daily janitorial services.' },
  { id: 'R2', section: 'C', status: 'gap', requirement: 'The contractor shall maintain $1,000,000 general liability insurance.' },
  { id: 'R3', section: 'form', status: 'gap', requirement: 'Submit a completed SF1449.' },
  { id: 'R4', section: 'L', status: 'gap', requirement: 'Offerors shall submit a technical volume not to exceed 10 pages.' },
];
const SNIPPETS = [{ key: 'quality-control-plan', title: 'Quality Control Plan', body: 'Rodgate operates a three-tier QC plan.' }];

export default {
  agent: 'gov-grounding',
  cases: [
    { name: 'lists every matrix requirement, grouped, with GAP marked', run: () => {
      const b = groundingBlock({ matrixRows: MATRIX });
      const all = ['R1', 'R2', 'R3', 'R4'].every((id) => b.includes(id));
      return ok(all && /R2.*GAP/.test(b) && /Required forms/.test(b) && /Submission instructions/.test(b), b.slice(0, 120));
    } },

    { name: 'within a section, GAP requirements come before addressed ones', run: () => {
      const b = groundingBlock({ matrixRows: MATRIX });
      return ok(b.indexOf('R2') < b.indexOf('R1'), `R2@${b.indexOf('R2')} R1@${b.indexOf('R1')}`); // both Section C; R2 is the gap
    } },

    { name: 'includes each provided library snippet (title + body)', run: () => {
      const b = groundingBlock({ matrixRows: MATRIX, snippets: SNIPPETS });
      return ok(b.includes('Quality Control Plan') && b.includes('three-tier QC plan'), 'snippet missing');
    } },

    { name: 'cites a REAL past-performance record', run: () => {
      const b = groundingBlock({ pastPerformance: [{ title: 'Custodial — Fort X', agency: 'Army', periodEnd: '2025-09-30' }] });
      return ok(b.includes('Custodial — Fort X') && b.includes('Army') && /cite ONLY these real records/i.test(b), b.slice(-160));
    } },

    { name: 'FILTERS a needsReview stub — never cited as a real record', run: () => {
      const b = groundingBlock({ pastPerformance: [{ title: 'Awarded contract', needsReview: true }] });
      return ok(!b.includes('Awarded contract') && /do NOT fabricate/i.test(b), 'stub leaked into citations');
    } },

    { name: 'EMPTY past-performance → explicit no-fabrication instruction (never a blank/invented citation)', run: () => {
      const b = groundingBlock({ matrixRows: MATRIX });
      return ok(/No past-performance records on file — do NOT fabricate/i.test(b));
    } },

    { name: 'never throws on empty input; still returns the no-fabrication scaffolding', run: () => {
      const b = groundingBlock({});
      return ok(typeof b === 'string' && /do NOT fabricate/i.test(b), b.slice(0, 80));
    } },
  ],
};
