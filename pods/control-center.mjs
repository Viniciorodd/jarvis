// control-center.mjs — the switch the operator asked for.
//
// *"Everything gets incorporated into Jarvis — it's the system I control everything with. If tomorrow I want
// to stop an agent, or give one autonomy, or turn that autonomy off, I need that switch."*
//
// The whole point of this file is the PRD's own guardrail:
//
//     "Keys, not prompts: autonomy is enforced by scoped credentials + the kill switch, not by instructions
//      — a Tier-0 agent must be UNABLE to act, not merely told not to."
//
// So this is a PURE decision function that execution paths must call and obey. It is not advice to a model
// and it is never rendered into a prompt: a paused agent doesn't read that it is paused, it simply gets
// `allow:false` from the code that would otherwise do the thing. Everything here fails CLOSED — a corrupt
// state file, an unknown agent, or a garbage tier all resolve to "no".
//
// STATE (control-plane/agent-control.json):
//   { killAll: false, agents: { 'CONNECT-01': { state: 'active'|'paused'|'off', tier: 0|1|2 } } }
// Absent agent = the safe default below, so a NEW agent is never born with autonomy it wasn't granted.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const CONTROL_FILE = path.join(HERE, '..', 'control-plane', 'agent-control.json');

// I/O: ONE loader, used by the enforcement gate AND the panel that renders the toggles. If those ever read
// different state, the switch would show "off" while the agent kept sending — the worst possible failure for
// a control surface. An unreadable or corrupt file returns empty state, which `agentPolicy` resolves to the
// safe default: everything drafts, nothing acts alone.
export function loadControl() {
  try {
    const d = JSON.parse(fs.readFileSync(CONTROL_FILE, 'utf8'));
    return d && typeof d === 'object' ? { killAll: !!d.killAll, agents: d.agents || {} } : { killAll: false, agents: {} };
  } catch { return { killAll: false, agents: {} }; }
}

export function saveControl(state = {}) {
  const clean = { killAll: !!state.killAll, agents: state.agents || {} };
  fs.mkdirSync(path.dirname(CONTROL_FILE), { recursive: true });
  fs.writeFileSync(CONTROL_FILE, JSON.stringify(clean, null, 2));
  return clean;
}

export const STATES = ['active', 'paused', 'off'];
export const TIERS = [0, 1, 2];

// Safe posture by default (PRD Part B.3). A new or unknown agent drafts and nothing more.
export const DEFAULT_AGENT = { state: 'active', tier: 0 };

// PURE: resolve one agent's control settings, coercing anything unrecognised DOWN to safe. Eval-pinned.
export function agentPolicy(state = {}, codename = '') {
  const a = (state && state.agents && state.agents[codename]) || {};
  const st = STATES.includes(a.state) ? a.state : DEFAULT_AGENT.state;
  const tierRaw = Number(a.tier);
  const tier = TIERS.includes(tierRaw) ? tierRaw : DEFAULT_AGENT.tier;
  return { codename, state: st, tier };
}

// PURE: THE gate. `kind` is what the agent is about to do:
//   'run'      — do its scheduled work at all (scan, analyse, draft)
//   'draft'    — produce something for review (never leaves the building)
//   'act'      — anything irreversible: send / submit / publish / spend
// `approved` is the operator's explicit yes for THIS item (in-app or Telegram).
// Returns { allow, reason } — reason is plain English because it is shown to him, not parsed.
export function canAgentAct({ state = {}, codename = '', kind = 'act', approved = false } = {}) {
  if (state && state.killAll === true) return { allow: false, reason: 'KILL SWITCH is on — all autonomous agent action is halted' };
  const p = agentPolicy(state, codename);
  // OFF means off. Not "off for sending" — the PRD is explicit: "Off = it does nothing, full stop."
  if (p.state === 'off') return { allow: false, reason: `${codename} is switched OFF` };
  // PAUSED stops it starting new work, but does not strand what he has already approved — otherwise pausing
  // an agent would silently abandon items he already said yes to, which reads as the system losing his work.
  if (p.state === 'paused') {
    if (kind === 'act' && approved === true) return { allow: true, reason: `${codename} is paused, but you approved this one` };
    return { allow: false, reason: `${codename} is PAUSED` };
  }
  if (kind === 'run' || kind === 'draft') return { allow: true, reason: '' };
  if (kind !== 'act') return { allow: false, reason: `unknown action kind "${kind}"` };   // fail closed
  // ── irreversible from here ──
  if (approved === true) return { allow: true, reason: 'you approved this one' };
  if (p.tier <= 0) return { allow: false, reason: `${codename} is Tier 0 (draft-only) — this needs your approval` };
  if (p.tier === 1) return { allow: false, reason: `${codename} is Tier 1 (approve-to-act) — waiting on your yes` };
  return { allow: true, reason: `${codename} is Tier 2 (auto) — within its coded guardrails` };
}

// PURE: apply one operator change, returning NEW state. Unknown values are refused rather than coerced —
// silently storing a bad tier would be a lie about what he set.
export function setAgent(state = {}, codename = '', patch = {}) {
  if (!codename) return state;
  const next = { killAll: !!state.killAll, agents: { ...(state.agents || {}) } };
  const cur = agentPolicy(state, codename);
  const st = patch.state !== undefined ? (STATES.includes(patch.state) ? patch.state : cur.state) : cur.state;
  const tr = patch.tier !== undefined ? (TIERS.includes(Number(patch.tier)) ? Number(patch.tier) : cur.tier) : cur.tier;
  next.agents[codename] = { state: st, tier: tr };
  return next;
}

// PURE: the global halt. Separate from per-agent state so flipping it back does NOT resurrect agents he
// switched off individually — the kill switch is a blanket, not an undo.
export function setKill(state = {}, on = true) {
  return { killAll: !!on, agents: { ...(state.agents || {}) } };
}

// PURE: the roster view for the panel — every agent with its resolved settings and what it can do right now.
export function rosterView(state = {}, people = []) {
  return (Array.isArray(people) ? people : []).map((p) => {
    const pol = agentPolicy(state, p.codename);
    return {
      codename: p.codename,
      nickname: p.nickname || p.codename,
      title: p.title || '',
      pod: p.pod || '',
      state: pol.state,
      tier: pol.tier,
      canRun: canAgentAct({ state, codename: p.codename, kind: 'run' }).allow,
      canActAlone: canAgentAct({ state, codename: p.codename, kind: 'act' }).allow,
    };
  });
}
