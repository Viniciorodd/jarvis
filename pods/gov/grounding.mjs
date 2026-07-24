// grounding.mjs — assemble the deterministic GROUNDING block that turns a free-form proposal draft into a
// matrix-answering, library-grounded one. PURE: the requirements (from the Phase-1 compliance matrix), the
// reusable sections, and REAL past-performance (Phase-3 library) are all CODE-provided — the LLM only writes
// prose around them. Doctrine L-006: `needsReview` stubs are filtered out and an empty past-performance set
// yields an explicit no-fabrication instruction, so a bid can NEVER be handed an invented citation.

const SECTION_LABEL = { L: 'Submission instructions (Section L)', M: 'Evaluation factors (Section M)', C: 'Scope of work', form: 'Required forms / registrations', general: 'General' };
const SECTION_ORDER = ['form', 'L', 'M', 'C', 'general'];

// PURE (eval-pinned): build the grounding block appended to the proposal-draft prompt.
export function groundingBlock({ matrixRows = [], pastPerformance = [], snippets = [] } = {}) {
  const out = [];

  // 1) Requirements to answer — grouped by section (forms/L/M/C), GAPS first within each section.
  const rows = (Array.isArray(matrixRows) ? matrixRows : []).filter((r) => r && r.requirement).slice(0, 80);
  if (rows.length) {
    out.push('ADDRESS EVERY REQUIREMENT BELOW — a missed shall/must, or a missing required form, makes the bid NON-RESPONSIVE (auto-disqualified). Each line must be answered somewhere in the proposal:');
    for (const sec of SECTION_ORDER) {
      const secRows = rows.filter((r) => (r.section || 'C') === sec);
      if (!secRows.length) continue;
      secRows.sort((a, b) => (a.status === 'gap' ? 0 : 1) - (b.status === 'gap' ? 0 : 1)); // gaps first
      out.push(`\n## ${SECTION_LABEL[sec] || sec}`);
      for (const r of secRows) out.push(`- [ ] (${r.id || '?'}${r.status === 'gap' ? ' · currently a GAP' : ''}) ${String(r.requirement).replace(/\s+/g, ' ').trim().slice(0, 240)}`);
    }
    out.push('');
  }

  // 2) Proven reusable sections — the operator-curated library (adapt, don't copy verbatim).
  const snips = (Array.isArray(snippets) ? snippets : []).filter((s) => s && s.body);
  if (snips.length) {
    out.push('PROVEN SECTIONS — adapt these to THIS solicitation (rewrite specifics; do not copy verbatim if the scope differs):');
    for (const s of snips) out.push(`\n### ${s.title || s.key}\n${String(s.body).trim()}`);
    out.push('');
  }

  // 3) Past performance — REAL records ONLY (drop needsReview stubs). Empty → explicit no-fabrication order.
  const pp = (Array.isArray(pastPerformance) ? pastPerformance : []).filter((r) => r && !r.needsReview && (r.title || r.agency));
  if (pp.length) {
    out.push('PAST PERFORMANCE — cite ONLY these real records; inventing past performance is prohibited:');
    for (const r of pp) out.push(`- ${[r.title, r.agency, r.value ? '$' + r.value : '', r.periodEnd].filter(Boolean).join(' · ')}${r.scope ? ' — ' + String(r.scope).slice(0, 200) : ''}`);
  } else {
    out.push('No past-performance records on file — do NOT fabricate any. Emphasize SAM/PA registrations and the disaster registry instead.');
  }

  return out.join('\n');
}
