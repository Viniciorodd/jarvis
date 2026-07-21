// Regression suite for book → operations review (pods/vault/book-to-ops.mjs).
// The point: a saved highlight becomes a system-targeted "make a concrete change" card, not a dead note —
// and only actionable highlights surface (mapped to a business system, deduped across runs).

import { parseBook, mapToSystems, buildReviewCards, cardId, rankCards } from '../pods/vault/book-to-ops.mjs';

const ok = (pass, detail = '') => ({ pass, detail });
const MD = [
  '# $100M Offers: How To Make Offers',
  '',
  '*by Alex Hormozi*',
  '',
  '> 100 highlights from Apple Books.',
  '',
  '---',
  '',
  '> In order to sell anything, you need demand — channel it through your offer and pricing.',
  '> once you pick, commit to it.',
  '> Always incorporate short-term immediate wins for a client to build delivery trust.',
  '> Build a system and a checklist so the process runs without you.',
].join('\n');

export default {
  agent: 'book-to-ops',
  cases: [
    { name: 'parseBook pulls title, author, and only real highlights (drops the "N highlights" header)',
      run: () => { const b = parseBook(MD); return ok(/\$100M Offers/.test(b.title) && b.author === 'Alex Hormozi' && b.highlights.length === 4 && !b.highlights.some((h) => /highlights from apple/i.test(h)), `n=${b.highlights.length}`); } },
    { name: 'mapToSystems: an offer/pricing highlight maps to offers',
      run: () => ok(mapToSystems('channel demand through your offer and pricing').includes('offers')) },
    { name: 'mapToSystems: a system/checklist highlight maps to ops',
      run: () => ok(mapToSystems('build a system and a checklist so it runs without you').includes('ops')) },
    { name: 'mapToSystems: a generic line maps to nothing (no false nag)',
      run: () => ok(mapToSystems('once you pick, commit to it').length === 0) },
    { name: 'buildReviewCards: only actionable+long-enough highlights become cards',
      run: () => { const c = buildReviewCards(parseBook(MD)); return ok(c.length === 3 && c.every((x) => x.systems.length && x.prompt.includes('concrete change')), 'n=' + c.length); } },
    { name: 'buildReviewCards: dedupe by seenIds — an already-reviewed card does not resurface',
      run: () => { const b = parseBook(MD); const all = buildReviewCards(b); const seen = new Set([all[0].id]); const again = buildReviewCards(b, seen); return ok(again.length === all.length - 1 && !again.some((x) => x.id === all[0].id)); } },
    { name: 'cardId is stable for the same book+text',
      run: () => ok(cardId('Book', 'a highlight') === cardId('Book', 'a highlight') && cardId('Book', 'a') !== cardId('Book', 'b')) },
    { name: 'rankCards leads with the higher-leverage system (offers before ops)',
      run: () => { const ranked = rankCards(buildReviewCards(parseBook(MD))); return ok(ranked[0].systems[0] === 'offers', ranked.map((c) => c.systems[0]).join(',')); } },
  ],
};
