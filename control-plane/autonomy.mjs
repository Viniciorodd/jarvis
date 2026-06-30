// autonomy.mjs — the AUTONOMY LADDER (doctrine §8) made real + the promotion rule (§8/§10).
//
// Every workflow sits at a level L0–L4. A workflow is PROMOTED only when it has earned it:
//   evals pass  AND  human-edit-rate < threshold  AND  enough samples to be meaningful.
// Promotion is a RECOMMENDATION surfaced to the operator — code never grants new autonomy on its own
// (CLAUDE.md "⚠ Ask the human before … grants new autonomy"). The operator flips the level.
//
// HARD CONSTITUTIONAL FLOOR (§9 rule 2): money/irreversible "exit" kinds — send, submit, publish, list,
// spend, pay, wire, deliver, order, trade — ALWAYS gate, at every level. The ladder can relax gates only
// for reversible, low-blast-radius workflows (a scan, a draft, a monitor pass). It can never auto-fire a
// proposal submit or a payment. So raising a level is safe by construction.
//
// Pure functions (eval-pinned); the level store is a small JSON file like schedule.json / brain-mode.json.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(DIR, 'autonomy.json');

// ── the ladder (what each rung means) ───────────────────────────────────────────────────────────────
export const LEVELS = [
  { level: 0, key: 'manual',     label: 'Manual',     blurb: 'You do it. The agent only suggests.' },
  { level: 1, key: 'assisted',   label: 'Assisted',   blurb: 'Agent prepares a draft; you approve every action.' },
  { level: 2, key: 'supervised', label: 'Supervised', blurb: 'Agent runs reversible steps on its own; you approve anything irreversible.' },
  { level: 3, key: 'trusted',    label: 'Trusted',    blurb: 'Agent auto-runs reversible work and notifies you; irreversible still gated.' },
  { level: 4, key: 'autonomous', label: 'Autonomous', blurb: 'Fully hands-off — only ever for reversible, low-stakes loops.' },
];
export const levelMeta = (n) => LEVELS.find((l) => l.level === n) || LEVELS[1];

// ── the hard constitutional floor: these kinds gate at EVERY level, forever ─────────────────────────
export const HARD_GATE_KINDS = new Set(['send', 'submit', 'publish', 'list', 'spend', 'pay', 'wire', 'deliver', 'order', 'trade', 'buy', 'purchase']);

// ── the workflow registry — the named units of work the ladder governs ──────────────────────────────
// kind = the action_kind it culminates in; irreversible = does it touch the world un-undoably?
// evalSuite = the eval file whose green/red gates promotion (matched against evals/.results.json agents).
export const WORKFLOWS = [
  { id: 'gov.scan',        pod: 'gov',    label: 'Gov opportunity scan',     kind: 'scan',    irreversible: false, evalSuite: 'gov-pipeline', default: 2 },
  { id: 'gov.draft',       pod: 'gov',    label: 'Proposal drafting',        kind: 'draft',   irreversible: false, evalSuite: 'gov-send',     default: 1 },
  { id: 'gov.submit',      pod: 'gov',    label: 'Proposal submit',          kind: 'submit',  irreversible: true,  evalSuite: 'gov-send',     default: 1 },
  { id: 'gov.send',        pod: 'gov',    label: 'Gov email (CO / sub)',     kind: 'send',    irreversible: true,  evalSuite: 'gov-send',     default: 1 },
  { id: 'gov.discover',    pod: 'gov',    label: 'Subcontractor discovery',  kind: 'find',    irreversible: false, evalSuite: 'enrich',       default: 2 },
  { id: 'fiverr.draft',    pod: 'fiverr', label: 'Fiverr design draft',      kind: 'generate',irreversible: false, evalSuite: 'fiverr-orders', default: 2 },
  { id: 'fiverr.deliver',  pod: 'fiverr', label: 'Fiverr order delivery',    kind: 'deliver', irreversible: true,  evalSuite: 'fiverr-orders', default: 1 },
  { id: 'finance.invoice', pod: 'exec',   label: 'Invoice / payment link',   kind: 'spend',   irreversible: true,  evalSuite: 'finance',      default: 1 },
  { id: 'research.monitor',pod: 'research-risk', label: 'Market monitor + journal', kind: 'monitor', irreversible: false, evalSuite: 'research-risk', default: 3 },
];
export const findWorkflow = (id) => WORKFLOWS.find((w) => w.id === id) || null;

// PURE: map a Chief-of-Staff classification → a workflow id (so the gate can consult the ladder). Eval-pinned.
export function workflowFor({ pod, action_kind, intent } = {}) {
  const k = String(action_kind || intent || '').toLowerCase();
  if (pod === 'gov') {
    if (/submit/.test(k)) return 'gov.submit';
    if (/send|email/.test(k)) return 'gov.send';
    if (/scan|report/.test(k) || intent === 'manual_scan') return 'gov.scan';
    if (/find|discover|search|enrich/.test(k)) return 'gov.discover';
    if (/draft|write|generate|analyze|score/.test(k)) return 'gov.draft';
    return 'gov.scan';
  }
  if (pod === 'fiverr') return /deliver|send|publish/.test(k) ? 'fiverr.deliver' : 'fiverr.draft';
  if (pod === 'exec') return /invoice|spend|pay|charge|bill/.test(k) ? 'finance.invoice' : null;
  if (pod === 'research-risk') return 'research.monitor';
  return null;
}

// ── level store (JSON; defaults from the registry) ──────────────────────────────────────────────────
function loadRaw() { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return { levels: {} }; } }
export function loadLevels() {
  const raw = loadRaw().levels || {};
  const out = {};
  for (const w of WORKFLOWS) out[w.id] = Number.isInteger(raw[w.id]) ? raw[w.id] : w.default;
  return out;
}
export function getLevel(id) { const w = findWorkflow(id); if (!w) return 1; return loadLevels()[id] ?? w.default; }
// Set a level (the operator's deliberate act of granting/revoking autonomy). Clamped 0..4. Returns new level.
export function setLevel(id, level) {
  const w = findWorkflow(id); if (!w) return null;
  const n = Math.max(0, Math.min(4, Math.round(Number(level))));
  const raw = loadRaw(); raw.levels = raw.levels || {}; raw.levels[id] = n; raw.updated = new Date().toISOString();
  try { fs.writeFileSync(FILE, JSON.stringify(raw, null, 2)); } catch { /* */ }
  return n;
}

// ── PURE: does a workflow at this level require a human gate for this action? ────────────────────────
// The whole safety argument lives here:
//   • a HARD_GATE kind always gates (the constitution overrides any level);
//   • an irreversible (non-hard) action gates below L3;
//   • a reversible action gates below L1 (L0 = manual = you trigger it; ≥L1 the agent may prepare/run it).
export function requiresGate({ kind, irreversible, level }) {
  const k = String(kind || '').toLowerCase();
  if (HARD_GATE_KINDS.has(k)) return { gate: true, reason: `"${k}" moves money / goes out the door — always your sign-off (constitution §9).` };
  if (irreversible) return level >= 3
    ? { gate: false, reason: `${levelMeta(level).label} (L${level}) — trusted to run this irreversible-but-recoverable step; you're notified.` }
    : { gate: true, reason: `Irreversible — gated until this workflow is promoted to Trusted (L3) (doctrine §8).` };
  return level >= 1
    ? { gate: false, reason: `${levelMeta(level).label} (L${level}) — reversible, runs without a gate.` }
    : { gate: true, reason: 'Manual (L0) — you trigger this; raise the level to let the agent run it.' };
}

// ── PURE: human-edit-rate for a workflow from the event log (doctrine §10 Layer-2 metric) ────────────
// "How often do you have to fix what the agent produced?" Lower is better. We count, per workflow:
//   edits   = proposal.redraft + approval decisions that were 'edit' or 'pass' (you changed/rejected it)
//   accepts = proposal.draft accepted as-is + approval decisions that were 'approve'
// editRate = edits / (edits + accepts).  sampleSize = edits + accepts.
export function humanEditRate(events = [], workflowId) {
  const w = findWorkflow(workflowId); if (!w) return { editRate: 1, sampleSize: 0, edits: 0, accepts: 0 };
  let edits = 0, accepts = 0;
  for (const e of events) {
    if (e.pod && w.pod && e.pod !== w.pod) continue;
    const a = String(e.action || '').toLowerCase();
    if (a === 'proposal.redraft') { edits++; continue; }
    if (a === 'proposal.draft') { accepts++; continue; }
    if (e.kind === 'approval.decision') {
      const d = String((e.payload && e.payload.decision) || e.action || '').toLowerCase();
      if (d === 'approve') accepts++;
      else if (d === 'edit' || d === 'pass') edits++;
    }
  }
  const sampleSize = edits + accepts;
  return { editRate: sampleSize ? edits / sampleSize : 1, sampleSize, edits, accepts };
}

// ── PURE: the promotion rule (doctrine §8) ──────────────────────────────────────────────────────────
export const DEFAULT_EDIT_THRESHOLD = Number(process.env.AUTONOMY_EDIT_THRESHOLD || 0.2); // < 20% edits
export const DEFAULT_MIN_SAMPLES = Number(process.env.AUTONOMY_MIN_SAMPLES || 5);
export function canPromote({ level = 1, evalsPass = false, humanEditRate: rate = 1, sampleSize = 0, threshold = DEFAULT_EDIT_THRESHOLD, minSamples = DEFAULT_MIN_SAMPLES } = {}) {
  if (level >= 4) return { ok: false, reason: 'Already at the top of the ladder (L4).' };
  if (!evalsPass) return { ok: false, reason: 'Evals must be green before promotion (regression safety, §11).' };
  if (sampleSize < minSamples) return { ok: false, reason: `Not enough real runs yet (${sampleSize}/${minSamples}) to judge.` };
  if (rate >= threshold) return { ok: false, reason: `You still edit ${Math.round(rate * 100)}% of its output (need < ${Math.round(threshold * 100)}%).` };
  return { ok: true, reason: `Evals green, you accept ${Math.round((1 - rate) * 100)}% as-is over ${sampleSize} runs — ready for L${level + 1}.` };
}

// ── report: every workflow's level + metrics + recommendation (feeds the UI + KPIs) ─────────────────
// evalsByAgent: { [suiteAgent]: {pass,total} } from evals/.results.json. events: the gov/all event log.
export function autonomyReport(events = [], evalsByAgent = {}) {
  const levels = loadLevels();
  const workflows = WORKFLOWS.map((w) => {
    const level = levels[w.id];
    const m = humanEditRate(events, w.id);
    const ev = evalsByAgent[w.evalSuite];
    const evalsPass = !!(ev && ev.total > 0 && ev.pass === ev.total);
    const promote = canPromote({ level, evalsPass, humanEditRate: m.editRate, sampleSize: m.sampleSize });
    const gateNow = requiresGate({ kind: w.kind, irreversible: w.irreversible, level });
    return {
      id: w.id, label: w.label, pod: w.pod, kind: w.kind, irreversible: w.irreversible,
      level, levelLabel: levelMeta(level).label, hardGate: HARD_GATE_KINDS.has(w.kind),
      evalsPass, evalSuite: w.evalSuite,
      humanEditRate: Math.round(m.editRate * 100) / 100, accepts: m.accepts, edits: m.edits, sampleSize: m.sampleSize,
      gatesNow: gateNow.gate, gateReason: gateNow.reason,
      canPromote: promote.ok, promoteReason: promote.reason,
    };
  });
  // one Layer-2 number: autonomy ratio = share of workflows running unattended for their current work.
  const autonomyRatio = workflows.length ? workflows.filter((w) => !w.gatesNow).length / workflows.length : 0;
  return { levels: LEVELS, workflows, autonomyRatio: Math.round(autonomyRatio * 100) / 100, editThreshold: DEFAULT_EDIT_THRESHOLD, minSamples: DEFAULT_MIN_SAMPLES };
}

// ── CLI: node control-plane/autonomy.mjs [report|set <id> <level>] ──────────────────────────────────
if (process.argv[1] && process.argv[1].endsWith('autonomy.mjs')) {
  const [cmd, a, b] = process.argv.slice(2);
  if (cmd === 'set' && a) { console.log(`${a} → L${setLevel(a, b)}`); }
  else {
    let events = [], evalsByAgent = {};
    try { const cp = (process.env.CONTROL_PLANE_URL || 'http://localhost:8787').replace(/\/$/, ''); } catch { /* */ }
    try { const r = JSON.parse(fs.readFileSync(path.join(DIR, '..', 'evals', '.results.json'), 'utf8')); for (const x of r.agents || []) evalsByAgent[x.agent] = { pass: x.pass, total: x.total }; } catch { /* */ }
    try { events = JSON.parse('[' + fs.readFileSync(path.join(DIR, 'data', 'events.jsonl'), 'utf8').trim().split('\n').join(',') + ']'); } catch { /* */ }
    const rep = autonomyReport(events, evalsByAgent);
    console.log(`Autonomy ladder — ratio ${Math.round(rep.autonomyRatio * 100)}% unattended, edit threshold ${Math.round(rep.editThreshold * 100)}%\n`);
    for (const w of rep.workflows) console.log(`  L${w.level} ${w.levelLabel.padEnd(11)} ${w.id.padEnd(16)} ${w.gatesNow ? '🔒 gated ' : '⚡ auto  '} evals:${w.evalsPass ? 'green' : 'RED'} edit:${Math.round(w.humanEditRate * 100)}% n=${w.sampleSize}${w.canPromote ? '  → PROMOTABLE' : ''}`);
  }
}
