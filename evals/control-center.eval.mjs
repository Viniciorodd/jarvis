// Regression suite for the Control Center (pods/control-center.mjs) — the switch that stops an agent, and
// the tier that decides whether it may act alone. These map 1:1 onto the PRD's acceptance tests, because the
// guardrail is explicit: "a Tier-0 agent must be UNABLE to act, not merely told not to."
// Everything fails CLOSED: corrupt state, unknown agent, garbage tier all resolve to "no".

import { canAgentAct, agentPolicy, setAgent, setAll, setKill, rosterView, DEFAULT_AGENT } from '../pods/control-center.mjs';

const ok = (pass, detail = '') => ({ pass, detail });
const S = (agents, killAll = false) => ({ killAll, agents });

export default {
  agent: 'control-center',
  cases: [
    // ── acceptance 1: Off means off ──
    { name: 'ACCEPTANCE 1: an agent switched OFF cannot run, draft, or act', run: () => {
      const st = S({ 'CONNECT-01': { state: 'off', tier: 2 } });
      const kinds = ['run', 'draft', 'act'].map((k) => canAgentAct({ state: st, codename: 'CONNECT-01', kind: k }).allow);
      return ok(kinds.every((a) => a === false), JSON.stringify(kinds));
    } },

    { name: 'OFF outranks even an explicit approval (the switch is not advisory)', run: () =>
      ok(canAgentAct({ state: S({ A: { state: 'off', tier: 2 } }), codename: 'A', kind: 'act', approved: true }).allow === false) },

    // ── acceptance 2: Tier 0 is draft-only ──
    { name: 'ACCEPTANCE 2: Tier 0 may draft but is BLOCKED from acting', run: () => {
      const st = S({ 'GOV-ANALYST': { state: 'active', tier: 0 } });
      const draft = canAgentAct({ state: st, codename: 'GOV-ANALYST', kind: 'draft' });
      const act = canAgentAct({ state: st, codename: 'GOV-ANALYST', kind: 'act' });
      return ok(draft.allow === true && act.allow === false && /draft-only/.test(act.reason), JSON.stringify({ draft, act }));
    } },

    { name: 'Tier 1 acts ONLY with an explicit approval', run: () => {
      const st = S({ A: { state: 'active', tier: 1 } });
      return ok(canAgentAct({ state: st, codename: 'A', kind: 'act' }).allow === false
        && canAgentAct({ state: st, codename: 'A', kind: 'act', approved: true }).allow === true);
    } },

    { name: 'Tier 2 acts alone — the only tier that may', run: () =>
      ok(canAgentAct({ state: S({ A: { state: 'active', tier: 2 } }), codename: 'A', kind: 'act' }).allow === true) },

    // ── acceptance 3: the kill switch ──
    { name: 'ACCEPTANCE 3: the KILL SWITCH halts every agent, every kind, instantly', run: () => {
      const st = S({ A: { state: 'active', tier: 2 }, B: { state: 'active', tier: 2 } }, true);
      const all = ['run', 'draft', 'act'].flatMap((k) => ['A', 'B'].map((c) => canAgentAct({ state: st, codename: c, kind: k, approved: true }).allow));
      return ok(all.every((a) => a === false), JSON.stringify(all));
    } },

    { name: 'turning the kill switch back OFF does not resurrect individually-off agents', run: () => {
      const killed = setKill(S({ A: { state: 'off', tier: 2 }, B: { state: 'active', tier: 2 } }), true);
      const restored = setKill(killed, false);
      return ok(canAgentAct({ state: restored, codename: 'A', kind: 'act' }).allow === false
        && canAgentAct({ state: restored, codename: 'B', kind: 'act' }).allow === true, JSON.stringify(restored));
    } },

    // ── paused ──
    { name: 'PAUSED stops new work but does not strand what he already approved', run: () => {
      const st = S({ A: { state: 'paused', tier: 2 } });
      return ok(canAgentAct({ state: st, codename: 'A', kind: 'run' }).allow === false
        && canAgentAct({ state: st, codename: 'A', kind: 'act' }).allow === false
        && canAgentAct({ state: st, codename: 'A', kind: 'act', approved: true }).allow === true);
    } },

    // ── fail closed ──
    { name: 'FAILS CLOSED: an unknown agent gets the safe default (draft-only), never autonomy', run: () => {
      const p = agentPolicy({}, 'BRAND-NEW-01');
      return ok(p.tier === DEFAULT_AGENT.tier && p.tier === 0
        && canAgentAct({ state: {}, codename: 'BRAND-NEW-01', kind: 'act' }).allow === false, JSON.stringify(p));
    } },

    { name: 'FAILS CLOSED: garbage state / tier / kind never grants an action', run: () => {
      const junk = S({ A: { state: 'banana', tier: 99 } });
      return ok(agentPolicy(junk, 'A').tier === 0
        && canAgentAct({ state: junk, codename: 'A', kind: 'act' }).allow === false
        && canAgentAct({ state: S({ A: { state: 'active', tier: 2 } }), codename: 'A', kind: 'teleport' }).allow === false);
    } },

    { name: 'FAILS CLOSED: no state at all (missing/corrupt file) blocks acting', run: () =>
      ok(canAgentAct({}).allow === false && canAgentAct({ state: null, codename: 'A', kind: 'act' }).allow === false) },

    // ── setting things ──
    { name: 'setAgent stores a valid change and leaves the others alone', run: () => {
      const next = setAgent(S({ A: { state: 'active', tier: 0 }, B: { state: 'active', tier: 0 } }), 'A', { tier: 2 });
      return ok(next.agents.A.tier === 2 && next.agents.B.tier === 0, JSON.stringify(next.agents));
    } },

    // ── bulk controls (operator: "instead of me having to go one by one") ──
    { name: 'BULK: one call moves EVERY agent, including ones with no saved entry yet', run: () => {
      const roster = [{ codename: 'A' }, { codename: 'B' }, { codename: 'C' }];
      const next = setAll({ killAll: false, agents: { A: { state: 'active', tier: 0 } } }, roster, { state: 'off' });
      return ok(['A', 'B', 'C'].every((c) => next.agents[c].state === 'off'), JSON.stringify(next.agents));
    } },

    { name: 'BULK tier: all agents move together and it actually takes effect at the gate', run: () => {
      const roster = [{ codename: 'A' }, { codename: 'B' }];
      const next = setAll({}, roster, { tier: 2 });
      return ok(canAgentAct({ state: next, codename: 'A', kind: 'act' }).allow === true
        && canAgentAct({ state: next, codename: 'B', kind: 'act' }).allow === true, JSON.stringify(next.agents));
    } },

    { name: 'BULK: a bad value changes NOTHING — half a bulk change is worse than none', run: () => {
      const roster = [{ codename: 'A' }, { codename: 'B' }];
      const start = { killAll: false, agents: { A: { state: 'active', tier: 1 } } };
      const badTier = setAll(start, roster, { tier: 9 });
      const badState = setAll(start, roster, { state: 'banana' });
      return ok(JSON.stringify(badTier) === JSON.stringify(start) && JSON.stringify(badState) === JSON.stringify(start), JSON.stringify(badTier));
    } },

    { name: 'BULK: setting state does not silently reset everyone\'s tier', run: () => {
      const roster = [{ codename: 'A' }, { codename: 'B' }];
      const start = { killAll: false, agents: { A: { state: 'active', tier: 2 }, B: { state: 'active', tier: 1 } } };
      const next = setAll(start, roster, { state: 'paused' });
      return ok(next.agents.A.tier === 2 && next.agents.B.tier === 1, JSON.stringify(next.agents));
    } },

    { name: 'BULK: an empty roster is a no-op, never a wipe', run: () =>
      ok(JSON.stringify(setAll({ killAll: false, agents: { A: { state: 'off', tier: 0 } } }, [], { state: 'active' }).agents) === JSON.stringify({ A: { state: 'off', tier: 0 } })) },

    { name: 'setAgent REFUSES an invalid tier rather than silently coercing it', run: () => {
      const next = setAgent(S({ A: { state: 'active', tier: 1 } }), 'A', { tier: 7 });
      return ok(next.agents.A.tier === 1, JSON.stringify(next.agents.A));
    } },

    { name: 'every reason is plain English — he reads these, nothing parses them', run: () => {
      const r = canAgentAct({ state: S({ A: { state: 'active', tier: 0 } }), codename: 'A', kind: 'act' });
      return ok(/approval/i.test(r.reason) && !/[{}_]/.test(r.reason), r.reason);
    } },

    { name: 'rosterView reports what each agent can actually do right now', run: () => {
      const st = S({ 'CONNECT-01': { state: 'active', tier: 2 }, 'GOV-ANALYST': { state: 'off', tier: 2 } });
      const view = rosterView(st, [{ codename: 'CONNECT-01', nickname: 'Hector' }, { codename: 'GOV-ANALYST', nickname: 'Patricia' }]);
      return ok(view[0].canActAlone === true && view[1].canRun === false, JSON.stringify(view));
    } },

    { name: 'empty / garbage input does not throw', run: () =>
      ok(rosterView().length === 0 && rosterView({}, null).length === 0 && setAgent({}, '').agents === undefined) },
  ],
};
