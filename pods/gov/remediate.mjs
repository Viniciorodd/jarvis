// remediate.mjs — the COMPLIANCE SELF-HEAL LOOP. Compliance FAIL is common; instead of only flagging it,
// the gov pod now DIAGNOSES why a staged draft would fail, HONESTLY fixes what can be fixed, re-checks, and
// loops until PASS — or ESCALATES to the human when a gap can only be "fixed" by lying.
//
// ⚠ THE ONE HARD RULE — NEVER FABRICATE TO PASS (doctrine Canonical Facts; facts-drift is the operator's #1
// risk). This loop may ONLY repair HONEST (soft) gaps:
//   ✅ false-cert-claim  → DETERMINISTICALLY strip/correct a FALSE certification claim (no LLM, facts-check).
//   ✅ unaddressed-scope / missing-clause / formatting → ONE tightly-instructed claude() rewrite that may use
//      ONLY facts already true for Rodgate (never invent past performance, staff, certs, or eligibility).
//   ❌ set-aside-ineligible / missing-past-performance / passed-deadline → HARD gaps. NEVER auto-fixed.
//      They ESCALATE so the human decides (no-bid / teaming / provide REAL past performance).
//
// Nothing here SENDS anything. It edits a STAGED draft file (gov-drafts/*.md) — reversible, still behind the
// human submit gate. Facts-safe: after ANY change we re-run factsCheck and REVERT anything that made the
// draft worse on facts, so a repair can never smuggle in a false claim.

import { claude } from './lib.mjs';
import { factsCheck } from './facts-check.mjs';
import { checkCompliance, normalizeGaps } from './compliance.mjs';

// ── DETERMINISTIC false-cert stripper (no LLM) ───────────────────────────────────────────────────
// Uses the canonical facts-check.mjs as the oracle: walk the draft line-by-line, and inside any line that
// facts-check flags, drop only the offending sentence(s). Removal-only — it can subtract a false claim but
// can never add a fact, so it is structurally incapable of fabricating. Honest, true content is preserved.
export function stripFalseCerts(text = '') {
  const src = String(text || '');
  if (factsCheck(src).ok) return { text: src, removed: [] };
  const removed = [];
  const lines = src.split(/\n/).map((line) => {
    if (!line.trim() || factsCheck(line).ok) return line;
    // Split the line into sentences and keep only the honest ones.
    const parts = line.split(/(?<=[.!?])\s+/);
    const kept = parts.filter((s) => {
      const bad = !factsCheck(s).ok;
      if (bad && s.trim()) removed.push(s.trim().slice(0, 100));
      return !bad;
    });
    return kept.join(' ');
  });
  let out = lines.join('\n');
  // Collapse the blank lines a dropped sentence may have left behind.
  out = out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  return { text: out, removed };
}

// ── remediate — apply the HONEST fixes for the auto-fixable SOFT gaps only ────────────────────────
// PURE-ish: deterministic for the facts path; ONE claude() call for the scope/clause/formatting rewrite.
// Hard gaps are filtered out here too (belt-and-suspenders — the loop already withholds them). Returns
// { draft: revisedText, changes: [{code, what}] }. Every mutation is guarded by a facts safety net.
export async function remediate({ op = {}, draft = '', gaps = [], _claude = claude } = {}) {
  let text = String(draft || '');
  const changes = [];
  // Only ever touch soft + autoFixable gaps. normalizeGaps re-pins severity from CODE, so a hard gap that
  // arrives here (mislabeled or not) is dropped — it can NEVER be auto-written around.
  const soft = normalizeGaps(gaps).filter((g) => g.severity === 'soft' && g.autoFixable);

  // 1) DETERMINISTIC facts path — strip/correct FALSE certification claims. No LLM.
  if (soft.some((g) => g.code === 'false-cert-claim')) {
    const baseline = factsCheck(text).violations.length;
    const r = stripFalseCerts(text);
    // Safety net: a strip can only remove, but verify we did not somehow worsen facts before accepting.
    if (r.text !== text && factsCheck(r.text).violations.length <= baseline) {
      text = r.text;
      changes.push({ code: 'false-cert-claim', what: r.removed.length ? `removed false claim(s): ${r.removed.slice(0, 3).join(' | ')}` : 'corrected false certification claim' });
    }
  }

  // 2) LLM REWRITE path — scope / clause / formatting, using ONLY facts already true. One guarded call.
  const llmGaps = soft.filter((g) => ['unaddressed-scope', 'missing-clause', 'formatting'].includes(g.code));
  if (llmGaps.length) {
    const baseline = factsCheck(text).violations.length;
    const sys = 'You REVISE a STAGED GovCon proposal for Rodgate, LLC to close specific compliance gaps. ABSOLUTE RULE: you may ONLY use facts already true for Rodgate. NEVER invent or pad past performance, contracts, staff, revenue, certifications, or set-aside eligibility. Do NOT add any 8(a)/HUBZone/SDVOSB/WOSB claim, and do NOT claim any "certified" status other than SELF-certified SDB/Minority/Hispanic-owned SMALL business. Rodgate is a NEW prime with limited federal past performance and respects FAR 52.219-14 (50% self-perform). Fix ONLY the listed gaps: add missing required sections/structure (formatting), address unanswered scope areas using a truthful technical/management approach, and cite FAR/DFARS clauses the firm actually satisfies (missing-clause). If a gap CANNOT be closed without inventing a fact, LEAVE it unfixed and add a short "[NEEDS HUMAN INPUT: ...]" note instead of writing a false statement. Return ONLY the full revised proposal in Markdown — no preamble, no commentary.';
    const usr = `GAPS TO CLOSE (honestly, using only true facts):\n${llmGaps.map((g) => `- [${g.code}] ${g.issue}${g.howToFix ? ' — fix: ' + g.howToFix : ''}`).join('\n')}\n\nOPPORTUNITY: ${JSON.stringify({ title: op.title, setAside: op.setAside, naics: op.naics, deadline: op.deadline })}\n\nCURRENT DRAFT:\n${text}`;
    let revised = text;
    try {
      const rr = await _claude(sys, usr, { tier: 'draft', maxTokens: 2200, agent: 'GOV-ANALYST' });
      revised = (rr && typeof rr.text === 'string' && rr.text.trim()) ? rr.text : text;
    } catch { revised = text; }
    // FACTS SAFETY NET: never ship a draft that is WORSE on facts than before the rewrite. If the model
    // slipped in a banned claim, discard the whole rewrite (revert) rather than stage a lie.
    if (revised !== text && factsCheck(revised).violations.length <= baseline) {
      text = revised;
      for (const g of llmGaps) changes.push({ code: g.code, what: g.issue || g.howToFix || `addressed ${g.code}` });
    }
  }

  return { draft: text, changes };
}

// ── improveUntilPass — the LOOP. Diagnose → (honestly) fix → re-check → repeat until PASS or escalate ──
// Injectable _check/_remediate so the eval can drive it deterministically with NO real LLM. Always
// terminates (bounded by maxRounds) and NEVER fabricates:
//   • verdict PASS                → { ok:true, verdict:'PASS', draft, rounds, log }
//   • ANY hard gap               → escalate immediately, WITHOUT remediating (the anti-fabrication guarantee)
//   • soft autoFixable gaps      → remediate, then loop
//   • no fixable gaps / maxRounds → escalate (can't reach PASS honestly)
// log = per-round [{ round, verdictBefore, changes }].
export async function improveUntilPass({ op = {}, draft = '', maxRounds = 3, _check = checkCompliance, _remediate = remediate } = {}) {
  let text = String(draft || '');
  const log = [];
  let lastVerdict = 'RISK';

  for (let round = 1; round <= maxRounds; round++) {
    const res = (await _check({ op, draft: text })) || {};
    const verdict = res.verdict || 'RISK';
    lastVerdict = verdict;
    const gaps = normalizeGaps(res.gaps || []);

    if (verdict === 'PASS') {
      log.push({ round, verdictBefore: verdict, changes: [] });
      return { ok: true, verdict: 'PASS', draft: text, rounds: round, log };
    }

    // HARD gap → STOP. Never remediate a hard gap; the human decides (no-bid / teaming / real past perf).
    const hardGaps = gaps.filter((g) => g.severity === 'hard');
    if (hardGaps.length) {
      log.push({ round, verdictBefore: verdict, changes: [] });
      return { ok: false, verdict, draft: text, hardGaps, escalated: true, log };
    }

    const fixable = gaps.filter((g) => g.severity === 'soft' && g.autoFixable);
    if (!fixable.length) {
      // Not PASS and nothing honestly fixable → escalate rather than fake a pass.
      log.push({ round, verdictBefore: verdict, changes: [] });
      return { ok: false, verdict, draft: text, escalated: true, reason: 'no auto-fixable gaps', log };
    }

    const before = text;
    const rem = (await _remediate({ op, draft: before, gaps: fixable })) || {};
    let next = typeof rem.draft === 'string' ? rem.draft : before;
    let changes = Array.isArray(rem.changes) ? rem.changes : [];

    // FACTS SAFETY NET (guards even an injected _remediate): if a "fix" introduced a NEW facts violation,
    // REVERT it. A repair may never leave the draft worse on facts — never ship a smuggled false claim.
    const baseViol = factsCheck(before).violations.length;
    if (next !== before && factsCheck(next).violations.length > baseViol) {
      next = before;
      changes = [];
    }

    log.push({ round, verdictBefore: verdict, changes });
    text = next;
  }

  // Ran out of rounds without a PASS → escalate (bounded, never infinite).
  return { ok: false, verdict: lastVerdict, draft: text, escalated: true, reason: 'maxRounds exhausted', log };
}
