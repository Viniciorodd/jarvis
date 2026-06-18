// Connector (Hector / CONNECT-01) — the procurement & teaming pipeline (Gemini's Agent C, expanded).
// When a bid needs subcontracted labor it: (1) infers the trade, (2) RATES local subs against the SOW,
// (3) drafts targeted outreach that asks each for SOW confirmation + PAST PERFORMANCE + a QUOTE (the inputs
// a winning federal proposal needs), and (4) raises a HITL gate (you send; you never auto-email — §9 rule 2).
// Discovery of NEW local businesses needs a search source (Google Places / SAM sub-search) — see notes;
// for now Hector rates + works the CRM (pods/gov/subs.json), which you or a future scraper populate.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, DRAFTS, profile, emit, mirror, hqApproval, gateApproval, claude } from './lib.mjs';

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
// Placeholder/template rows shipped as a seed — never surface them as real CRM data, and drop them the
// moment real subs are saved (so the example rows can't linger in the volume after discovery runs).
const isExample = (s) => /^SUB-EXAMPLE/i.test((s && s.id) || '') || /^\s*\[example\]/i.test((s && s.name) || '');
export function loadSubs() { return (readSubsFile().subs || []).filter((s) => !isExample(s)); }
export function saveSubs(subs) { try { const cur = readSubsFile(); cur.subs = (subs || []).filter((s) => !isExample(s)); fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(SUBS_FILE, JSON.stringify(cur, null, 2)); } catch { /* */ } }
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

  // E3: find the top candidate's email BEFORE drafting, so the outreach is actually SENDABLE (a real To:
  // header) and approving it dispatches — instead of leaving a review-only draft with no recipient.
  if (top && !top.contact_email) {
    await mirror('CONNECT-01', 'work', `Finding a contact email for ${top.name}…`);
    try {
      const { enrichSubs } = await import('./enrich.mjs');
      await enrichSubs({ ids: shortlist.map((s) => s.id) });
      const fresh = loadSubs().find((s) => s.id === top.id);
      if (fresh && fresh.contact_email) top.contact_email = fresh.contact_email;
    } catch { /* enrichment best-effort — falls back to a review draft */ }
  }

  const d = await draftOutreach(op, top, trade, shortlist);
  fs.mkdirSync(DRAFTS, { recursive: true });
  const slug = (op.noticeId || op.title).replace(/[^\w]+/g, '-').slice(0, 44);
  const file = path.join('gov-drafts', `outreach-${slug}.md`);
  const rankNote = shortlist.length ? `\n<!-- rated shortlist: ${shortlist.map((s) => `${s.name} ${s.score}/100 [${s.reasons.join(', ')}]`).join(' | ')} -->\n` : '\n<!-- no vendor on file — source one -->\n';
  // If the top candidate has an email (from enrichment), write a SENDABLE header (To:/Subject:/---) so the
  // executor can dispatch it on your approval. No email yet → it's still a review draft (run enrichment first).
  const header = top && top.contact_email
    ? `To: ${top.contact_email}\nSubject: Teaming opportunity — ${op.title}\n${'-'.repeat(48)}\n`
    : '';
  fs.writeFileSync(path.join(ROOT, file), `<!-- sub outreach for ${op.title} · trade=${trade} -->${rankNote}\n${header}${d.md}\n`);

  await emit({ kind: 'action', actor: 'CONNECT-01', pod: 'gov', action: 'sub.outreach.draft', cost_usd: d.cost || 0, reversible: true, rationale: `${trade} outreach drafted (asks for past performance + quote)`, payload: { noticeId: op.noticeId, trade, top: top ? top.id : null, file } });
  const detail = top ? `Top: ${top.name} (${top.score}/100 — ${top.reasons.join(', ')}) · asks for past perf + quote · ${file}` : `No vendor on file — draft says where to source one · ${file}`;
  await gateApproval(
    { kind: 'approval.request', actor: 'CONNECT-01', pod: 'gov', action: 'send', status: 'pending', reversible: false, rationale: `Send ${trade} outreach (SOW + ask for past performance + quote) for ${op.title}.`, payload: { noticeId: op.noticeId, trade, file, shortlist } },
    { pod: 'Gov War Room', title: `Send ${trade} outreach: ${op.title}`, detail, xp: 20, verb: 'Review & send' });
  await mirror('CONNECT-01', 'need', shortlist.length ? `Shortlisted ${shortlist.length} ${trade} sub(s) — outreach ready to send` : `Need a ${trade} vendor — outreach ready`);
  return { trade, shortlist, top: top ? top.id : null, file };
}

// CRM "reach out" — the operator tapped a prospect's reach-out button. Enrich (find an email if missing),
// draft a warm teaming intro to add them to our bench, and raise the gated send. Not opp-specific.
export async function reachOutToSub({ id } = {}) {
  const subs = loadSubs();
  let sub = subs.find((s) => s.id === id);
  if (!sub) return { ok: false, error: 'sub not found' };
  if (!sub.contact_email && sub.website) {
    await mirror('CONNECT-01', 'work', `Finding a contact email for ${sub.name}…`);
    try { const { enrichSubs } = await import('./enrich.mjs'); await enrichSubs({ ids: [id] }); sub = loadSubs().find((s) => s.id === id) || sub; } catch { /* best-effort */ }
  }
  const sys = `You are Hector, procurement lead for Rodgate, LLC (a PA-based SDB/Minority/Hispanic-owned janitorial-facilities GovCon PRIME that subcontracts labor). Draft a SHORT (<160 words), warm, professional intro email to a local ${sub.trade || 'facilities'} company to add them to our subcontractor bench for upcoming federal/SLED janitorial-facilities contracts. Ask them to reply with: services + areas covered, relevant past performance, proof of insurance + certifications, and typical pricing. Warm, zero ego, exposure-not-persuasion. End with "[REVIEW & SEND — Vinicio approves]". Firm profile:\n${profile()}`;
  const r = await claude(sys, `COMPANY: ${JSON.stringify({ name: sub.name, location: sub.location, website: sub.website })}`, { tier: 'draft', maxTokens: 600, agent: 'CONNECT-01' });
  const slug = ('reach-' + (sub.name || id)).replace(/[^\w]+/g, '-').slice(0, 46);
  const file = path.join('gov-drafts', `${slug}.md`);
  fs.mkdirSync(DRAFTS, { recursive: true });
  const header = sub.contact_email ? `To: ${sub.contact_email}\nSubject: Teaming with Rodgate, LLC — ${sub.name}\n${'-'.repeat(48)}\n` : '';
  fs.writeFileSync(path.join(ROOT, file), `<!-- CRM reach-out to ${sub.name} -->\n\n${header}${r.text || '# (no draft — model unavailable)'}\n`);
  await emit({ kind: 'action', actor: 'CONNECT-01', pod: 'gov', action: 'sub.outreach.draft', cost_usd: r.cost || 0, reversible: true, rationale: `Reach-out drafted to ${sub.name}`, payload: { sub: id, file } });
  await gateApproval(
    { kind: 'approval.request', actor: 'CONNECT-01', pod: 'gov', action: 'send', status: 'pending', reversible: false, rationale: `Send teaming intro to ${sub.name}${sub.contact_email ? ` (${sub.contact_email})` : ' — no email found yet, add one first'}.`, payload: { sub: id, file } },
    { pod: 'Gov War Room', title: `Reach out: ${sub.name}`, detail: `${sub.contact_email || 'no email'} · teaming intro · ${file}`, xp: 15, verb: 'Review & send' });
  await mirror('CONNECT-01', 'need', `Reach-out to ${sub.name} ready — review & send`);
  return { ok: true, file, email: sub.contact_email || '', name: sub.name };
}
