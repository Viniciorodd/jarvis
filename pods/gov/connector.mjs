// Connector (Hector / CONNECT-01) — the procurement & teaming pipeline (Gemini's Agent C, expanded).
// When a bid needs subcontracted labor it: (1) infers the trade, (2) RATES local subs against the SOW,
// (3) drafts targeted outreach that asks each for SOW confirmation + PAST PERFORMANCE + a QUOTE (the inputs
// a winning federal proposal needs), and (4) raises a HITL gate (you send; you never auto-email — §9 rule 2).
// Discovery of NEW local businesses needs a search source (Google Places / SAM sub-search) — see notes;
// for now Hector rates + works the CRM (pods/gov/subs.json), which you or a future scraper populate.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, DRAFTS, profile, emit, mirror, hqApproval, claude } from './lib.mjs';

// The CRM lives in GOV_DATA_DIR if set (a mounted volume on the NAS, so it persists + you can open it),
// else next to the code (pods/gov, for local dev). The in-repo subs.json is the seed/fallback.
const SEED_DIR = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.GOV_DATA_DIR || SEED_DIR;
const SUBS_FILE = path.join(DATA_DIR, 'subs.json');
const SUBS_SEED = path.join(SEED_DIR, 'subs.json');
function readSubsFile() {
  try { return JSON.parse(fs.readFileSync(SUBS_FILE, 'utf8')); }
  catch { try { return JSON.parse(fs.readFileSync(SUBS_SEED, 'utf8')); } catch { return { subs: [] }; } }
}
export function loadSubs() { return readSubsFile().subs || []; }
export function saveSubs(subs) { try { const cur = readSubsFile(); cur.subs = subs; fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(SUBS_FILE, JSON.stringify(cur, null, 2)); } catch { /* */ } }
const real = (s) => !/^\[example\]/i.test(s.name || '');

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

// PURE: rank candidate subs for a SOW. Score 0-100 from proximity + past performance + capability match
// + quote-on-file. Eval-tested — this is the "rating system" that decides who we approach first.
export function rateSubs(subs, { trade, location = '', sow = '' }) {
  const loc = String(location).toLowerCase();
  const city = loc.split(',')[0];
  const sowWords = String(sow).toLowerCase().split(/\W+/).filter((w) => w.length > 4);
  return (subs || [])
    .filter((s) => s.trade === trade && real(s))
    .map((s) => {
      let score = 0; const reasons = [];
      const sl = String(s.location || '').toLowerCase();
      if (city && sl && (sl.includes(city) || loc.includes(sl.split(',')[0]))) { score += 30; reasons.push('same area'); }
      else { score += 10; reasons.push('in region'); }
      const pp = Math.max(0, Math.min(100, Number(s.past_performance) || 0));
      score += Math.round(pp * 0.4); if (pp) reasons.push(`past-perf ${pp}`);
      const caps = (s.capabilities || []).join(' ').toLowerCase();
      const overlap = [...new Set(sowWords)].filter((w) => caps.includes(w)).length;
      if (overlap) { score += Math.min(20, overlap * 5); reasons.push(`${overlap} capability match`); }
      if (s.quote) { score += 10; reasons.push('quote on file'); }
      return { id: s.id, name: s.name, location: s.location, contact_email: s.contact_email || '', status: s.status || 'prospect', score: Math.min(100, score), reasons };
    })
    .sort((a, b) => b.score - a.score);
}

// kept for the existing eval / simple lookups
export function findSubs(subs, { trade, location = '' }) {
  return rateSubs(subs, { trade, location, sow: '' });
}

async function draftOutreach(op, top, trade, shortlist) {
  const target = top ? `the subcontractor "${top.name}" (${top.location})` : `a ${trade} subcontractor near ${op.place || 'the place of performance'}`;
  const sys = `You are the Procurement Lead for a GovCon prime, assembling a team for a specific federal opportunity. Draft a SHORT, professional outreach email to ${target}. It must clearly ASK them to reply with, so we can build our proposal:
1) Confirmation they can perform THIS scope of work for the period of performance.
2) Their relevant PAST PERFORMANCE (1-3 similar contracts, agency + value + a reference) — we will cite it in our federal proposal.
3) A firm QUOTE / rate for the scope.
4) Proof of insurance + any required certifications.
Keep it under 200 words, precise, warm. ${top ? '' : 'No vendor is on file yet — add a 2-line "where to source this sub" note (search terms / directories) at the top.'} End with "[REVIEW & SEND — Vinicio approves]". Firm profile:\n${profile()}`;
  const r = await claude(sys, `OPPORTUNITY:\n${JSON.stringify(op, null, 2)}\n\nTRADE NEEDED: ${trade}\nTOP CANDIDATE: ${top ? JSON.stringify(top) : 'none on file'}\nSHORTLIST (rated): ${JSON.stringify(shortlist)}`, { tier: 'draft', maxTokens: 800, agent: 'CONNECT-01' });
  return { md: r.text || '# (no outreach — model unavailable)\n', cost: r.cost || 0 };
}

// Called by the gov worker when a drafted bid needs a sub. Rates the field, drafts outreach, gates.
export async function maybeConnect({ op, sc }) {
  const trade = inferTrade(op);
  const sow = `${op.title || ''} ${op.description || ''}`;
  await mirror('CONNECT-01', 'work', `Rating ${trade} subs near ${op.place || 'PoP'}…`);
  const ranked = rateSubs(loadSubs(), { trade, location: op.place || '', sow });
  const shortlist = ranked.slice(0, 3);
  const top = ranked[0] || null;

  await emit({ kind: 'action', actor: 'CONNECT-01', pod: 'gov', action: 'procurement.shortlist', reversible: true, rationale: shortlist.length ? `Rated ${trade} subs: ${shortlist.map((s) => `${s.name} (${s.score})`).join(', ')}` : `No ${trade} subs on file — need to source one`, payload: { noticeId: op.noticeId, trade, shortlist } });

  const d = await draftOutreach(op, top, trade, shortlist);
  fs.mkdirSync(DRAFTS, { recursive: true });
  const slug = (op.noticeId || op.title).replace(/[^\w]+/g, '-').slice(0, 44);
  const file = path.join('gov-drafts', `outreach-${slug}.md`);
  const rankNote = shortlist.length ? `\n<!-- rated shortlist: ${shortlist.map((s) => `${s.name} ${s.score}/100 [${s.reasons.join(', ')}]`).join(' | ')} -->\n` : '\n<!-- no vendor on file — source one -->\n';
  fs.writeFileSync(path.join(ROOT, file), `<!-- sub outreach for ${op.title} · trade=${trade} -->${rankNote}\n${d.md}\n`);

  await emit({ kind: 'action', actor: 'CONNECT-01', pod: 'gov', action: 'sub.outreach.draft', cost_usd: d.cost || 0, reversible: true, rationale: `${trade} outreach drafted (asks for past performance + quote)`, payload: { noticeId: op.noticeId, trade, top: top ? top.id : null, file } });
  await emit({ kind: 'approval.request', actor: 'CONNECT-01', pod: 'gov', action: 'send', status: 'pending', reversible: false, rationale: `Send ${trade} outreach (SOW + ask for past performance + quote) for ${op.title}.`, payload: { noticeId: op.noticeId, trade, file, shortlist } });
  const detail = top ? `Top: ${top.name} (${top.score}/100 — ${top.reasons.join(', ')}) · asks for past perf + quote · ${file}` : `No vendor on file — draft says where to source one · ${file}`;
  await hqApproval({ pod: 'Gov War Room', title: `Send ${trade} outreach: ${op.title}`, detail, xp: 20, verb: 'Review & send' });
  await mirror('CONNECT-01', 'need', shortlist.length ? `Shortlisted ${shortlist.length} ${trade} sub(s) — outreach ready to send` : `Need a ${trade} vendor — outreach ready`);
  return { trade, shortlist, top: top ? top.id : null, file };
}
