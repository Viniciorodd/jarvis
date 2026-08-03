// Regression suite for the Gatekeeper (pods/gatekeeper.mjs) — "protect the yes".
//
// The two acceptance cases from the PRD are the spine: the LAKE TRIP must return YES (rest is a goal, this
// is not a refusal engine) and the 5AM AIRPORT RUN must return NO or COUNTER with a real cost. Beyond that,
// the tests defend the three mechanics the real JFK weekend exposed — creep, recovery, and a reciprocity
// debt that got overdrawn 5× — plus the guardrail that matters most: it must never turn him cold toward
// family, and it must never invent a reason.

import { creepMarkers, creepRisk, recoveryDays, trueCost, reciprocity, proportionality, verdict, script } from '../pods/gatekeeper.mjs';

const ok = (pass, detail = '') => ({ pass, detail });

export default {
  agent: 'gatekeeper',
  cases: [
    // ── the two acceptance cases ──
    { name: 'ACCEPTANCE: the LAKE TRIP returns YES — rest is a goal, not a favor', run: () => {
      const v = verdict({ cost: trueCost({ hours: 6 }), creep: creepRisk('come to the lake with us Saturday'), alignment: 'serves', tier: 'inner' });
      return ok(v.verdict === 'yes', JSON.stringify(v));
    } },

    { name: 'ACCEPTANCE: the 5AM AIRPORT RUN is NOT a plain yes, and the cost is real', run: () => {
      const text = 'can you pick my cousin up from the airport at 5am and bring him back';
      const creep = creepRisk(text);
      const cost = trueCost({ drivingHours: 5, waitHours: 1, miles: 220, startHour: 5, creepMultiplier: creep.multiplier });
      const v = verdict({ cost, creep });
      return ok(['no', 'counter', 'defer'].includes(v.verdict) && cost.recoveryDays >= 1 && cost.total > 300,
        JSON.stringify({ v: v.verdict, hours: cost.totalHours, rec: cost.recoveryDays, total: cost.total }));
    } },

    // ── creep: the ask that ruins you is never the first one ──
    { name: 'THE JFK CASE: a stacking ask is flagged before it stacks', run: () => {
      const r = creepRisk('since you\'re here, can you drive us to the airport and back, and help with the DMV documents');
      return ok(r.risk === 'high' && r.count >= 4, JSON.stringify(r));
    } },

    { name: 'a simple, bounded ask carries no creep risk', run: () => {
      const r = creepRisk('can you look at my resume');
      return ok(r.risk === 'none' && r.multiplier === 1, JSON.stringify(r));
    } },

    { name: 'creep INFLATES the expected cost — scored as it will end up', run: () => {
      const plain = trueCost({ hours: 4 });
      const stacky = trueCost({ hours: 4, creepMultiplier: 2.5 });
      return ok(stacky.expectedHours > plain.expectedHours * 2, JSON.stringify({ plain: plain.expectedHours, stacky: stacky.expectedHours }));
    } },

    // ── recovery: the invisible multiplier nobody counts ──
    { name: 'RECOVERY: a pre-6am start costs a day beyond the day', run: () =>
      ok(recoveryDays({ startHour: 4.5, totalHours: 8 }) === 1, String(recoveryDays({ startHour: 4.5, totalHours: 8 }))) },

    { name: 'RECOVERY: two heavy days in a row cost two', run: () =>
      ok(recoveryDays({ drivingHours: 6, consecutiveDays: 2 }) === 2) },

    { name: 'a normal afternoon errand costs NO recovery day', run: () =>
      ok(recoveryDays({ startHour: 14, drivingHours: 1, totalHours: 2 }) === 0) },

    { name: 'recovery is counted as a DEGRADED day, not a lost 24 hours', run: () => {
      const c = trueCost({ drivingHours: 5, startHour: 5 });
      return ok(c.totalHours > c.baseHours && c.totalHours < c.baseHours + 24, JSON.stringify(c));
    } },

    // ── the reciprocity distortion: the debt he does not actually owe ──
    { name: 'HIS CASE: over-repaid means IN CREDIT, and it says so warmly', run: () => {
      const r = reciprocity([
        { direction: 'received', hours: 6, dollars: 120 },
        { direction: 'given', hours: 29, dollars: 245 },
      ]);
      return ok(r.settled && r.netHours === 23 && /free to choose/i.test(r.line), JSON.stringify(r));
    } },

    { name: 'a genuine outstanding debt is stated plainly, and repaying is called fair', run: () => {
      const r = reciprocity([{ direction: 'received', hours: 10, dollars: 200 }]);
      return ok(!r.settled && /repaying is fair/i.test(r.line), r.line);
    } },

    { name: 'NEVER A SCOREBOARD: the wording is never "they owe you"', run: () => {
      const r = reciprocity([{ direction: 'received', hours: 1 }, { direction: 'given', hours: 40 }]);
      return ok(!/they owe|owes you|debt to you/i.test(r.line), r.line);
    } },

    { name: 'PROPORTIONALITY: 4 days repaying one dinner is not repayment', run: () => {
      const p = proportionality({ askHours: 30, owedHours: 2 });
      return ok(p.disproportionate && p.ratio >= 3 && /new favor/i.test(p.note), JSON.stringify(p));
    } },

    { name: 'a fair, proportionate repayment is NOT flagged', run: () =>
      ok(!proportionality({ askHours: 3, owedHours: 4 }).disproportionate) },

    // ── never cold toward family ──
    { name: 'THE GUARDRAIL: a small ask from the inner circle is simply YES', run: () => {
      const v = verdict({ cost: trueCost({ hours: 2 }), creep: creepRisk('can you grab me from the store'), tier: 'inner' });
      return ok(v.verdict === 'yes', JSON.stringify(v));
    } },

    { name: 'DEFER is the default when it is close — the cave happens in the moment', run: () => {
      const v = verdict({ cost: trueCost({ hours: 5 }), creep: creepRisk('help me move some boxes') });
      return ok(v.verdict === 'defer', JSON.stringify(v));
    } },

    { name: 'the yes-budget produces a COUNTER, never a bare refusal', run: () => {
      const v = verdict({ cost: trueCost({ hours: 6 }), creep: creepRisk('x'), yesBudgetLeftHours: 2 });
      return ok(v.verdict === 'counter' && /budget/i.test(v.why), JSON.stringify(v));
    } },

    // ── the script ──
    { name: 'THE BUFFER breaks the cave reflex, and is the default', run: () => {
      const s = script({ verdict: 'defer', who: 'Mike' });
      return ok(/get back to you/i.test(s) && /Mike/.test(s), s);
    } },

    { name: 'ONE reason, not three — a decline never stacks justifications', run: () => {
      const s = script({ verdict: 'no', who: 'Mike', reason: 'I\'ve got work I can\'t move.' });
      return ok((s.match(/\./g) || []).length <= 3 && !/because.*because/i.test(s), s);
    } },

    { name: 'a decline stays warm — it is a person, not a ticket', run: () =>
      ok(/hope it goes smooth/i.test(script({ verdict: 'no', who: 'Mike' }))) },

    // Live catch, 2026-08-02: the model returned the counter "uber", producing "I can uber. That work?" —
    // broken English in the ONE message he actually sends. A clumsy script never gets sent.
    { name: 'a one-word counter from the model does NOT produce broken English', run: () => {
      const s = script({ verdict: 'counter', who: 'Mike', counter: 'uber' });
      return ok(/do part of it/.test(s) && !/can uber/.test(s), s);
    } },

    { name: 'a real counter-offer IS used verbatim', run: () => {
      const s = script({ verdict: 'counter', counter: 'do the drop-off Saturday morning' });
      return ok(/do the drop-off Saturday morning/.test(s), s);
    } },

    { name: 'NEVER FABRICATES: the script contains no invented appointment or emergency', run: () => {
      const all = ['yes', 'no', 'counter', 'defer'].map((v) => script({ verdict: v, who: 'Mike' })).join(' ');
      return ok(!/doctor|appointment|emergency|sick|funeral|out of town|meeting at/i.test(all), all);
    } },

    { name: 'empty / garbage input does not throw', run: () =>
      ok(creepMarkers().length === 0 && trueCost().total === 0 && reciprocity().settled === true
        && verdict({}).verdict && script({}).length > 0) },
  ],
};
