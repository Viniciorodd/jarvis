// Compliance pre-check — the gov pod VERIFIES a drafted proposal against the opportunity's requirements
// BEFORE raising the submit gate, so a non-compliant bid never sits in front of you looking ready. Returns
// a quick verdict (PASS/RISK/FAIL) the worker folds into the approval + escalates on. Best-effort (Claude).
//
// SELF-HEAL UPGRADE: checkCompliance now ALSO returns a structured `gaps` array so the remediation loop
// (pods/gov/remediate.mjs) can DIAGNOSE why a draft would FAIL and fix the honest ones. The LLM proposes
// the gaps; CODE disposes their severity/autoFixable via normalizeGaps() — we NEVER trust the model to
// decide whether a gap is safe to auto-fix. Hard gaps (set-aside eligibility, past performance, deadlines)
// can only be fixed by LYING, so they are pinned hard/not-autoFixable and MUST escalate to the human.
import { claude } from './lib.mjs';

// ── The gap taxonomy (CODE is the source of truth; the LLM only names the code) ──────────────────
// Each code has a FIXED severity + autoFixable. soft+autoFixable = the loop may repair it honestly using
// facts already true; hard = escalate to the human, never auto-write around (doctrine: never fabricate).
export const GAP_POLICY = {
  'false-cert-claim':        { severity: 'soft', autoFixable: true },  // strip/correct a FALSE cert claim
  'unaddressed-scope':       { severity: 'soft', autoFixable: true },  // complete a section from true facts
  'missing-clause':          { severity: 'soft', autoFixable: true },  // cite a clause we actually satisfy
  'formatting':              { severity: 'soft', autoFixable: true },  // structure / missing required section
  'set-aside-ineligible':    { severity: 'hard', autoFixable: false }, // claiming eligibility we don't hold
  'missing-past-performance':{ severity: 'hard', autoFixable: false }, // inventing/padding past performance
  'passed-deadline':         { severity: 'hard', autoFixable: false }, // a deadline already gone
};

// PURE: force every gap's severity/autoFixable to the CODE policy (ignore whatever the LLM claimed) so a
// model that mislabels 'set-aside-ineligible' as soft can NEVER trick the loop into auto-writing a lie.
// Unknown code → soft + autoFixable:false (safe: it won't be auto-fixed AND won't be treated as escalate-hard;
// the loop simply can't repair it, so it terminates and escalates rather than fabricating).
export function normalizeGaps(rawGaps = []) {
  if (!Array.isArray(rawGaps)) return [];
  return rawGaps
    .filter((g) => g && typeof g === 'object' && g.code)
    .map((g) => {
      const pol = GAP_POLICY[g.code] || { severity: 'soft', autoFixable: false };
      return {
        code: String(g.code),
        issue: String(g.issue || g.summary || '').slice(0, 240),
        howToFix: String(g.howToFix || g.how_to_fix || '').slice(0, 240),
        severity: pol.severity,        // CODE decides — never the LLM
        autoFixable: pol.autoFixable,  // CODE decides — never the LLM
      };
    });
}

export async function checkCompliance({ op = {}, draft = '' } = {}) {
  if (!draft) return { verdict: 'RISK', summary: 'no draft to check', needs_sub_past_performance: false, gaps: [] };
  const sys = 'You are the GovCon COMPLIANCE REVIEWER for Rodgate, LLC — an SDB/Minority/Hispanic-owned SMALL business that holds Small/Micro-business, Self-Certified Small Disadvantaged, Minority-Owned and Hispanic-American-Owned status; it does NOT hold 8(a)/HUBZone/SDVOSB/WOSB; it is a NEW prime with limited federal past performance; it subcontracts labor and must respect FAR 52.219-14 (50% limit on subcontracting). Judge whether OUR PROPOSAL would be DISQUALIFIED for this opportunity (set-aside eligibility, required certs/clauses, unaddressed scope, passed deadline, missing past performance). ALSO return a structured list of the specific gaps so a downstream repair step can fix the honest ones. Use ONLY these gap codes: "false-cert-claim" (a false certification/eligibility claim to strip), "unaddressed-scope" (a required scope area not answered), "missing-clause" (a FAR/DFARS clause we satisfy but did not cite), "formatting" (missing required section/structure), "set-aside-ineligible" (this set-aside requires eligibility Rodgate does NOT hold), "missing-past-performance" (requires past performance we do not have), "passed-deadline" (response date already gone). Return ONLY minified JSON: {"verdict":"PASS|RISK|FAIL","summary":"<=140 chars","needs_sub_past_performance":true|false,"gaps":[{"code":"<one of the codes>","issue":"<=120 chars what is wrong","howToFix":"<=120 chars honest fix using facts already true — NEVER invent facts"}]}. Strict and honest. If a gap can only be "fixed" by inventing a fact, use the correct hard code (set-aside-ineligible / missing-past-performance / passed-deadline) so a human decides — do NOT dress it up as a soft gap.';
  const usr = `OPPORTUNITY: ${JSON.stringify({ title: op.title, setAside: op.setAside, naics: op.naics, deadline: op.deadline, description: String(op.description || '').slice(0, 2000) })}\n\nOUR PROPOSAL:\n${String(draft).slice(0, 4500)}`;
  const r = await claude(sys, usr, { tier: 'cheap', maxTokens: 500, agent: 'GOV-ANALYST' });
  const m = (r.text || '').match(/\{[\s\S]*\}/);
  try {
    if (!m) return { verdict: 'RISK', summary: 'review unparsed — check manually', needs_sub_past_performance: false, gaps: [] };
    const parsed = JSON.parse(m[0]);
    return {
      verdict: parsed.verdict || 'RISK',
      summary: parsed.summary || '',
      needs_sub_past_performance: !!parsed.needs_sub_past_performance,
      gaps: normalizeGaps(parsed.gaps),   // CODE re-classifies every gap — the LLM cannot mislabel severity
      _cost: r.cost || 0,
    };
  } catch {
    return { verdict: 'RISK', summary: 'review unparsed — check manually', needs_sub_past_performance: false, gaps: [] };
  }
}
