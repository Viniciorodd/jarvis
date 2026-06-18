// Operator (Sloane / OPERATOR-01) — Gemini's Agent F, on our stack. AFTER a win, this protects the thing
// that wins the NEXT contract: your past-performance (CPARS) rating. It tracks milestones, flags overdue
// deliverables, chases subs for status, and drafts CPARS-grade progress reports for the CO/COR — all
// HITL-gated (you review + send). Most of its value arrives once you have an active award.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, DRAFTS, emit, mirror, hqApproval, gateApproval, claude, profile } from './lib.mjs';

const SEED_DIR = path.dirname(fileURLToPath(import.meta.url));
const AWARDS_FILE = path.join(process.env.GOV_DATA_DIR || SEED_DIR, 'awards.json');
const AWARDS_SEED = path.join(SEED_DIR, 'awards.json');

export function loadAwards() {
  try { return JSON.parse(fs.readFileSync(AWARDS_FILE, 'utf8')).awards || []; }
  catch { try { return JSON.parse(fs.readFileSync(AWARDS_SEED, 'utf8')).awards || []; } catch { return []; } }
}
const isTemplate = (a) => /^\[example\]/i.test(a.title || '') || a.id === 'AWARD-EXAMPLE';

// PURE: which milestones are overdue (past due + not done)? Eval-tested.
export function overdueMilestones(award, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  return (award.milestones || []).filter((m) => m.status !== 'done' && String(m.due) < today);
}

async function draftProgressReport(award, overdue) {
  const sys = `You are Project Operations for a GovCon prime. Draft a concise, professional progress report addressed to the Contracting Officer's Representative (COR), written to support a strong CPARS rating. Cover: period of performance status, milestones completed vs. pending, any at-risk items + the mitigation, subcontractor performance, and a one-line "no issues / issues" summary. Factual and confident; never overstate. End with "[REVIEW & SEND — Vinicio approves]". Markdown. Firm profile:\n${profile()}`;
  const r = await claude(sys, `AWARD:\n${JSON.stringify(award, null, 2)}\n\nOVERDUE MILESTONES:\n${JSON.stringify(overdue, null, 2)}`, { tier: 'draft', maxTokens: 1200, agent: 'OPERATOR-01' });
  return { md: r.text || '# (no report — model unavailable)\n', cost: r.cost || 0 };
}

export async function runOps({ awardId = null, source = 'manual' } = {}) {
  const awards = loadAwards().filter((a) => a.status === 'active' && !isTemplate(a) && (!awardId || a.id === awardId));
  await mirror('OPERATOR-01', 'work', awards.length ? `Reviewing ${awards.length} active award(s)…` : 'No active awards yet (post-award standby)');
  await emit({ kind: 'action', actor: 'OPERATOR-01', pod: 'gov', action: 'ops.review', status: 'done', rationale: `${awards.length} active award(s) (${source})`, payload: { count: awards.length } });

  if (!awards.length) {
    await mirror('OPERATOR-01', 'idle', 'Standing by — drafts CPARS reports once you win an award');
    return { active: 0, reports: 0, note: 'No active awards. Sloane activates after the first win (replace the template in pods/gov/awards.json).' };
  }

  fs.mkdirSync(DRAFTS, { recursive: true });
  const reports = [];
  for (const a of awards) {
    const overdue = overdueMilestones(a);
    if (overdue.length) await emit({ kind: 'trace', actor: 'OPERATOR-01', pod: 'gov', action: 'milestone.overdue', status: 'error', rationale: `${overdue.length} overdue on ${a.title}`, payload: { awardId: a.id, overdue: overdue.map((m) => m.name) } });
    const d = await draftProgressReport(a, overdue);
    const file = path.join('gov-drafts', `cpars-${a.id}.md`);
    fs.writeFileSync(path.join(ROOT, file), `<!-- progress report · ${a.title} · COR ${a.cor} -->\n\n${d.md}\n`);
    await emit({ kind: 'action', actor: 'OPERATOR-01', pod: 'gov', action: 'progress.report.draft', cost_usd: d.cost || 0, reversible: true, rationale: `report drafted for ${a.title}`, payload: { awardId: a.id, file, overdue: overdue.length } });
    await gateApproval(
      { kind: 'approval.request', actor: 'OPERATOR-01', pod: 'gov', action: 'send', status: 'pending', reversible: false, rationale: `Progress report for ${a.title} — review + send to COR.`, payload: { awardId: a.id, file } },
      { pod: 'Gov War Room', title: `Send progress report: ${a.title}`, detail: `${overdue.length ? '⚠ ' + overdue.length + ' overdue milestone(s) · ' : ''}draft ${file}`, xp: 30, verb: 'Review & send' });
    reports.push({ awardId: a.id, file, overdue: overdue.length });
  }
  await mirror('OPERATOR-01', 'need', `${reports.length} progress report(s) ready for review`);
  return { active: awards.length, reports: reports.length, drafts: reports.map((r) => r.file) };
}

if (process.argv[1] && process.argv[1].endsWith('operator.mjs')) {
  runOps({ source: 'cli' }).then((r) => console.log(JSON.stringify(r, null, 2))).catch((e) => { console.error(e); process.exitCode = 1; });
}
