// Regression suite for the goal importer (pods/goals-import.mjs).
//
// It reads what he ALREADY WROTE across ten years of notes. The bar is conservatism: a false goal scraped
// off a shopping list pollutes the graph and drags the leverage ranking, and that ranking is the one number
// the whole product depends on being trustworthy.

import { looksLikeGoal, categorize, goalsFromLines, mergeGoals, cleanTitle, isCrisisContent, thirdPartyDoc } from '../pods/goals-import.mjs';

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

    // ── 🚨 THE SAFETY GATE ─────────────────────────────────────────────────────────────────────────
    // PRD §4, and it is the reason this suite exists at all: the journals contain "I want to die"
    // (2025-04-16). Before this filter, SIX of nine crisis phrasings came back as goals. The literal
    // journal line survived only because cleanTitle reduced it to "die" and a WORD-COUNT rule dropped it.
    // These cases exist so nobody can ever widen a length or word rule and quietly reopen the hole.
    { name: '🚨 the exact journal line is never a goal', run: () =>
      ok(!looksLikeGoal('I want to die') && isCrisisContent('I want to die')) },

    { name: '🚨 crisis content is suppressed in every phrasing, not just the one on file', run: () => {
      const leaks = ['I want to die already', 'I want to die soon', 'I wish to end it all',
        'I want to kill myself', 'I want to stop existing', 'I want to hurt myself badly',
        'I want to disappear forever', 'I want to give up on everything', 'I want to sleep forever',
        'I dont want to live anymore', 'I want to end my life', 'I want to take my own life',
      ].filter(looksLikeGoal);
      return ok(leaks.length === 0, 'LEAKED: ' + JSON.stringify(leaks));
    } },

    { name: '🚨 suppression does not depend on word count (the accident that saved us)', run: () =>
      // "die" alone is one word and was dropped by the filler rule. "die already" is two and was NOT.
      ok(!looksLikeGoal('I want to die already') && !looksLikeGoal('I want to die')) },

    { name: '🚨 the gate is exported so every reader of his journals shares ONE list', run: () =>
      ok(isCrisisContent('kill myself') && !isCrisisContent('Buy a mansion in Dubai')) },

    // ── the chore filter (PRD §4) ──────────────────────────────────────────────────────────────────
    // "buy" is an aspiration verb, so the errands sail straight through without this.
    { name: 'chores misfiled as goals are dropped', run: () => {
      const kept = ['Buy groceries for the week', 'Take the garbage out', 'Buy laundry detergent',
        'Get an oil change', 'Buy toilet paper'].filter(looksLikeGoal);
      return ok(kept.length === 0, JSON.stringify(kept));
    } },

    { name: 'the $40M mansion survives the same filter that kills the garbage', run: () =>
      // The registry's own example of the pair that must not be treated alike.
      ok(looksLikeGoal('Buy a Mansion in Dubai') && !looksLikeGoal('Take the garbage out')) },

    // ── third-party exclusion (PRD §4) ─────────────────────────────────────────────────────────────
    { name: 'a pasted assistant reply contributes no goals', run: () =>
      ok(thirdPartyDoc('Certainly! Here is a plan to build wealth:')
        && goalsFromLines(['Certainly! Here are some steps:', '- Buy a mansion in Dubai'], 'x.md').length === 0) },

    { name: 'a book highlight is the author ambition, not his', run: () =>
      ok(!looksLikeGoal('> Build a company that outlives you')) },

    { name: 'his own goals still survive all three filters', run: () => {
      const lost = ['Buy a Mansion in Dubai', 'I want to own a private jet', 'Buy my mom a house',
        'Learn Italian fluently', 'I want to travel the world'].filter((g) => !looksLikeGoal(g));
      return ok(lost.length === 0, 'LOST: ' + JSON.stringify(lost));
    } },

    { name: 'empty / garbage input does not throw', run: () =>
      ok(goalsFromLines().length === 0 && mergeGoals().length === 0 && !looksLikeGoal() && categorize() === 'other') },
  ],
};
