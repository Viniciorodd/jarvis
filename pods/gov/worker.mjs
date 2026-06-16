// Gov pod worker — the EXECUTION layer (your #1 cash path). Turns "scan" from intent into action.
// Pipeline (Gemini's A→B→D, kept on our stack): Scout (find) → Strategist (bid/no-bid score) →
// Closer (proposal draft) → HITL approval. The Connector (subcontractor sourcing) is hooked but only
// drafts outreach — nothing is ever sent/submitted without you (doctrine §2, §9: gate the irreversible).
//
// It is a CLIENT of the control-plane (emits events = the audit trail / FirmContextState) and mirrors
// each agent onto the HQ floor so you WATCH it work in Jarvis World. Dependency-free (raw fetch).
//
//   node pods/gov/worker.mjs            # run one scan end-to-end (uses .env)
//   import { runScan } from './worker.mjs'  # invoked async by the Chief-of-Staff router

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, DRAFTS, env, profile, emit, mirror, hqApproval, claude } from './lib.mjs';
import { maybeConnect } from './connector.mjs';
import { procurementPath } from './replies.mjs';

// ── A. SCOUT — find opportunities (real SAM.gov, fallback to a realistic simulated feed) ────────
function simulatedFeed() {
  return [
    { noticeId: 'SIM-W911-FortIndiantown', title: 'Custodial Services — Fort Indiantown Gap, PA', naics: '561720', setAside: 'Total Small Business', agency: 'Dept of the Army', deadline: '2026-07-10', place: 'Annville, PA', url: 'https://sam.gov/opp/SIM-W911', description: 'Recurring janitorial/custodial services for administrative buildings, ~85,000 sq ft, base year + 4 option years. Day porter + nightly cleaning.' },
    { noticeId: 'SIM-VA-Wilkes', title: 'Grounds Maintenance — VA Medical Center, Wilkes-Barre PA', naics: '561730', setAside: 'SDVOSB Set-Aside', agency: 'Dept of Veterans Affairs', deadline: '2026-07-02', place: 'Wilkes-Barre, PA', url: 'https://sam.gov/opp/SIM-VA', description: 'Grounds/landscaping, snow removal, seasonal. SDVOSB set-aside.' },
    { noticeId: 'SIM-GSA-Scranton', title: 'Facilities Support — Federal Building, Scranton PA', naics: '561210', setAside: 'Small Disadvantaged Business', agency: 'GSA', deadline: '2026-07-18', place: 'Scranton, PA', url: 'https://sam.gov/opp/SIM-GSA', description: 'Combined custodial + minor building maintenance + trash removal for a 6-story federal building. SDB set-aside.' },
  ];
}
async function scout() {
  const key = env('SAM_API_KEY');
  if (!key) return { source: 'simulated', opps: simulatedFeed() };
  try {
    const d = (x) => new Date(Date.now() - x * 864e5).toLocaleDateString('en-US');
    const naics = ['561210', '561720', '561990', '561730'];
    const url = `https://api.sam.gov/opportunities/v2/search?api_key=${key}&postedFrom=${encodeURIComponent(d(8))}&postedTo=${encodeURIComponent(d(0))}&ncode=${naics.join(',')}&limit=15&ptype=o,k,r,p`;
    const r = await fetch(url);
    if (!r.ok) return { source: 'simulated (SAM ' + r.status + ')', opps: simulatedFeed() };
    const data = await r.json();
    const opps = (data.opportunitiesData || []).map((o) => ({
      noticeId: o.noticeId, title: o.title, naics: o.naicsCode, setAside: o.typeOfSetAside || o.typeOfSetAsideDescription || 'none',
      agency: (o.fullParentPathName || '').split('.')[0] || o.organizationType || '', deadline: o.responseDeadLine || '', place: ((o.placeOfPerformance || {}).city || {}).name || '', url: o.uiLink || '', description: (o.description || '').slice(0, 600),
    }));
    return opps.length ? { source: 'SAM.gov', opps } : { source: 'simulated (SAM empty)', opps: simulatedFeed() };
  } catch (e) { return { source: 'simulated (SAM error)', opps: simulatedFeed() }; }
}

// ── B. STRATEGIST — bid/no-bid score against the firm profile ───────────────────────────────────
async function score(op, prof) {
  const sys = `You are the GovCon Bid Analyst for this firm. Score one opportunity for bid/no-bid. Respond ONLY with JSON: {"match_score": 0-100, "recommendation": "bid"|"watch"|"no-bid", "rationale": "<=200 chars", "set_aside_fit": "strong"|"eligible"|"ineligible", "subcontractor_needed": boolean, "gaps": ["..."], "required_certs": ["..."]}. Be conservative and accurate: only claim set-aside fit the firm actually qualifies for. Firm profile:\n${prof}`;
  const r = await claude(sys, JSON.stringify(op), { tier: 'cheap', maxTokens: 400, agent: 'GOV-ANALYST' });
  let j = { match_score: 50, recommendation: 'watch', rationale: 'auto-scored (no model)', set_aside_fit: 'eligible', subcontractor_needed: true, gaps: [], required_certs: [] };
  const m = r.text && r.text.match(/\{[\s\S]*\}/);
  if (m) { try { j = { ...j, ...JSON.parse(m[0]) }; } catch { /* keep default */ } }
  return { ...j, _cost: r.cost || 0 };
}

// ── D. CLOSER — draft the proposal (FAR/DFARS-aware, leads with SDB/minority, 50% sub rule) ──────
async function draft(op, sc, prof) {
  const sys = `You are the GovCon Proposal Writer for this firm. Draft a proposal RESPONSE for the opportunity. Elite, compliant, concise. Sections: 1) Cover/Compliance summary (cite the set-aside and the firm's SDB/Minority/Hispanic status as the win theme), 2) Technical Approach, 3) Management Plan & Staffing, 4) Past Performance (note: new prime — emphasize PA registrations + disaster registry; if a subcontractor's past performance is provided below, cite it), 5) Subcontracting Plan (respect the 50% limit-on-subcontracting on small-business set-aside services; if a selected subcontractor + quote is provided, name them and reflect the quote in pricing/management), 6) FAR/DFARS compliance checklist (list the key clauses to verify, e.g. 52.219-14 Limitations on Subcontracting, 52.222 labor standards). End with "[HUMAN REVIEW REQUIRED — Vinicio signs & submits]". Markdown. Firm profile:\n${prof}`;
  // Fold in Hector's procurement package (selected sub + quote + past performance) if one was gathered.
  let extra = '';
  try { const pkg = JSON.parse(fs.readFileSync(procurementPath(op), 'utf8')); extra = `\n\nSELECTED SUBCONTRACTOR (cite their past performance + use their quote): ${pkg.sub} — quote: ${pkg.quote || 'TBD'}; past performance: ${pkg.past_performance || 'pending'}`; } catch { /* none gathered yet */ }
  const r = await claude(sys, `OPPORTUNITY:\n${JSON.stringify(op, null, 2)}\n\nSCORE/ANALYSIS:\n${JSON.stringify(sc, null, 2)}${extra}`, { tier: 'draft', maxTokens: 1800, agent: 'GOV-ANALYST' });
  return { md: r.text || '# (no draft — model unavailable)\n', cost: r.cost || 0 };
}

// ── orchestrate one scan end-to-end ─────────────────────────────────────────────────────────────
export async function runScan({ draftTopN = 1, source = 'manual' } = {}) {
  const prof = profile();
  await mirror('SAM-SCOUT', 'work', 'Scanning SAM.gov + PA portals for new opportunities…');
  await emit({ kind: 'action', actor: 'SAM-SCOUT', pod: 'gov', action: 'scan.start', rationale: `gov scan (${source})`, status: 'done' });

  const { opps, source: feed } = await scout();
  await emit({ kind: 'action', actor: 'SAM-SCOUT', pod: 'gov', action: 'scan.done', status: 'done', rationale: `${opps.length} opportunities from ${feed}`, payload: { count: opps.length, feed } });
  await mirror('SAM-SCOUT', 'idle', `Found ${opps.length} (${feed}). Handing to Patricia.`);

  // B. score each (cheap tier)
  await mirror('GOV-ANALYST', 'work', `Scoring ${opps.length} opportunities for bid/no-bid…`);
  const scored = [];
  let spend = 0;
  for (const op of opps) {
    const sc = await score(op, prof); spend += sc._cost || 0;
    scored.push({ op, sc });
    await emit({ kind: 'trace', actor: 'GOV-ANALYST', pod: 'gov', action: 'bid.score', cost_usd: sc._cost || 0, rationale: `${op.title} — ${sc.match_score}/100 (${sc.recommendation})`, payload: { noticeId: op.noticeId, score: sc.match_score, recommendation: sc.recommendation, set_aside_fit: sc.set_aside_fit, subcontractor_needed: sc.subcontractor_needed } });
  }
  scored.sort((a, b) => (b.sc.match_score || 0) - (a.sc.match_score || 0));

  // D. draft the top N "bid" candidates (draft tier) → save + HITL approval (gate the submit)
  fs.mkdirSync(DRAFTS, { recursive: true });
  const drafted = [];
  for (const { op, sc } of scored.filter((s) => s.sc.recommendation === 'bid').slice(0, draftTopN)) {
    await mirror('GOV-ANALYST', 'work', `Drafting proposal: ${op.title}`);
    const d = await draft(op, sc, prof); spend += d.cost || 0;
    const slug = (op.noticeId || op.title).replace(/[^\w]+/g, '-').slice(0, 50);
    const file = path.join('gov-drafts', `${slug}.md`);
    fs.writeFileSync(path.join(ROOT, file), `<!-- ${op.title} · ${op.url} · deadline ${op.deadline} -->\n\n${d.md}\n`);
    await emit({ kind: 'action', actor: 'GOV-ANALYST', pod: 'gov', action: 'proposal.draft', cost_usd: d.cost || 0, reversible: true, rationale: `drafted ${op.title}`, payload: { noticeId: op.noticeId, file } });
    // HITL gate — never auto-submit (doctrine §9 rule 2 + entity rule: Vinicio signs everything)
    await emit({ kind: 'approval.request', actor: 'GOV-ANALYST', pod: 'gov', action: 'submit', status: 'pending', reversible: false, rationale: `Proposal drafted for ${op.title} (score ${sc.match_score}). Review + sign + submit.`, payload: { noticeId: op.noticeId, file, deadline: op.deadline, subcontractor_needed: sc.subcontractor_needed } });
    await hqApproval({ pod: 'Gov War Room', title: `Review & submit: ${op.title}`, detail: `Score ${sc.match_score}/100 · deadline ${op.deadline} · draft saved to ${file}${sc.subcontractor_needed ? ' · needs a local subcontractor' : ''}`, xp: 50, verb: 'Open draft' });
    // Connector (Hector): if this bid needs subcontracted labor, draft the outreach now (you send it).
    if (sc.subcontractor_needed) { try { await maybeConnect({ op, sc }); } catch { /* connector best-effort */ } }
    drafted.push({ op, sc, file });
  }

  await mirror('GOV-ANALYST', drafted.length ? 'need' : 'idle', drafted.length ? `${drafted.length} proposal(s) ready for your review` : 'No bid-worthy opportunities this scan');
  if (spend > 0) await emit({ kind: 'action', actor: 'GOV-ANALYST', pod: 'gov', action: 'spend.log', cost_usd: 0, status: 'done', rationale: `gov scan AI spend ~$${spend.toFixed(4)}`, payload: { ai_spend_usd: Number(spend.toFixed(4)) } });

  const top = scored[0];
  return {
    feed, scanned: opps.length, drafted: drafted.length,
    top: top ? { title: top.op.title, score: top.sc.match_score, recommendation: top.sc.recommendation } : null,
    drafts: drafted.map((d) => d.file),
    summary: `Scanned ${opps.length} (${feed}); ${scored.filter((s) => s.sc.recommendation === 'bid').length} bid-worthy; drafted ${drafted.length}. Top: ${top ? top.op.title + ' (' + top.sc.match_score + ')' : 'none'}.`,
  };
}

if (process.argv[1] && process.argv[1].endsWith('worker.mjs')) {
  runScan({ source: 'cli' }).then((r) => { console.log(JSON.stringify(r, null, 2)); }).catch((e) => { console.error(e); process.exitCode = 1; });
}
