// bid-brief.mjs — the BID BRIEF one-pager (REDOS Port #3). REDOS's branded PDF report, ported: a single-page
// go/no-go brief that pulls together everything the pod already computes — the opportunity, the Bid Fit verdict,
// the Bid Coach play, the likely incumbent + recompete window, the compliance-matrix gaps, and Rodgate's
// capability / past performance. Uses: pitch a sub or prime to team, internal go/no-go sign-off, a paper trail.
// "The report markets you when shared" — a clean brief makes Rodgate look bigger than a solo shop. Renders to a
// printable page via pdf.mjs. Doctrine: honest — no fabricated past performance; Vinicio prices + signs every bid.
import { COMPANY } from './company.mjs';

// PURE (eval-pinned): assemble the brief as Markdown from already-computed pieces. Never throws.
export function renderBidBrief({ opp = {}, fit = {}, coach = [], incumbent = null, recompete = null, matrix = null, pastPerformance = [], price = '' } = {}) {
  const L = [];
  L.push(`# Bid Brief — ${opp.title || 'Opportunity'}`);
  L.push(`**${COMPANY.legalName}** — SDB · Minority · Hispanic-owned small business (self-certified) · UEI ${COMPANY.uei} · CAGE ${COMPANY.cage}`);
  L.push('');

  L.push('## Opportunity');
  const facts = [opp.agency && `Agency: ${opp.agency}`, opp.naics && `NAICS: ${opp.naics}`, opp.setAside && `Set-aside: ${opp.setAside}`,
    opp.deadline && `Response due: ${String(opp.deadline).slice(0, 10)}`, (opp.place || opp.placeState) && `Place: ${opp.place || opp.placeState}`,
    Number(opp.value) > 0 && `Est. value: $${Number(opp.value).toLocaleString()}`].filter(Boolean);
  for (const f of facts) L.push(`- ${f}`);
  if (opp.url) L.push(`- ${opp.url}`);
  L.push('');

  L.push('## Bid Fit');
  L.push(`**${fit.verdict || '—'} · ${Number(fit.score) || 0}/100**${fit.note ? ` — ${fit.note}` : ''}`);
  if (matrix && matrix.total) L.push(`Compliance matrix: **${matrix.coveragePct}% coverage · ${matrix.gap} gap${matrix.gap === 1 ? '' : 's'}** across ${matrix.total} requirements.`);
  L.push('');

  if (Array.isArray(coach) && coach.length) {
    L.push('## The play');
    for (const c of coach) L.push(`- ${c.icon || ''} ${c.text}`.trim());
    L.push('');
  }

  if (incumbent && incumbent.recipient) {
    L.push('## Incumbent & recompete');
    L.push(`- Likely incumbent: **${incumbent.recipient}**${Number(incumbent.amount) > 0 ? ` (~$${Number(incumbent.amount).toLocaleString()})` : ''} _(best signal from award data — not confirmed)_`);
    if (recompete && recompete.note) L.push(`- ${recompete.note}`);
    L.push('');
  }

  if (price) { L.push('## Price'); L.push(`- ${price}`); L.push('_(estimate — Vinicio prices the final bid)_'); L.push(''); }

  L.push('## Capability & past performance');
  const pp = (Array.isArray(pastPerformance) ? pastPerformance : []).filter((r) => r && !r.needsReview && (r.title || r.agency));
  if (pp.length) for (const p of pp) L.push(`- ${[p.title, p.agency, Number(p.value) > 0 && '$' + Number(p.value).toLocaleString(), p.periodEnd].filter(Boolean).join(' · ')}`);
  else L.push('- Newer prime — lead with active SAM + PA COSTARS registrations and the sub\'s past performance; the SDB / Minority / Hispanic-owned status is the win theme. (Do NOT claim experience Rodgate doesn\'t hold.)');
  L.push(`- Core competencies: ${COMPANY.competencies.slice(0, 4).join(' · ')}`);
  L.push('');

  L.push('---');
  L.push('_Internal go/no-go brief prepared by Jarvis. Numbers are estimates; Vinicio prices and signs every bid. Nothing here is a commitment or a submission._');
  return L.join('\n');
}

// Best-effort orchestrator: gather the pieces for one opp and render the brief. Never throws. Returns
// { markdown, html?, data }. html (printable, via pdf.mjs) is included when pdf.mjs is available.
export async function bidBriefFor(op = {}, { key } = {}) {
  const data = { opp: { title: op.title, agency: op.agency, naics: op.naics, setAside: op.setAside, deadline: op.deadline, place: op.place || op.placeState, value: op.value, url: op.url }, fit: {}, coach: [], pastPerformance: [] };
  try { const BF = await import('./bid-fit.mjs'); data.fit = BF.bidFit(op); data.coach = BF.bidCoach(op).coach; } catch { /* */ }
  try { const I = await import('./incumbent.mjs'); const r = await I.incumbentFor(op); if (r && r.ok) { data.incumbent = r.incumbent; data.recompete = r.recompete; } } catch { /* */ }
  try { const Lb = await import('./library.mjs'); data.pastPerformance = Lb.libraryFor(op).pastPerformance || []; } catch { /* */ }
  try { const M = await import('./matrix.mjs'); const mx = await M.matrixForOp(op, { key }); if (mx && mx.ok && mx.summary && mx.summary.total) data.matrix = mx.summary; } catch { /* */ }
  const markdown = renderBidBrief(data);
  let html = '';
  try { const P = await import('./pdf.mjs'); html = P.proposalDoc(markdown, { title: `Bid Brief — ${op.title || op.noticeId || ''}`, label: 'BID BRIEF' }); } catch { /* pdf optional */ }
  return { ok: true, markdown, html, data };
}
