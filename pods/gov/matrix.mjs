// matrix.mjs — the COMPLIANCE MATRIX (requirements traceability matrix). A gov proposal that fails to
// address a single "shall/must" requirement is NON-RESPONSIVE → disqualified before it is ever scored.
// compliance.mjs gives a HOLISTIC verdict (PASS/RISK/FAIL); this is the complementary, line-by-line PROOF:
// every requirement in the SOW mapped to the exact place the draft answers it — and, honestly, the ones it
// does NOT (a GAP). This is analysis + an artifact generator: it NEVER sends/submits/spends, and it NEVER
// fabricates coverage — an unaddressed requirement is shown as a GAP with an EMPTY citation, never a made-up one.
//
// Doctrine: LLM proposes, CODE disposes. There is NO model in the hot path here — requirement extraction and
// coverage mapping are PURE, deterministic, and eval-pinned (regex + keyword-overlap), so the matrix cannot
// hallucinate a requirement into "addressed." The only best-effort/network step is resolving the SOW text
// (reuses sow.mjs) when it isn't already on disk; that degrades to an empty matrix, it never throws.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ROOT } from './lib.mjs';
import { sowPath, pullScopeOfWork } from './sow.mjs';

export const MATRIX_DIR = path.join(ROOT, 'gov-drafts', 'matrix');

// Same slug rule as sow.mjs / worker.mjs so one notice → one predictable filename across the pod.
const slug = (op) => String((op && (op.noticeId || op.title)) || 'op').replace(/[^\w]+/g, '-').slice(0, 50);
export const matrixPath = (op) => path.join(MATRIX_DIR, `${slug(op)}.md`);

// ── PURE: requirement language. A statement is a REQUIREMENT only if it carries obligation wording. ──
// Over-extracting a non-requirement would clutter the matrix; missing a real "shall" is the dangerous
// failure, so the pattern is deliberately broad on the obligation verbs the FAR/SOWs actually use.
const REQ_RE = /\b(shall|must|is required to|are required to|will be required|contractor\s+(shall|will|must|is\s+responsible)|responsible for|at a minimum|required to|no later than|shall provide|shall maintain|shall ensure)\b/i;

// ── PURE: keyword-heuristic category bucket. ORDERED — first match wins — so "must maintain insurance"
// lands in insurance/bonding before the generic buckets, and "provide qualified staff" lands in staffing.
const CATEGORY_RULES = [
  ['insurance/bonding',      /\b(insuranc\w*|bond\w*|liabilit\w*|indemnif\w*|workers?[-\s]?comp\w*|coverage|surety|coi)\b/i],
  ['security/clearance',     /\b(security|clearance|cleared|background\s+check|badg\w*|escort\w*|fingerprint\w*|e[-\s]?verify)\b/i],
  ['safety',                 /\b(safety|osha|hazard\w*|ppe|msds|sds|accident\w*|incident\w*)\b/i],
  ['staffing/labor',         /\b(staff\w*|personnel|employ\w*|labor|workforce|technician\w*|supervisor\w*|foreman|hir(e|ing)|wage\w*|davis[-\s]?bacon)\b/i],
  ['supplies/equipment',     /\b(suppl(y|ies)|equipment|material\w*|tools?|consumabl\w*|chemical\w*)\b/i],
  ['quality/QC',             /\b(quality|qc|qcp|inspection\w*|inspect|standard\w*|deficienc\w*)\b/i],
  ['reporting/deliverables', /\b(report\w*|deliverable\w*|submit\w*|documentation|invoic\w*|written\s+(notice|report)|log|records?)\b/i],
  ['schedule/hours',         /\b(schedul\w*|hours|shift\w*|no\s+later\s+than|timeframe|daily|weekly|monthly|frequenc\w*|period\s+of\s+performance)\b/i],
];
export function categorize(text = '') {
  for (const [cat, re] of CATEGORY_RULES) if (re.test(text)) return cat;
  return 'general';
}

// The section axis (orthogonal to `category`): L=submission instructions, M=evaluation factors,
// C=SOW/deliverables, form=required form/registration. `general` is the fallback for regex-extracted reqs.
export const ALLOWED_SECTIONS = new Set(['L', 'M', 'C', 'form']);
const normQ = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

// PURE anti-hallucination guard: keep an AI-proposed row ONLY if its quote is a verbatim (whitespace-
// normalized) span of the source AND ≥20 chars AND its section is valid. The AI can propose; this disposes.
export function groundRows(rawRows = [], sourceText = '') {
  const src = normQ(sourceText);
  const out = [];
  for (const r of Array.isArray(rawRows) ? rawRows : []) {
    if (!r || typeof r !== 'object') continue;
    const section = String(r.section || '').trim();
    if (!ALLOWED_SECTIONS.has(section)) continue;
    const quote = String(r.quote || '');
    if (normQ(quote).length < 20) continue;
    if (!src.includes(normQ(quote))) continue;
    const text = String(r.text || quote).replace(/\s+/g, ' ').trim();
    if (text.length < 12 || text.length > 400) continue;
    out.push({ section, text, category: categorize(text), quote: quote.slice(0, 240) });
  }
  return out;
}

// Words we ignore when measuring requirement↔draft overlap: requirement boilerplate + generic connectives
// (all length ≥4 so they'd otherwise survive the length filter and inflate matches).
const STOP = new Set([
  'shall', 'must', 'will', 'required', 'require', 'requires', 'responsible', 'provide', 'provides', 'provided',
  'maintain', 'ensure', 'contractor', 'contractors', 'minimum', 'later', 'than', 'into', 'from', 'with', 'that',
  'this', 'these', 'those', 'such', 'each', 'upon', 'within', 'their', 'there', 'they', 'them', 'have', 'been',
  'shall', 'also', 'which', 'while', 'when', 'where', 'been', 'being', 'were', 'your', 'ours', 'about', 'other',
  'including', 'include', 'includes', 'per', 'and', 'the', 'for', 'are', 'all', 'any', 'may', 'not',
]);

// PURE: a requirement's SIGNIFICANT terms — lowercase word tokens length ≥4, minus stopwords, deduped.
function significantTerms(text = '') {
  const seen = new Set();
  for (const w of String(text).toLowerCase().match(/[a-z0-9]+/g) || []) {
    if (w.length >= 4 && !STOP.has(w)) seen.add(w);
  }
  return [...seen];
}

const normalize = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

// ── PURE: pull the requirement-bearing statements out of raw SOW text. Splits on newlines AND sentences,
// keeps only obligation statements, trims/collapses, drops junk-length, DEDUPES, caps at 60, assigns stable ids.
export function extractRequirements(sowText = '') {
  const rows = [];
  const seen = new Set();
  for (const line of String(sowText || '').split(/\r?\n/)) {
    // strip leading bullet / list markers so "• The contractor shall…" is scored on its prose
    const cleaned = line.replace(/^[\s•\-*•]+/, '').replace(/^\(?\d+[.)]\s*/, '').trim();
    if (!cleaned) continue;
    // split the line into sentences (a single-clause line yields one part = the line itself)
    const parts = cleaned.split(/(?<=[.!?;])\s+(?=[A-Z0-9("'])/).map((p) => p.trim()).filter(Boolean);
    for (const part of parts.length ? parts : [cleaned]) {
      if (!REQ_RE.test(part)) continue;                 // must carry obligation language
      const text = part.replace(/\s+/g, ' ').trim();
      if (text.length < 15 || text.length > 400) continue;
      const key = normalize(text);
      if (seen.has(key)) continue;                       // dedupe by normalized text
      seen.add(key);
      rows.push({ id: `R${rows.length + 1}`, text, category: categorize(text) });
      if (rows.length >= 60) return rows;                // cap
    }
  }
  return rows;
}

// ── PURE: map ONE requirement to the draft. Deterministic keyword-overlap — no model, no vibes.
// ≥60% of the requirement's significant terms present → 'addressed'; ≥1 but <60% → 'partial'; 0 → 'gap'.
// citation = the draft line carrying the MOST requirement terms (the evidence), '' for a gap. NEVER invented.
export function mapCoverage(requirement = '', draftText = '') {
  const terms = significantTerms(requirement);
  const draft = String(draftText || '');
  const lower = draft.toLowerCase();
  if (!terms.length) return { status: 'partial', citation: '', matchedTerms: [] };
  const matched = terms.filter((t) => lower.includes(t));
  const ratio = matched.length / terms.length;
  const status = matched.length === 0 ? 'gap' : ratio >= 0.6 ? 'addressed' : 'partial';
  // a GAP has NO supporting text — never fabricate a citation for something the draft does not address
  if (status === 'gap') return { status, citation: '', matchedTerms: [] };
  // find the draft line/snippet that contains the most of this requirement's terms
  let best = '', bestScore = 0;
  for (const rawLine of draft.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const low = line.toLowerCase();
    const score = matched.reduce((n, t) => n + (low.includes(t) ? 1 : 0), 0);
    if (score > bestScore) { bestScore = score; best = line; }
  }
  const citation = best.replace(/\s+/g, ' ').trim().slice(0, 160);
  return { status, citation, matchedTerms: matched };
}

// ── PURE: assemble the full matrix. coveragePct is deterministic: partial credit 0.5, 100 when no reqs. ──
export function buildMatrix({ sowText = '', draft = '', meta = {} } = {}) {
  const reqs = extractRequirements(sowText);
  const rows = reqs.map((r) => {
    const cov = mapCoverage(r.text, draft);
    return { id: r.id, requirement: r.text, category: r.category, status: cov.status, citation: cov.citation };
  });
  const total = rows.length;
  const addressed = rows.filter((r) => r.status === 'addressed').length;
  const partial = rows.filter((r) => r.status === 'partial').length;
  const gap = rows.filter((r) => r.status === 'gap').length;
  const coveragePct = total ? Math.round(((addressed + 0.5 * partial) / total) * 100) : 100;
  return { meta: meta || {}, rows, summary: { total, addressed, partial, gap, coveragePct } };
}

// ── PURE: render the matrix as a real Markdown artifact. HONEST — leads with the GAPS (the disqualifiers). ──
export function renderMatrixMarkdown(matrix) {
  const { meta = {}, rows = [], summary = {} } = matrix || {};
  const { total = 0, addressed = 0, partial = 0, gap = 0, coveragePct = 100 } = summary;
  const glyph = (s) => (s === 'addressed' ? '✅' : s === 'partial' ? '🟡' : '⛔');
  const esc = (s) => String(s == null ? '' : s).replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim();
  const clip = (s, n) => { const e = esc(s); return e.length > n ? e.slice(0, n - 1) + '…' : e; };
  const title = meta.title || meta.noticeId || 'Opportunity';
  const gaps = rows.filter((r) => r.status === 'gap');
  const out = [];
  out.push(`# Compliance Matrix — ${esc(title)}`);
  if (meta.noticeId) out.push(`<!-- notice ${meta.noticeId} · generated ${meta.generatedAt || new Date().toISOString()} -->`);
  out.push('');
  out.push(`**Coverage: ${coveragePct}%** · ${gap} gap${gap === 1 ? '' : 's'} · ${total} requirement${total === 1 ? '' : 's'} (✅ ${addressed} addressed · 🟡 ${partial} partial · ⛔ ${gap} gap)`);
  out.push('');
  out.push('> A gov proposal that fails to answer a single "shall/must" requirement can be ruled non-responsive. Every ⛔ below is a disqualification risk — close it, or decide not to bid.');
  out.push('');
  out.push('**Legend:** ✅ addressed · 🟡 partial · ⛔ gap (unaddressed)');
  out.push('');
  // Lead with the GAPS — these are the reasons a bid gets thrown out.
  if (gaps.length) {
    out.push(`## ⛔ GAPS — ${gaps.length} unaddressed requirement${gaps.length === 1 ? '' : 's'} (fix before submitting)`);
    for (const g of gaps) out.push(`- **${g.id}** (${g.category}) — ${esc(g.requirement)}`);
    out.push('');
  } else if (total > 0) {
    out.push('## ✅ No gaps — every extracted requirement is addressed in the draft');
    out.push('');
  }
  // Full traceability table.
  out.push('## Requirements traceability');
  out.push('| # | Requirement | Category | Status | Where addressed (citation) |');
  out.push('| --- | --- | --- | --- | --- |');
  for (const r of rows) out.push(`| ${r.id} | ${clip(r.requirement, 180)} | ${r.category} | ${glyph(r.status)} ${r.status} | ${r.citation ? clip(r.citation, 160) : '—'} |`);
  if (!rows.length) out.push('| — | _No shall/must requirements extracted from the SOW text._ | — | — | — |');
  out.push('');
  return out.join('\n');
}

// ── best-effort IO: read the SOW Description text that sow.mjs persisted (the "## Description" section). ──
function readSowDescription(op) {
  try {
    const raw = fs.readFileSync(sowPath(op), 'utf8');
    const m = raw.split(/^##\s*Description\s*$/im)[1];
    return (m || '').replace(/^\s+/, '').trim();
  } catch { return ''; }
}

// ── best-effort IO: read the proposal draft — the deal ledger's proposalFile, else gov-drafts/<slug>.md. ──
async function readDraft(op) {
  const tryRead = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };
  try {
    // deal ledger is best-effort (its GOV_DATA_DIR + pricing import must never break the matrix)
    const { getDeal } = await importDeals();
    const deal = op && op.noticeId ? getDeal(op.noticeId) : null;
    if (deal && deal.proposalFile) {
      const abs = path.isAbsolute(deal.proposalFile) ? deal.proposalFile : path.join(ROOT, deal.proposalFile);
      const t = tryRead(abs);
      if (t) return t;
    }
  } catch { /* fall through to the conventional path */ }
  return tryRead(path.join(ROOT, 'gov-drafts', `${slug(op)}.md`));
}
// deals.mjs pulls in pricing.mjs on import; keep it lazy + guarded so matrix stays usable if it ever throws.
async function importDeals() { try { return await import('./deals.mjs'); } catch { return {}; } }

// ── best-effort orchestrator: resolve SOW + draft, build the matrix, WRITE the artifact, return summary. ──
// Never throws. Args override disk (used by tests + callers that already hold the text).
export async function matrixForOp(op = {}, { draftText, sowText, key } = {}) {
  try {
    op = typeof op === 'string' ? { noticeId: op } : (op || {});
    // 1) SOW text: explicit arg → the persisted SOW file → best-effort live pull (only if a key is given)
    let sow = sowText || '';
    if (!sow) sow = readSowDescription(op);
    if (!sow && key) { try { const r = await pullScopeOfWork(op, key); sow = (r && r.text) || ''; } catch { /* offline */ } }
    // 2) draft text: explicit arg → the deal's proposalFile → gov-drafts/<slug>.md
    let draft = draftText || '';
    if (!draft) draft = await readDraft(op);
    const meta = { noticeId: op.noticeId || null, title: op.title || null, generatedAt: new Date().toISOString() };
    const matrix = buildMatrix({ sowText: sow, draft, meta });
    let file = null;
    try {
      fs.mkdirSync(MATRIX_DIR, { recursive: true });
      const p = matrixPath(op);
      fs.writeFileSync(p, renderMatrixMarkdown(matrix));
      file = path.relative(ROOT, p);
    } catch { /* artifact write best-effort; the matrix object is still returned */ }
    return { ok: true, file, summary: matrix.summary, gapCount: matrix.summary.gap, matrix };
  } catch (e) {
    return { ok: false, error: e.message, file: null, summary: { total: 0, addressed: 0, partial: 0, gap: 0, coveragePct: 100 }, gapCount: 0, matrix: null };
  }
}

// ── CLI: node pods/gov/matrix.mjs <noticeId-or-file> → prints the summary (analysis only, never sends). ──
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const arg = process.argv[2];
  if (!arg) { console.error('usage: node pods/gov/matrix.mjs <noticeId-or-draft-file>'); process.exit(1); }
  let op = { noticeId: arg }, opts = {};
  try {
    if (fs.existsSync(arg) && fs.statSync(arg).isFile()) {
      opts.draftText = fs.readFileSync(arg, 'utf8');
      op = { noticeId: path.basename(arg).replace(/\.md$/i, ''), title: path.basename(arg) };
    }
  } catch { /* treat arg as a noticeId */ }
  const r = await matrixForOp(op, opts);
  const s = r.summary || {};
  console.log(`\nCompliance Matrix — ${op.title || op.noticeId}`);
  console.log(`  requirements: ${s.total}   coverage: ${s.coveragePct}%`);
  console.log(`  ✅ ${s.addressed} addressed · 🟡 ${s.partial} partial · ⛔ ${s.gap} gap`);
  if (r.file) console.log(`  artifact: ${r.file}`);
  if (s.gap) console.log(`  ⚠ ${s.gap} unaddressed requirement(s) — disqualification risk. See the artifact's GAPS section.`);
}
