// One-tap sources-sought responder. Sources-sought / RFI notices are low-effort RELATIONSHIP builders
// (the doctrine's subcontract-first phase) — for each, draft a SHORT capability response from the entity
// profile, write a SENDABLE email (To: CO, Subject, ---, body), and raise ONE 'send' gate. Approve →
// the control-plane executor emails it via the Rodgate mailbox (with GOV_AUTO_SEND on).
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, DRAFTS, profile, emit, mirror, hqApproval, gateApproval, claude } from './lib.mjs';
import { scout } from './worker.mjs';

export const isSourcesSought = (op = {}) =>
  /sources?\s*sought|request for information|\brfi\b|market research/i.test(`${op.title || ''} ${op.description || ''}`)
  || /sources sought|rfi|special notice/i.test(op.type || '');

export async function respondToSourcesSought({ op }) {
  if (!op) return { ok: false };
  await mirror('GOV-ANALYST', 'work', `Drafting a sources-sought response: ${op.title}…`);
  const sys = `You are the GovCon capability-statement writer for this firm. Draft a SHORT, professional response to a federal SOURCES SOUGHT / RFI notice — this is market research, NOT a bid. Goal: register our capability + interest, build the relationship, get on the radar. Include: a one-line intro; our relevant capabilities + NAICS; our socio-economic set-asides (LEAD with these); our UEI + CAGE; one or two lines of relevant experience; and a request to be kept informed of the solicitation. Under 350 words, precise, compliant, no overpromising (honor the operator's 5 contracting laws). End with "[REVIEW & SEND — Vinicio approves]". Firm profile:\n${profile()}`;
  const r = await claude(sys, `SOURCES-SOUGHT NOTICE:\n${JSON.stringify({ title: op.title, agency: op.agency, naics: op.naics, deadline: op.deadline, place: op.place, description: (op.description || '').slice(0, 1500) }, null, 2)}`, { tier: 'draft', maxTokens: 900, agent: 'GOV-ANALYST' });
  const body = (r.text || '# (no draft — model unavailable)').trim();
  fs.mkdirSync(DRAFTS, { recursive: true });
  const slug = String(op.noticeId || op.title).replace(/[^\w]+/g, '-').slice(0, 44);
  const file = path.join('gov-drafts', `sources-sought-${slug}.md`);
  const to = op.contactEmail || '';
  const header = to
    ? `To: ${to}\nSubject: Sources Sought Response — ${op.title}\n${'-'.repeat(48)}\n`
    : '<!-- no CO email captured for this notice — add a "To:" line before sending -->\n';
  fs.writeFileSync(path.join(ROOT, file), `<!-- sources-sought response · ${op.title} -->\n${header}\n${body}\n`);
  await emit({ kind: 'action', actor: 'GOV-ANALYST', pod: 'gov', action: 'sources_sought.draft', cost_usd: r.cost || 0, reversible: true, rationale: `Capability response drafted for sources-sought: ${op.title}`, payload: { noticeId: op.noticeId, file } });
  await gateApproval(
    { kind: 'approval.request', actor: 'GOV-ANALYST', pod: 'gov', action: 'send', status: 'pending', reversible: false, rationale: `Send sources-sought capability response: ${op.title}${to ? ` to ${to}` : ' (add the CO email first)'}.`, payload: { noticeId: op.noticeId, file } },
    { pod: 'Gov War Room', title: `Send sources-sought response: ${op.title}`, detail: `${to || 'add CO email'} · capability statement · ${file}`, xp: 15, verb: 'Review & send' });
  await mirror('GOV-ANALYST', 'need', `Sources-sought response ready — ${op.title} (one tap to send)`);
  return { ok: true, file, to };
}

// Scout → filter to sources-sought → draft responses for the top N (each gated). Called by the router.
export async function runSourcesSought({ max = 3 } = {}) {
  await mirror('GOV-ANALYST', 'work', 'Scanning for sources-sought notices…');
  const { opps = [], source } = await scout();
  const ss = opps.filter(isSourcesSought).slice(0, max);
  if (!ss.length) {
    await emit({ kind: 'trace', actor: 'GOV-ANALYST', pod: 'gov', action: 'sources_sought.none', rationale: `No sources-sought in the current feed (${source})` });
    await mirror('GOV-ANALYST', 'idle', 'No sources-sought notices right now.');
    return { drafted: 0 };
  }
  const done = [];
  for (const op of ss) { const r = await respondToSourcesSought({ op }); if (r.ok) done.push(op.title); }
  await emit({ kind: 'action', actor: 'GOV-ANALYST', pod: 'gov', action: 'sources_sought.batch', rationale: `Drafted ${done.length} sources-sought response(s) — each gated for your sign-off`, payload: { titles: done } });
  return { drafted: done.length, titles: done };
}

if (process.argv[1] && process.argv[1].endsWith('sources.mjs')) {
  runSourcesSought({}).then((r) => console.log(JSON.stringify(r, null, 2))).catch((e) => { console.error(e); process.exitCode = 1; });
}
