// Connector (Hector / CONNECT-01) — Gemini's Agent C, on our stack. GovCon lives or dies on subs: when a
// bid needs subcontracted labor, this finds matching subs in the CRM and drafts hyper-targeted outreach
// tuned to the SOW. It NEVER sends — it drafts and raises a HITL gate (doctrine §9 rule 2; you click send).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, DRAFTS, profile, emit, mirror, hqApproval, claude } from './lib.mjs';

const SUBS_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'subs.json');

export function loadSubs() {
  try { return JSON.parse(fs.readFileSync(SUBS_FILE, 'utf8')).subs || []; } catch { return []; }
}

// PURE: map an opportunity to the trade of sub it needs. Eval-tested.
export function inferTrade(op) {
  const n = String(op.naics || ''); const t = `${op.title || ''} ${op.description || ''}`.toLowerCase();
  if (n === '561730' || /\b(grounds|landscap|lawn|snow|mowing)\b/.test(t)) return 'grounds';
  if (/\bhvac\b/.test(t)) return 'hvac';
  if (/\belectric/.test(t)) return 'electrical';
  if (/\bpest\b/.test(t)) return 'pest';
  if (/\b(guard|security)\b/.test(t)) return 'guard';
  if (n === '561720' || /\b(janitor|custodial|cleaning)\b/.test(t)) return 'janitorial';
  return 'facilities';
}

// PURE: rank CRM subs by trade match (required) + location proximity. Eval-tested.
export function findSubs(subs, { trade, location = '' }) {
  const loc = location.toLowerCase();
  const state = (loc.match(/\b([a-z]{2})\b\s*$/) || [])[1] || (loc.match(/,\s*([a-z]{2})\b/) || [])[1] || '';
  return (subs || [])
    .filter((s) => s.trade === trade && !/^\[example\]/i.test(s.name || ''))
    .map((s) => {
      const sl = String(s.location || '').toLowerCase();
      let score = 1;
      if (loc && sl && (sl.includes(loc.split(',')[0]) || loc.includes(sl.split(',')[0]))) score += 3; // same city
      else if (state && sl.includes(state)) score += 1; // same state
      return { ...s, _score: score };
    })
    .sort((a, b) => b._score - a._score);
}

async function draftOutreach(op, sc, sub, trade) {
  const target = sub ? `the subcontractor "${sub.name}" (${sub.location})` : `a ${trade} subcontractor near ${op.place || 'the place of performance'}`;
  const sys = `You are the Procurement Lead for a GovCon prime. Draft a SHORT, professional outreach email to ${target} for a specific federal opportunity. Match the technical lingo of the scope. Reference the opportunity, location, and rough scope; ask about (a) availability for the period, (b) a ballpark quote / rate, (c) relevant past performance + insurance. Keep it under 180 words, warm but precise. ${sub ? '' : 'Since no named vendor exists yet, ALSO add a 2-line "where to find this sub" note (search terms / directories) at the top.'} End with "[REVIEW & SEND — do not auto-send]". Firm profile:\n${profile()}`;
  const r = await claude(sys, `OPPORTUNITY:\n${JSON.stringify(op, null, 2)}\n\nNEEDS: a ${trade} subcontractor. ${sub ? 'Vendor: ' + JSON.stringify(sub) : 'No vendor on file yet.'}`, { tier: 'draft', maxTokens: 700, agent: 'CONNECT-01' });
  return { md: r.text || '# (no outreach — model unavailable)\n', cost: r.cost || 0 };
}

// Called by the gov worker when a drafted bid needs a sub. Drafts outreach → saves → HITL gate.
export async function maybeConnect({ op, sc }) {
  const trade = inferTrade(op);
  await mirror('CONNECT-01', 'work', `Sourcing a ${trade} sub near ${op.place || 'PoP'}…`);
  const matches = findSubs(loadSubs(), { trade, location: op.place || '' });
  const sub = matches[0] || null;

  const d = await draftOutreach(op, sc, sub, trade);
  fs.mkdirSync(DRAFTS, { recursive: true });
  const slug = (op.noticeId || op.title).replace(/[^\w]+/g, '-').slice(0, 44);
  const file = path.join('gov-drafts', `outreach-${slug}.md`);
  fs.writeFileSync(path.join(ROOT, file), `<!-- sub outreach for ${op.title} · trade=${trade} · ${sub ? 'to ' + sub.name : 'NO VENDOR ON FILE — source one'} -->\n\n${d.md}\n`);

  await emit({ kind: 'action', actor: 'CONNECT-01', pod: 'gov', action: 'sub.outreach.draft', cost_usd: d.cost || 0, reversible: true, rationale: `${trade} outreach drafted for ${op.title}`, payload: { noticeId: op.noticeId, trade, sub: sub ? sub.id : null, file } });
  // HITL: never auto-send external email (doctrine §9 rule 2)
  await emit({ kind: 'approval.request', actor: 'CONNECT-01', pod: 'gov', action: 'send', status: 'pending', reversible: false, rationale: `Subcontractor outreach (${trade}) for ${op.title} — review + send.`, payload: { noticeId: op.noticeId, trade, file, sub: sub ? sub.id : null } });
  await hqApproval({ pod: 'Gov War Room', title: `Send ${trade} outreach: ${op.title}`, detail: sub ? `To ${sub.name} (${sub.location}) · draft ${file}` : `No vendor on file — draft includes where to source one · ${file}`, xp: 20, verb: 'Review & send' });
  await mirror('CONNECT-01', 'need', `${trade} outreach ready to send${sub ? ' to ' + sub.name : ' (need a vendor)'}`);
  return { trade, sub: sub ? sub.id : null, file };
}
