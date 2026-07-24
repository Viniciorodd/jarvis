// Regression suite for the Past-Performance & Snippet Library (pods/gov/library.mjs). Pins the DETERMINISTIC
// retrieval a proposal relies on: relevance ranking (exact NAICS > trade > topic), the core-sections-always
// rule, the seed↔runtime overlay, and the doctrine line — an empty past-performance store returns [] (a bid is
// NEVER given a fabricated citation). Retrieval is pure over fixtures; loadLibrary read against the real seed.

import { matchScore, pastPerformanceFor, snippetsFor, mergeSnippets, loadLibrary } from '../pods/gov/library.mjs';

const ok = (pass, detail = '') => ({ pass, detail });
const janitorial = { title: 'Base Custodial & Janitorial Services', naics: '561720' };

const RECORDS = [
  { id: 'a', title: 'Custodial — Fort X', agency: 'Army', naics: '561720', trade: 'Janitorial', periodEnd: '2025-09-30' },
  { id: 'b', title: 'Grounds — Park Y', agency: 'NPS', naics: '561730', trade: 'Grounds', periodEnd: '2026-01-15' },
  { id: 'c', title: 'IT help desk', agency: 'GSA', naics: '541519', trade: '', periodEnd: '2024-06-30' },
];
const SNIPS = [
  { key: 'company-overview', core: true, trade: [], topics: ['overview'] },
  { key: 'quality-control-plan', core: true, trade: [], topics: ['qc'] },
  { key: 'staffing-plan', core: true, trade: [], topics: ['staffing'] },
  { key: 'transition-in', core: true, trade: [], topics: ['transition'] },
  { key: 'safety-osha', core: true, trade: [], topics: ['safety'] },
  { key: 'carpet-floor-care', core: false, trade: ['Janitorial'], topics: ['floor'] },
  { key: 'grounds-maintenance', core: false, trade: ['Grounds'], topics: ['grounds'] },
];

export default {
  agent: 'gov-library',
  cases: [
    { name: 'matchScore: exact NAICS (3) > trade-only (2) > topic-only (1) > unrelated (0)', run: () => {
      const exact = matchScore({ naics: '561720', trade: 'Janitorial' }, janitorial);
      const tradeOnly = matchScore({ naics: '999999', trade: 'Janitorial' }, janitorial);
      const topicOnly = matchScore({ topics: ['janitorial deep clean'] }, janitorial);
      const none = matchScore({ naics: '541519', trade: 'IT' }, janitorial);
      return ok(exact >= 5 && exact > tradeOnly && tradeOnly > topicOnly && topicOnly > none && none === 0, JSON.stringify({ exact, tradeOnly, topicOnly, none }));
    } },

    { name: 'pastPerformanceFor ranks the relevant (janitorial) record first', run: () => {
      const r = pastPerformanceFor(RECORDS, janitorial, { limit: 3 });
      return ok(r[0].id === 'a', r.map((x) => x.id).join());
    } },

    { name: 'pastPerformanceFor: EMPTY store → [] (never fabricates a citation)', run: () =>
      ok(pastPerformanceFor([], janitorial).length === 0) },

    { name: 'pastPerformanceFor: no tag match → falls back to most-recent REAL records (still real)', run: () => {
      const r = pastPerformanceFor(RECORDS, { title: 'Aircraft overhaul', naics: '336411' }, { limit: 2 });
      return ok(r.length === 2 && r[0].id === 'b', r.map((x) => x.id).join()); // b has the newest periodEnd
    } },

    { name: 'snippetsFor: all core sections + the trade-matched non-core, excludes unrelated non-core', run: () => {
      const s = snippetsFor(SNIPS, janitorial).map((x) => x.key);
      return ok(SECTION_HAS(s, 'company-overview') && SECTION_HAS(s, 'safety-osha') && s.includes('carpet-floor-care') && !s.includes('grounds-maintenance'), s.join());
    } },

    { name: 'snippetsFor: stable proposal order (overview → QC → staffing → transition → safety)', run: () => {
      const s = snippetsFor(SNIPS, janitorial).map((x) => x.key);
      const idx = (k) => s.indexOf(k);
      return ok(idx('company-overview') < idx('quality-control-plan') && idx('quality-control-plan') < idx('staffing-plan') && idx('staffing-plan') < idx('transition-in') && idx('transition-in') < idx('safety-osha'), s.join());
    } },

    { name: 'snippetsFor dedupes by key', run: () => {
      const s = snippetsFor([...SNIPS, { key: 'company-overview', core: true }], janitorial);
      return ok(s.filter((x) => x.key === 'company-overview').length === 1);
    } },

    { name: 'mergeSnippets: a runtime snippet with the same key SUPERSEDES the seed one', run: () => {
      const merged = mergeSnippets([{ key: 'quality-control-plan', body: 'SEED' }], [{ key: 'quality-control-plan', body: 'EDITED' }]);
      const qc = merged.find((x) => x.key === 'quality-control-plan');
      return ok(merged.length === 1 && qc.body === 'EDITED', JSON.stringify(merged));
    } },

    { name: 'loadLibrary reads the real seed (core proposal sections present)', run: () => {
      const keys = loadLibrary().snippets.map((s) => s.key);
      return ok(['company-overview', 'quality-control-plan', 'staffing-plan', 'transition-in', 'safety-osha'].every((k) => keys.includes(k)), keys.join());
    } },
  ],
};

function SECTION_HAS(arr, k) { return arr.includes(k); }
