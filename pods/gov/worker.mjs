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
import { ROOT, DRAFTS, env, secret, profile, emit, mirror, hqApproval, gateApproval, claude, claudeBatch } from './lib.mjs';
import { noteWatch } from '../lib.mjs'; // Watcher Health Contract (L-013)
import { maybeConnect } from './connector.mjs';
import { procurementPath } from './replies.mjs';
import { checkCompliance } from './compliance.mjs';
import { improveUntilPass } from './remediate.mjs';
import { factsCheck, factsCheckSummary } from './facts-check.mjs';
import { isDescriptionUrl, fetchDescription, pullScopeOfWork, sowPath } from './sow.mjs';
import * as deals from './deals.mjs';

// ── Telegram push with INLINE BUTTONS (the "no more reply 1/2/3" fix) ───────────────────────────
// notifyTelegram (pods/lib.mjs) is text-only; per-opportunity Pursue/Pass buttons need reply_markup,
// so the worker carries its own tiny sender on the SAME raw bot-API pattern rather than widening the
// shared helper. Best-effort, never throws — a Telegram hiccup must never fail a scan.
async function tgPush(text, replyMarkup = null) {
  const token = env('TELEGRAM_BOT_TOKEN'); const chat = env('TELEGRAM_CHAT_ID');
  if (!token || !chat) return false;
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) }),
    });
    return r.ok;
  } catch { return false; }
}

// PURE: one opportunity brief (pods/gov/briefs.mjs shape) → the short per-opportunity message body:
// title · agency · fit · due date · one-line why. Exported so it can be eval-pinned later.
export function oppMessageText(b = {}) {
  const clip = (s, n = 180) => { const x = String(s || '').replace(/\s+/g, ' ').trim(); return x.length > n ? x.slice(0, n - 1).trimEnd() + '…' : x; };
  const lines = [String(b.title || 'Opportunity')];
  const meta = [b.agency, b.deadline ? `due ${String(b.deadline).slice(0, 10)}${b.daysLeft != null ? ` (${b.daysLeft}d)` : ''}` : ''].filter(Boolean);
  if (meta.length) lines.push(meta.join(' · '));
  lines.push(`Fit ${b.fit != null ? b.fit : '?'}/5 (${b.score != null ? b.score : '?'}/100)${b.winChance != null ? ` · win ~${b.winChance}%` : ''}`);
  const why = clip(b.strategy || b.lookingFor);
  if (why) lines.push(`Why: ${why}`);
  return lines.join('\n');
}

// The operator, verbatim: "I want an approve button per opportunity… and if I want all three, I approve
// all three." One SHORT intro, then one message PER opportunity with its own ✅ Pursue / ⏭ Pass inline
// buttons — NO exclusivity, every one of them can be pursued. The tap lands in the Telegram bridge
// (companion/telegram-bridge.mjs handleCallback: 'pursue:<noticeId>' → CP /maintenance/pursue;
// 'passopp:<noticeId>' → disposition). callback_data is capped at 64 bytes by Telegram, so a freak
// oversized noticeId falls back to a buttonless message instead of a rejected send.
async function pushOpportunityButtons(briefs = []) {
  if (!briefs.length) return false;
  const intro = await tgPush(`🎯 Top ${briefs.length} opportunit${briefs.length === 1 ? 'y' : 'ies'} today — tap Pursue on any (or all)`);
  if (!intro) return false; // Telegram unconfigured/down — don't half-send the digest
  for (const b of briefs) {
    const id = String(b.noticeId || '');
    const keyboard = id && ('passopp:' + id).length <= 64
      ? { inline_keyboard: [[{ text: '✅ Pursue', callback_data: 'pursue:' + id }, { text: '⏭ Pass', callback_data: 'passopp:' + id }]] }
      : null;
    await tgPush(oppMessageText(b) + (b.url ? `\n${b.url}` : ''), keyboard);
  }
  return true;
}

// ── A. SCOUT — find opportunities (real SAM.gov, fallback to a realistic simulated feed) ────────
function simulatedFeed() {
  return [
    { noticeId: 'SIM-W911-FortIndiantown', title: 'Custodial Services — Fort Indiantown Gap, PA', naics: '561720', setAside: 'Total Small Business', agency: 'Dept of the Army', deadline: '2026-07-10', place: 'Annville, PA', url: 'https://sam.gov/opp/SIM-W911', description: 'Recurring janitorial/custodial services for administrative buildings, ~85,000 sq ft, base year + 4 option years. Day porter + nightly cleaning.' },
    { noticeId: 'SIM-VA-Wilkes', title: 'Grounds Maintenance — VA Medical Center, Wilkes-Barre PA', naics: '561730', setAside: 'SDVOSB Set-Aside', agency: 'Dept of Veterans Affairs', deadline: '2026-07-02', place: 'Wilkes-Barre, PA', url: 'https://sam.gov/opp/SIM-VA', description: 'Grounds/landscaping, snow removal, seasonal. SDVOSB set-aside.' },
    { noticeId: 'SIM-GSA-Scranton', title: 'Facilities Support — Federal Building, Scranton PA', naics: '561210', setAside: 'Small Disadvantaged Business', agency: 'GSA', deadline: '2026-07-18', place: 'Scranton, PA', url: 'https://sam.gov/opp/SIM-GSA', description: 'Combined custodial + minor building maintenance + trash removal for a 6-story federal building. SDB set-aside.' },
  ];
}
// Real SAM.gov query. Two bugs used to force the simulated fallback: an 8-day window (empty most weeks)
// and passing all NAICS comma-joined (SAM returns 0 for a multi-NAICS ncode). Fix: query each NAICS
// SEPARATELY over a configurable window with zero-padded MM/dd/yyyy dates, then merge + dedupe by noticeId.
// Also captures the place-of-performance state so the map can drop a pin. Verified to surface 150+ real opps.
export async function scout() {
  const key = secret('SAM-SCOUT', 'SAM_API_KEY'); // least-privilege: only the scout may read the SAM key
  if (!key) return { source: 'simulated (no SAM_API_KEY)', opps: simulatedFeed() };
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (dt) => `${pad(dt.getMonth() + 1)}/${pad(dt.getDate())}/${dt.getFullYear()}`;
  const days = Math.max(1, Math.min(364, Number(env('SAM_LOOKBACK_DAYS', '30')) || 30));
  const cap = Math.max(1, Number(env('SAM_MAX_OPPS', '50')) || 50);
  const from = fmt(new Date(Date.now() - days * 864e5)), to = fmt(new Date());
  const naics = ['561720', '561210', '561990', '561730'];
  const seen = new Set(); const opps = []; let anyOk = false; let note = '';
  for (const nc of naics) {
    try {
      const url = `https://api.sam.gov/opportunities/v2/search?api_key=${key}&postedFrom=${encodeURIComponent(from)}&postedTo=${encodeURIComponent(to)}&ncode=${nc}&limit=50`;
      const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!r.ok) { note = `SAM ${r.status}`; continue; }
      anyOk = true;
      const data = await r.json();
      for (const o of (data.opportunitiesData || [])) {
        if (!o.noticeId || seen.has(o.noticeId)) continue;
        seen.add(o.noticeId);
        const pop = o.placeOfPerformance || {};
        // SAM v2's `description` is a URL to the noticedesc endpoint, NOT prose — keep it as a URL and
        // let runScan fetch the real text before scoring (the old code scored off a link string).
        const desc = String(o.description || '');
        opps.push({
          noticeId: o.noticeId, title: o.title, naics: o.naicsCode,
          setAside: o.typeOfSetAsideDescription || o.typeOfSetAside || 'none',
          agency: (o.fullParentPathName || '').split('.')[0] || o.organizationType || '',
          deadline: o.responseDeadLine || '', place: (pop.city || {}).name || '',
          placeState: (pop.state || {}).code || (pop.state || {}).name || '',
          url: o.uiLink || '',
          description: isDescriptionUrl(desc) ? '' : desc.slice(0, 600),
          descriptionUrl: isDescriptionUrl(desc) ? desc : '',
          resourceLinks: Array.isArray(o.resourceLinks) ? o.resourceLinks.slice(0, 12) : [],
          contactEmail: (o.pointOfContact && o.pointOfContact[0] && o.pointOfContact[0].email) || '', type: o.type || '',
        });
      }
    } catch (e) { note = 'SAM ' + e.message; }
  }
  if (opps.length) return { source: `SAM.gov (${opps.length} real, ${days}d)`, opps: opps.slice(0, cap) };
  return { source: anyOk ? 'simulated (SAM empty)' : `simulated (${note || 'SAM error'})`, opps: simulatedFeed() };
}

// ── B. STRATEGIST — bid/no-bid score against the firm profile ───────────────────────────────────
const scoreSys = (prof) => `You are the GovCon Bid Analyst for this firm. Score one opportunity for bid/no-bid. Respond ONLY with JSON: {"match_score": 0-100, "recommendation": "bid"|"watch"|"no-bid", "rationale": "<=200 chars", "set_aside_fit": "strong"|"eligible"|"ineligible", "subcontractor_needed": boolean, "gaps": ["..."], "required_certs": ["..."]}. Be conservative and accurate: only claim set-aside fit the firm actually qualifies for. Firm profile:\n${prof}`;
const SCORE_FALLBACK = { match_score: 50, recommendation: 'watch', rationale: 'auto-scored (no model)', set_aside_fit: 'eligible', subcontractor_needed: true, gaps: [], required_certs: [] };
export function parseScore(text) {
  const m = text && text.match(/\{[\s\S]*\}/);
  if (m) { try { return { ...SCORE_FALLBACK, ...JSON.parse(m[0]) }; } catch { /* keep fallback */ } }
  return { ...SCORE_FALLBACK };
}

// ── D. CLOSER — draft the proposal (FAR/DFARS-aware, leads with SDB/minority, 50% sub rule) ──────
async function draft(op, sc, prof) {
  const sys = `You are the GovCon Proposal Writer for this firm. Draft a proposal RESPONSE for the opportunity. Elite, compliant, concise. Sections: 1) Cover/Compliance summary (cite the set-aside and the firm's SDB/Minority/Hispanic status as the win theme), 2) Technical Approach, 3) Management Plan & Staffing, 4) Past Performance (note: new prime — emphasize PA registrations + disaster registry; if a subcontractor's past performance is provided below, cite it), 5) Subcontracting Plan (respect the 50% limit-on-subcontracting on small-business set-aside services; if a selected subcontractor + quote is provided, name them and reflect the quote in pricing/management), 6) FAR/DFARS compliance checklist (list the key clauses to verify, e.g. 52.219-14 Limitations on Subcontracting, 52.222 labor standards). End with "[HUMAN REVIEW REQUIRED — Vinicio signs & submits]". Markdown. Firm profile:\n${prof}`;
  // Fold in Hector's procurement package (selected sub + quote + past performance + CODE-priced bid).
  let extra = '';
  try {
    const pkg = JSON.parse(fs.readFileSync(procurementPath(op), 'utf8'));
    extra = `\n\nSELECTED SUBCONTRACTOR (cite their past performance + use their quote): ${pkg.sub} — quote: ${pkg.quote || 'TBD'}; past performance: ${pkg.past_performance || 'pending'}`;
    if (pkg.pricing) extra += `\nBID PRICE (computed in code — use THIS number, do not invent pricing): ${pkg.pricing.line || `$${pkg.pricing.bid}`}`;
  } catch { /* none gathered yet */ }
  // Fold in the REAL scope of work if the scout pulled it — the proposal must answer the requirement.
  let sowTxt = '';
  try { sowTxt = fs.readFileSync(sowPath(op), 'utf8').slice(0, 6000); } catch { /* not pulled */ }
  const sowBlock = sowTxt ? `\n\nSCOPE OF WORK (pulled from SAM — answer THIS, not the headline):\n${sowTxt}` : '';
  const r = await claude(sys, `OPPORTUNITY:\n${JSON.stringify(op, null, 2)}\n\nSCORE/ANALYSIS:\n${JSON.stringify(sc, null, 2)}${extra}${sowBlock}`, { tier: 'draft', maxTokens: 1800, agent: 'GOV-ANALYST' });
  return { md: r.text || '# (no draft — model unavailable)\n', cost: r.cost || 0 };
}

// ── orchestrate one scan end-to-end ─────────────────────────────────────────────────────────────
export async function runScan({ draftTopN = 1, source = 'manual' } = {}) {
  const prof = profile();
  await mirror('SAM-SCOUT', 'work', 'Scanning SAM.gov + PA portals for new opportunities…');
  await emit({ kind: 'action', actor: 'SAM-SCOUT', pod: 'gov', action: 'scan.start', rationale: `gov scan (${source})`, status: 'done' });

  const { opps, source: feed } = await scout();
  await emit({ kind: 'action', actor: 'SAM-SCOUT', pod: 'gov', action: 'scan.done', status: 'done', rationale: `${opps.length} opportunities from ${feed}`, payload: { count: opps.length, feed } });
  // Watcher Health (L-013): an empty feed means the SAM/PA connector may be DOWN (BLIND), not a real
  // "nothing out there" all-clear. newItems:0 — finding opps is the board's job to surface, not a push;
  // noteWatch only alerts a sensor-health problem (transition-aware, so no spam while it stays down).
  noteWatch('gov-scout', { newItems: 0, controlProbeOk: Array.isArray(opps) && opps.length > 0 });

  // Fill in REAL descriptions before anyone scores anything — SAM v2's `description` is a URL, and until
  // this step the analysts were literally scoring a link string. Free SAM fetches, 5 at a time.
  const samKey = secret('SAM-SCOUT', 'SAM_API_KEY');
  if (samKey) {
    const need = opps.filter((o) => o.descriptionUrl && !o.description);
    for (let i = 0; i < need.length; i += 5) {
      await Promise.all(need.slice(i, i + 5).map(async (o) => {
        const d = await fetchDescription(o, samKey);
        if (d.text) o.description = d.text.slice(0, 1500);
      }));
    }
  }
  await mirror('SAM-SCOUT', 'idle', `Found ${opps.length} (${feed}). Handing to Patricia.`);

  // B. score each (cheap tier) — ONE Message Batches call for the whole feed (50% off + processed in
  // parallel server-side, vs the old one-at-a-time loop). The same system prompt repeats per item, and
  // anything the batch can't serve falls back to the normal per-op chain inside claudeBatch. The 10-min
  // timeout keeps a manual "scan now" bounded: on timeout the batch is cancelled (unfinished = unbilled)
  // and the stragglers are scored live.
  await mirror('GOV-ANALYST', 'work', `Scoring ${opps.length} opportunities for bid/no-bid…`);
  const sys = scoreSys(prof);
  const results = await claudeBatch(opps.map((op) => ({ system: sys, user: JSON.stringify(op) })), { tier: 'cheap', maxTokens: 400, agent: 'GOV-ANALYST', timeoutMs: 10 * 60000 });
  const scored = [];
  let spend = 0;
  for (let i = 0; i < opps.length; i++) {
    const op = opps[i];
    const r = results[i] || {};
    const sc = { ...parseScore(r.text), _cost: r.cost || 0 };
    spend += sc._cost;
    scored.push({ op, sc });
    await emit({ kind: 'trace', actor: 'GOV-ANALYST', pod: 'gov', action: 'bid.score', cost_usd: sc._cost || 0, rationale: `${op.title} — ${sc.match_score}/100 (${sc.recommendation})`, payload: { noticeId: op.noticeId, title: op.title, score: sc.match_score, recommendation: sc.recommendation, set_aside_fit: sc.set_aside_fit, setAside: op.setAside, subcontractor_needed: sc.subcontractor_needed, place: op.place, placeState: op.placeState, deadline: op.deadline, url: op.url, agency: op.agency, description: (op.description || '').slice(0, 400), rationale_fit: sc.rationale } });
  }
  scored.sort((a, b) => (b.sc.match_score || 0) - (a.sc.match_score || 0));

  // The DEAL LEDGER: every scored opp gets an explicit deal record on the linear middleman line, so the
  // operator can always answer "where does this one stand and what's missing?" (deals.dealGaps).
  for (const { op, sc } of scored) {
    try {
      deals.upsertDeal(op.noticeId, {
        title: op.title, agency: op.agency, place: op.place, placeState: op.placeState,
        deadline: op.deadline, url: op.url, setAside: op.setAside, naics: op.naics,
        score: sc.match_score, recommendation: sc.recommendation, subNeeded: sc.subcontractor_needed !== false,
        stage: 'scored', stageNote: `${sc.match_score}/100 (${sc.recommendation})`,
      });
    } catch { /* ledger is best-effort — the scan never fails on bookkeeping */ }
  }

  // Pull the REAL scope of work (full description + attachment list) for the bid-worthy BEFORE drafting,
  // so proposals answer the actual requirement, not the headline. Free SAM fetches, top 5 per scan.
  if (samKey) {
    for (const { op } of scored.filter((s) => s.sc.recommendation === 'bid').slice(0, 5)) {
      const sow = await pullScopeOfWork(op, samKey);
      if (sow.ok) {
        try { deals.upsertDeal(op.noticeId, { stage: 'sow_pulled', stageNote: sow.file, sow: { pulled: true, file: sow.file, attachments: sow.attachments.length } }); } catch { /* */ }
        await emit({ kind: 'action', actor: 'SAM-SCOUT', pod: 'gov', action: 'sow.pull', status: 'done', reversible: true, rationale: `SOW pulled for ${op.title} (${sow.attachments.length} attachment(s))`, payload: { noticeId: op.noticeId, file: sow.file, attachments: sow.attachments.length } });
      }
    }
  }

  // PRE-BUILD the compliance matrix (attachment-aware) for the bid-worthy so it's ready the moment the
  // operator opens the opp. Reuses matrixForOp — reads the attachments we just pulled, runs the grounded AI
  // reader on the free brain, writes the artifact. Analysis only; best-effort; a failure never fails the scan.
  if (samKey) {
    for (const { op } of scored.filter((s) => s.sc.recommendation === 'bid').slice(0, 5)) {
      try {
        const { matrixForOp } = await import('./matrix.mjs');
        const mx = await matrixForOp(op, { key: samKey });
        if (mx.ok && mx.summary.total) {
          try { deals.upsertDeal(op.noticeId, { matrix: { coveragePct: mx.summary.coveragePct, gaps: mx.summary.gap, attachments: mx.attachments, file: mx.file } }); } catch { /* ledger best-effort */ }
          await emit({ kind: 'action', actor: 'GOV-ANALYST', pod: 'gov', action: 'matrix.build', status: 'done', reversible: true, rationale: `Compliance matrix: ${mx.summary.coveragePct}% coverage, ${mx.summary.gap} gap(s) across ${mx.summary.total} req(s) (${mx.attachments} attachment(s) read)`, payload: { noticeId: op.noticeId, coveragePct: mx.summary.coveragePct, gaps: mx.summary.gap, attachments: mx.attachments, file: mx.file } });
        }
      } catch { /* matrix pre-build is best-effort */ }
    }
  }

  // Mirror the actionable pipeline (bid + watch) into the Notion company brain. Fire-and-forget, sequential
  // to respect Notion's rate limit, capped, and graceful (no key / page not shared → skips silently).
  import('../notion.mjs').then(async (N) => {
    for (const { op, sc } of scored.filter((s) => s.sc.recommendation !== 'no-bid').slice(0, 20)) await N.syncOpportunity(op, sc);
  }).catch(() => { /* notion optional */ });

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
    // VERIFY + SELF-HEAL before the gate: diagnose WHY compliance would fail, HONESTLY fix the soft gaps,
    // re-check, and loop until PASS — or ESCALATE if a gap can only be fixed by lying (doctrine §0, never
    // fabricate). Best-effort: any failure falls back to the plain single checkCompliance below.
    let comp = null, heal = null;
    try { heal = await improveUntilPass({ op, draft: d.md }); } catch { heal = null; }
    if (heal) {
      comp = { verdict: heal.verdict, summary: heal.escalated ? (heal.hardGaps ? heal.hardGaps.map((g) => g.issue).filter(Boolean).join('; ') : (heal.reason || 'needs your decision')) : 'auto-healed to ' + heal.verdict, needs_sub_past_performance: false };
      // If the loop improved the draft, overwrite the STAGED file (reversible, still behind the submit gate).
      const changed = (heal.log || []).flatMap((r) => r.changes || []);
      if (changed.length && heal.draft && heal.draft !== d.md) {
        fs.writeFileSync(path.join(ROOT, file), `<!-- ${op.title} · ${op.url} · deadline ${op.deadline} -->\n\n${heal.draft}\n`);
        d.md = heal.draft;
        await emit({ kind: 'action', actor: 'GOV-ANALYST', pod: 'gov', action: 'compliance.remediated', reversible: true, status: 'done', rationale: `Auto-fixed ${changed.length} compliance gap(s): ${[...new Set(changed.map((c) => c.code))].join(', ')}`, payload: { noticeId: op.noticeId, changes: changed } });
      }
      // A hard gap the loop refused to touch → this needs the OPERATOR's decision, not a rubber-stamp.
      if (heal.escalated && heal.hardGaps && heal.hardGaps.length) {
        await emit({ kind: 'action', actor: 'GOV-ANALYST', pod: 'gov', action: 'compliance.escalated', status: 'error', reversible: true, rationale: `Compliance needs YOUR decision (not auto-fixable): ${heal.hardGaps.map((g) => g.issue).filter(Boolean).join('; ')}`, payload: { noticeId: op.noticeId, hardGaps: heal.hardGaps } });
      }
    } else {
      comp = await checkCompliance({ op, draft: d.md }); spend += comp._cost || 0;
    }
    const hardEscalation = !!(heal && heal.escalated && heal.hardGaps && heal.hardGaps.length);
    await emit({ kind: 'action', actor: 'GOV-ANALYST', pod: 'gov', action: 'compliance.check', reversible: true, status: comp.verdict === 'FAIL' || hardEscalation ? 'error' : 'done', rationale: `Compliance ${comp.verdict}: ${comp.summary}`, payload: { noticeId: op.noticeId, verdict: comp.verdict, needs_sub_past_performance: !!comp.needs_sub_past_performance, hardGaps: hardEscalation ? heal.hardGaps : undefined } });
    if (comp.verdict === 'FAIL' || hardEscalation) await mirror('GOV-ANALYST', 'need', `⚠ Compliance ${hardEscalation ? 'needs your decision' : 'risk'} on ${op.title}: ${comp.summary}`);
    // LAST-STEP FACTS GUARD (doctrine Canonical Facts + Lessons L-005/L-006/L-007): scan the draft for
    // identity/certification claims Rodgate does NOT hold. Code disposes — a hit is flagged on the gate so
    // the human fixes it BEFORE staging. Jarvis never sends, so this can't leak, but it stops the near-miss.
    const facts = factsCheck(d.md);
    if (!facts.ok) {
      await emit({ kind: 'action', actor: 'GOV-ANALYST', pod: 'gov', action: 'facts.violation', status: 'error', reversible: true, rationale: factsCheckSummary(facts), payload: { noticeId: op.noticeId, file, violations: facts.violations } });
      await mirror('GOV-ANALYST', 'need', `⚠ FACTS-CHECK on ${op.title}: ${facts.violations.map((v) => v.rule).join('; ')}`);
    } else {
      await emit({ kind: 'trace', actor: 'GOV-ANALYST', pod: 'gov', action: 'facts.check', status: 'done', rationale: '✓ facts-check clean', payload: { noticeId: op.noticeId } });
    }
    // HITL gate — never auto-submit (doctrine §9 rule 2 + entity rule: Vinicio signs everything). When the
    // self-heal loop hit a HARD gap, the gate says this needs the operator's DECISION (no-bid / teaming /
    // real past performance) rather than looking submit-ready.
    const decisionRationale = hardEscalation
      ? `Proposal for ${op.title} needs YOUR decision before it can go anywhere — not auto-fixable without fabricating: ${comp.summary}. Options: no-bid, team with a prime, or provide real past performance.`
      : `Proposal drafted for ${op.title} (score ${sc.match_score}). Compliance: ${comp.verdict}${comp.summary ? ' — ' + comp.summary : ''}. Facts: ${facts.ok ? 'clean' : 'FAILED — ' + facts.violations.map((v) => v.rule).join('; ')}. Review + sign + submit.`;
    await gateApproval(
      { kind: 'approval.request', actor: 'GOV-ANALYST', pod: 'gov', action: 'submit', status: 'pending', reversible: false, rationale: decisionRationale, payload: { noticeId: op.noticeId, file, deadline: op.deadline, subcontractor_needed: sc.subcontractor_needed, compliance: comp.verdict, needs_decision: hardEscalation, hardGaps: hardEscalation ? heal.hardGaps : undefined, facts: facts.ok ? 'clean' : 'FAILED', factsViolations: facts.violations } },
      { pod: 'Gov War Room', title: hardEscalation ? `⚠ Your decision needed: ${op.title}` : `Review & submit: ${op.title}`, detail: `Score ${sc.match_score}/100 · 🛡 ${comp.verdict}${comp.summary ? ' (' + comp.summary + ')' : ''}${hardEscalation ? ' · ⚠ NEEDS YOUR DECISION (no-bid / team / real past performance)' : ''}${facts.ok ? '' : ' · ⚠ FACTS-CHECK FAILED — fix before sending'} · deadline ${op.deadline} · ${file}${sc.subcontractor_needed ? ' · needs a local subcontractor' : ''}`, xp: 50, verb: 'Open draft' });
    try { deals.upsertDeal(op.noticeId, { stage: 'proposal_ready', proposalFile: file, pendingSubmit: true, stageNote: 'proposal drafted — awaiting your sign-off' }); } catch { /* ledger best-effort */ }
    // Connector (Hector): if this bid needs subcontracted labor, draft the outreach now (you send it).
    if (sc.subcontractor_needed) { try { await maybeConnect({ op, sc }); } catch { /* connector best-effort */ } }
    drafted.push({ op, sc, file });
  }

  await mirror('GOV-ANALYST', drafted.length ? 'need' : 'idle', drafted.length ? `${drafted.length} proposal(s) ready for your review` : 'No bid-worthy opportunities this scan');
  if (spend > 0) await emit({ kind: 'action', actor: 'GOV-ANALYST', pod: 'gov', action: 'spend.log', cost_usd: 0, status: 'done', rationale: `gov scan AI spend ~$${spend.toFixed(4)}`, payload: { ai_spend_usd: Number(spend.toFixed(4)) } });

  // Send the operator a FEW quality opportunities (not a flood) — one message PER opportunity with its
  // own ✅ Pursue / ⏭ Pass buttons (no more "reply 1, 2 or 3"): tap any, or tap all. Best-effort.
  const bidWorthy = scored.filter((s) => s.sc.recommendation === 'bid').length;
  if (bidWorthy > 0) {
    try {
      const B = await import('./briefs.mjs');
      const { briefs } = await B.buildBriefs({ topN: 3 });
      if (briefs.length) {
        const pushed = await pushOpportunityButtons(briefs);
        if (pushed) await emit({ kind: 'action', actor: 'GOV-ANALYST', pod: 'gov', action: 'briefs.push', status: 'done', rationale: `Sent the top ${briefs.length} opportunities to your phone (Pursue/Pass buttons)`, payload: { count: briefs.length, source } });
      }
    } catch { /* digest is best-effort — the board still has everything */ }
  }

  const top = scored[0];
  return {
    feed, scanned: opps.length, drafted: drafted.length,
    top: top ? { title: top.op.title, score: top.sc.match_score, recommendation: top.sc.recommendation } : null,
    drafts: drafted.map((d) => d.file),
    summary: `Scanned ${opps.length} (${feed}); ${scored.filter((s) => s.sc.recommendation === 'bid').length} bid-worthy; drafted ${drafted.length}. Top: ${top ? top.op.title + ' (' + top.sc.match_score + ')' : 'none'}.`,
  };
}

// PURSUE one opportunity on demand (the operator tapped "Pursue this"): draft a proposal for it now and
// raise the same gated submit approval, plus kick off sub outreach if it needs labor. `op` is the known
// opportunity (from the cockpit); `sc` is optional (reconstructed from the score if absent).
export async function pursueOpportunity({ op = {}, sc = null } = {}) {
  // A Telegram Pursue button can carry ONLY the noticeId (Telegram caps callback_data at 64 bytes), so
  // the CP forwards a bare {noticeId} — hydrate title/agency/deadline/url/score from the deal ledger,
  // where every scanned opportunity already lives (deals.upsertDeal in runScan). Caller fields still win.
  if (op && op.noticeId && !op.title) {
    try { const known = deals.getDeal(op.noticeId); if (known) op = { ...known, ...op }; } catch { /* ledger best-effort */ }
  }
  if (!op || !op.title) return { ok: false, error: 'opportunity required (unknown noticeId — not in the deal ledger)' };
  const prof = profile();
  const scoreObj = sc || {
    match_score: Number(op.score != null ? op.score : 70) || 70,
    recommendation: op.recommendation || 'bid',
    subcontractor_needed: op.subNeeded != null ? op.subNeeded : true,
    set_aside_fit: op.set_aside_fit || 'eligible',
  };
  await mirror('GOV-ANALYST', 'work', `Pursuing — drafting proposal: ${op.title}`);
  const d = await draft(op, scoreObj, prof);
  fs.mkdirSync(DRAFTS, { recursive: true });
  const slug = (op.noticeId || op.title).replace(/[^\w]+/g, '-').slice(0, 50);
  const file = path.join('gov-drafts', `${slug}.md`);
  fs.writeFileSync(path.join(ROOT, file), `<!-- ${op.title} · ${op.url || ''} · deadline ${op.deadline || ''} -->\n\n${d.md}\n`);
  await emit({ kind: 'action', actor: 'GOV-ANALYST', pod: 'gov', action: 'proposal.draft', cost_usd: d.cost || 0, reversible: true, rationale: `drafted ${op.title} (you pursued it)`, payload: { noticeId: op.noticeId, file } });
  // Same self-heal loop as the scan path: diagnose → honestly fix soft gaps → re-check → escalate hard gaps.
  let comp = null, heal = null;
  try { heal = await improveUntilPass({ op, draft: d.md }); } catch { heal = null; }
  if (heal) {
    comp = { verdict: heal.verdict, summary: heal.escalated ? (heal.hardGaps ? heal.hardGaps.map((g) => g.issue).filter(Boolean).join('; ') : (heal.reason || 'needs your decision')) : 'auto-healed to ' + heal.verdict };
    const changed = (heal.log || []).flatMap((r) => r.changes || []);
    if (changed.length && heal.draft && heal.draft !== d.md) {
      fs.writeFileSync(path.join(ROOT, file), `<!-- ${op.title} · ${op.url || ''} · deadline ${op.deadline || ''} -->\n\n${heal.draft}\n`);
      d.md = heal.draft;
      await emit({ kind: 'action', actor: 'GOV-ANALYST', pod: 'gov', action: 'compliance.remediated', reversible: true, status: 'done', rationale: `Auto-fixed ${changed.length} compliance gap(s): ${[...new Set(changed.map((c) => c.code))].join(', ')}`, payload: { noticeId: op.noticeId, changes: changed } });
    }
    if (heal.escalated && heal.hardGaps && heal.hardGaps.length) {
      await emit({ kind: 'action', actor: 'GOV-ANALYST', pod: 'gov', action: 'compliance.escalated', status: 'error', reversible: true, rationale: `Compliance needs YOUR decision (not auto-fixable): ${heal.hardGaps.map((g) => g.issue).filter(Boolean).join('; ')}`, payload: { noticeId: op.noticeId, hardGaps: heal.hardGaps } });
    }
  } else {
    comp = await checkCompliance({ op, draft: d.md });
  }
  const hardEscalation = !!(heal && heal.escalated && heal.hardGaps && heal.hardGaps.length);
  await emit({ kind: 'action', actor: 'GOV-ANALYST', pod: 'gov', action: 'compliance.check', reversible: true, status: comp.verdict === 'FAIL' || hardEscalation ? 'error' : 'done', rationale: `Compliance ${comp.verdict}: ${comp.summary}`, payload: { noticeId: op.noticeId, verdict: comp.verdict, hardGaps: hardEscalation ? heal.hardGaps : undefined } });
  await gateApproval(
    { kind: 'approval.request', actor: 'GOV-ANALYST', pod: 'gov', action: 'submit', status: 'pending', reversible: false, rationale: hardEscalation ? `Proposal for ${op.title} (you pursued it) needs YOUR decision — not auto-fixable without fabricating: ${comp.summary}. Options: no-bid, team with a prime, or provide real past performance.` : `Proposal drafted for ${op.title} (you pursued it). Compliance: ${comp.verdict}${comp.summary ? ' — ' + comp.summary : ''}. Review + sign + submit.`, payload: { noticeId: op.noticeId, file, deadline: op.deadline, subcontractor_needed: scoreObj.subcontractor_needed, compliance: comp.verdict, needs_decision: hardEscalation, hardGaps: hardEscalation ? heal.hardGaps : undefined } },
    { pod: 'Gov War Room', title: hardEscalation ? `⚠ Your decision needed: ${op.title}` : `Review & submit: ${op.title}`, detail: `Pursued by you · 🛡 ${comp.verdict}${comp.summary ? ' (' + comp.summary + ')' : ''}${hardEscalation ? ' · ⚠ NEEDS YOUR DECISION' : ''} · draft ${file}`, xp: 50, verb: 'Open draft' });
  try { deals.upsertDeal(op.noticeId, { title: op.title, agency: op.agency, deadline: op.deadline, url: op.url, setAside: op.setAside, score: scoreObj.match_score, recommendation: 'bid', subNeeded: scoreObj.subcontractor_needed !== false, stage: 'proposal_ready', proposalFile: file, pendingSubmit: true, stageNote: 'pursued by you — proposal drafted' }); } catch { /* ledger best-effort */ }
  if (scoreObj.subcontractor_needed) { try { await maybeConnect({ op, sc: scoreObj }); } catch { /* connector best-effort */ } }
  await mirror('GOV-ANALYST', 'need', `Proposal drafted (pursued): ${op.title} — review & submit`);
  return { ok: true, file, noticeId: op.noticeId };
}

if (process.argv[1] && process.argv[1].endsWith('worker.mjs')) {
  runScan({ source: 'cli' }).then((r) => { console.log(JSON.stringify(r, null, 2)); }).catch((e) => { console.error(e); process.exitCode = 1; });
}
