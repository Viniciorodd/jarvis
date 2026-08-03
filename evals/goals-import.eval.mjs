// Regression suite for the goal importer (pods/goals-import.mjs).
//
// It reads what he ALREADY WROTE across ten years of notes. The bar is conservatism: a false goal scraped
// off a shopping list pollutes the graph and drags the leverage ranking, and that ranking is the one number
// the whole product depends on being trustworthy.

import { looksLikeGoal, categorize, goalsFromLines, mergeGoals, cleanTitle } from '../pods/goals-import.mjs';

const ok = (pass, detail = '') => ({ pass, detail });

export default {
  agent: 'goals-import',
  cases: [
    { name: 'his real examples are recognised as goals', run: () => {
      const yes = ['Own a private jet', 'I want to own a vineyard', '- [ ] Build a company generating $1M profit', 'Buy a Lamborghini'];
      const miss = yes.filter((l) => !looksLikeGoal(l));
      return ok(miss.length === 0, 'missed: ' + JSON.stringify(miss));
    } },

    { name: 'CONSERVATIVE: chores and notes are NOT goals', run: () => {
      const no = ['Call Nancy about the DICOM files', 'Email the CO back', '- [ ] Check the inbox', 'Remember to pay the water bill', 'Review the proposal'];
      const wrong = no.filter((l) => looksLikeGoal(l));
      return ok(wrong.length === 0, 'wrongly imported: ' + JSON.stringify(wrong));
    } },

    // Learned from a REAL import over his 6,142 notes: template links dominated the results. "Master Journal
    // Year: 2022 (../../Vault/Database/Master%20Journal…)" matched on "master" and appeared 25× — it would
    // have put a navigation link at the top of his life's goals.
    { name: 'THE REAL NOISE: vault template links are never goals', run: () => {
      const junk = [
        'Master Journal Year: 2022 (../../Vault/Database/Master%20Journal%20DB)',
        'Master Journal Month: September (../../Master%20Journal%20DB/x)',
        'Build the thing ([link](https://example.com))',
      ];
      const wrong = junk.filter((l) => looksLikeGoal(l));
      return ok(wrong.length === 0, 'imported junk: ' + JSON.stringify(wrong));
    } },

    { name: 'a "Label: value" line is not an ambition', run: () =>
      ok(!looksLikeGoal('Master Journal Month: September')) },

    { name: 'task metadata is stripped from the title', run: () => {
      const t = cleanTitle('- [x] Build a Claude Code routine #someday #personal-dev ✅ 2026-06-30');
      return ok(t === 'Build a Claude Code routine', JSON.stringify(t));
    } },

    { name: '"(overdue from …)" and priority marks are stripped', run: () => {
      const t = cleanTitle('⏫ Buy a vineyard (overdue from 2026-06-25) 📅 2026-08-01');
      return ok(t === 'Buy a vineyard', JSON.stringify(t));
    } },

    { name: 'a line that is ONLY metadata is dropped, not imported as a stub', run: () =>
      ok(goalsFromLines(['- [x] Save the **x** ✅ 2026-07-06 #tag'], 'f.md').length === 0) },

    { name: 'a heading is a section, never a goal', run: () =>
      ok(!looksLikeGoal('## Own the following things')) },

    { name: 'a question is not a goal', run: () =>
      ok(!looksLikeGoal('Should I buy a rental property?')) },

    { name: 'a fragment or an essay is skipped', run: () =>
      ok(!looksLikeGoal('Own it') && !looksLikeGoal('I want to ' + 'x'.repeat(200))) },

    { name: 'the "I want to" preamble is stripped from the title', run: () => {
      const g = goalsFromLines(['I want to own a vineyard in Italy'], 'notes.md')[0];
      return ok(g.title === 'Own a vineyard in Italy', g.title);
    } },

    { name: 'categories are assigned from his real vocabulary', run: () =>
      ok(categorize('Own a private jet') === 'lifestyle'
        && categorize('Reach $1M net worth') === 'financial'
        && categorize('Buy a vineyard') === 'real estate'
        && categorize('Become fluent in Italian') === 'skill') },

    { name: 'an unclassifiable goal gets "other", never a guessed bucket', run: () =>
      ok(categorize('Own the thing that matters') === 'other') },

    { name: 'a ticked checkbox imports as ACHIEVED', run: () => {
      const g = goalsFromLines(['- [x] Buy a house'], 'f.md')[0];
      return ok(g.status === 'achieved', JSON.stringify(g));
    } },

    { name: 'every goal carries WHERE he wrote it — traceable, not another shelf', run: () => {
      const g = goalsFromLines(['## 2026', 'Own a farm'], '2026 Goals.md')[0];
      return ok(g.source === '2026 Goals.md' && g.section === '2026', JSON.stringify(g));
    } },

    { name: 'THE SAME AMBITION written across years is ONE goal', run: () => {
      const a = goalsFromLines(['Own a private jet'], '2019.md');
      const b = goalsFromLines(['Own a private jet'], '2026.md');
      const merged = mergeGoals([a, b]);
      return ok(merged.length === 1 && merged[0].sources.length === 2 && merged[0].mentions === 2, JSON.stringify(merged));
    } },

    { name: 'writing it repeatedly over the years is kept as SIGNAL', run: () => {
      const many = ['2019.md', '2021.md', '2024.md', '2026.md'].map((f) => goalsFromLines(['Own a vineyard'], f));
      return ok(mergeGoals(many)[0].mentions === 4, String(mergeGoals(many)[0].mentions)) },
    },

    { name: 'achieved anywhere means achieved', run: () => {
      const merged = mergeGoals([goalsFromLines(['Buy a house'], 'a.md'), goalsFromLines(['- [x] Buy a house'], 'b.md')]);
      return ok(merged[0].status === 'achieved', merged[0].status);
    } },

    { name: 'empty / garbage input does not throw', run: () =>
      ok(goalsFromLines().length === 0 && mergeGoals().length === 0 && !looksLikeGoal() && categorize() === 'other') },
  ],
};
