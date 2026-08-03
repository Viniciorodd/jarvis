// Regression suite for the goal graph (pods/goals.mjs).
//
// His own example is the spec: a private jet and a Lamborghini look unrelated and are the same problem —
// build a company that throws off cash. If this file can't find that overlap, the product is just a
// prettier goal list.
//
// The other half is restraint. A WRONG "this action moves 6 goals" is worse than a missed overlap, because
// he'd reorganise his year around it. So matching is strict and the ordering is stable.

import { actionTerms, sameAction, sharedActions, goalGraph, nextActions, orphanGoals } from '../pods/goals.mjs';

const ok = (pass, detail = '') => ({ pass, detail });

const GOALS = [
  { id: 'jet', title: 'Own a private jet', category: 'lifestyle', actions: ['build a company generating $1M annual profit', 'grow liquid net worth', 'hire a pilot'] },
  { id: 'lambo', title: 'Own a Lamborghini', category: 'lifestyle', actions: ['build a company generating $1M annual profit', 'grow liquid net worth'] },
  { id: 'vineyard', title: 'Own a vineyard', category: 'real estate', actions: ['acquire rural real estate', 'build passive income streams', 'grow liquid net worth'] },
  { id: 'farm', title: 'Own a farm', category: 'real estate', actions: ['acquire rural real estate', 'build passive income streams'] },
  { id: 'spanish', title: 'Become fluent in Italian', category: 'personal', actions: ['practice daily for 20 minutes'] },
];

export default {
  agent: 'goals',
  cases: [
    // ── his example, which is the whole point ──
    { name: 'HIS EXAMPLE: the jet and the Lamborghini are the SAME problem underneath', run: () => {
      const top = sharedActions(GOALS)[0];
      return ok(top.goals.includes('jet') && top.goals.includes('lambo') && top.leverage >= 2, JSON.stringify(top));
    } },

    { name: 'the highest-leverage action is ranked FIRST', run: () => {
      const all = sharedActions(GOALS);
      return ok(all[0].leverage >= all[all.length - 1].leverage && all[0].leverage >= 3, JSON.stringify(all.slice(0, 2)));
    } },

    { name: '"grow liquid net worth" is caught across THREE goals', run: () => {
      const hit = sharedActions(GOALS).find((a) => /net worth/i.test(a.action));
      return ok(hit && hit.leverage === 3, JSON.stringify(hit));
    } },

    { name: 'the vineyard and the farm connect through rural real estate', run: () => {
      const g = goalGraph(GOALS);
      const e = g.edges.find((x) => [x.from, x.to].includes('vineyard') && [x.from, x.to].includes('farm'));
      return ok(!!e && e.via.some((v) => /rural real estate/i.test(v)), JSON.stringify(e));
    } },

    // ── strictness: a wrong overlap is worse than a missed one ──
    { name: 'STRICT: two actions sharing only a common verb are NOT merged', run: () =>
      ok(!sameAction('build a company', 'build a habit'), 'merged "build a company" with "build a habit"') },

    { name: 'STRICT: unrelated actions never merge', run: () =>
      ok(!sameAction('practice daily for 20 minutes', 'acquire rural real estate')) },

    { name: 'the same action phrased differently DOES merge', run: () =>
      ok(sameAction('grow liquid net worth', 'grow my liquid net worth'), 'failed to merge a rephrasing') },

    { name: 'plurals do not split an action ("companies" vs "company")', run: () =>
      ok(sameAction('own multimillion dollar companies', 'own multimillion dollar company')) },

    { name: 'stopwords carry no weight in a match', run: () => {
      const t = actionTerms('build a company for the profit of it');
      return ok(!t.includes('the') && !t.includes('for') && t.includes('company'), JSON.stringify(t));
    } },

    // ── stability: a list that reshuffles is one he stops trusting ──
    { name: 'the ranking is STABLE across runs', run: () => {
      const a = JSON.stringify(sharedActions(GOALS).map((x) => x.action));
      const b = JSON.stringify(sharedActions(GOALS).map((x) => x.action));
      return ok(a === b, 'ranking changed between identical runs');
    } },

    { name: 'the general phrasing is kept, not one goal\'s wording', run: () => {
      const hit = sharedActions([
        { id: 'a', actions: ['grow my liquid net worth substantially over time'] },
        { id: 'b', actions: ['grow liquid net worth'] },
      ])[0];
      return ok(hit.action === 'grow liquid net worth', hit.action);
    } },

    // ── the answer to "what do I do this week" ──
    { name: 'nextActions NAMES what each action unlocks', run: () => {
      const n = nextActions(GOALS, { limit: 1 })[0];
      return ok(/moves \d+ goals/.test(n.line) && n.unlocks.length === n.leverage && /Own a/.test(n.line), n.line);
    } },

    { name: 'a genuine outlier is surfaced, not hidden', run: () => {
      const orphans = orphanGoals(GOALS);
      return ok(orphans.includes('Become fluent in Italian') && orphans.length === 1, JSON.stringify(orphans));
    } },

    { name: 'the graph links only goals that ACTUALLY share something', run: () => {
      const g = goalGraph(GOALS);
      const bad = g.edges.filter((e) => [e.from, e.to].includes('spanish'));
      return ok(bad.length === 0, JSON.stringify(bad));
    } },

    { name: 'every node reports how connected it is', run: () => {
      const g = goalGraph(GOALS);
      const jet = g.nodes.find((n) => n.id === 'jet');
      return ok(jet.links >= 1 && jet.actionCount === 3, JSON.stringify(jet));
    } },

    { name: 'one goal alone produces no edges and no false leverage', run: () => {
      const g = goalGraph([{ id: 'x', title: 'Solo', actions: ['do a thing'] }]);
      return ok(g.edges.length === 0 && g.nodes[0].links === 0);
    } },

    { name: 'empty / garbage input does not throw', run: () =>
      ok(sharedActions().length === 0 && goalGraph(null).nodes.length === 0
        && nextActions().length === 0 && orphanGoals().length === 0 && actionTerms().length === 0) },
  ],
};
