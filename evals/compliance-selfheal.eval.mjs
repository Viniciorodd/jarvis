// Regression suite for the COMPLIANCE SELF-HEAL LOOP (pods/gov/compliance.mjs + pods/gov/remediate.mjs).
// This suite exists to PROVE the one hard rule: the loop can HONESTLY fix soft gaps until PASS, but it can
// NEVER fabricate to pass — a hard gap (set-aside eligibility we don't hold, past performance we don't have,
// a passed deadline) MUST escalate to the human and NEVER be auto-written around. If this regresses, Jarvis
// could stage a lie in a federal proposal (facts-drift — the operator's #1 risk).
//
// NO real LLM here: the loop is driven with injected deterministic _check/_remediate. The deterministic
// facts path (stripFalseCerts / remediate on a false-cert draft) uses the REAL facts-check.mjs oracle.
// Async pieces run once at module load (top-level await, resolved before the sync runner reads the cases).

import { normalizeGaps, checkCompliance } from '../pods/gov/compliance.mjs';
import { improveUntilPass, remediate } from '../pods/gov/remediate.mjs';

const ok = (pass, detail = '') => ({ pass, detail });

// ── fixtures ─────────────────────────────────────────────────────────────────────────────────────
const FALSE_DRAFT = [
  '# Rodgate, LLC — Custodial Services Proposal',
  '',
  'Rodgate, LLC is a Self-Certified Small Disadvantaged Business, Minority-Owned and Hispanic-American-Owned small business.',
  'We are also 8(a) certified and hold an active HUBZone designation, making us fully eligible for this set-aside.',
  'Our team will deliver nightly custodial services across all administrative buildings.',
].join('\n');

// A fake compliance checker that returns a scripted sequence of verdict+gaps, one per call/round.
const scriptedCheck = (rounds) => {
  let i = 0;
  return async () => rounds[Math.min(i++, rounds.length - 1)];
};

// ── async scenarios computed once (resolved before the runner reads cases) ───────────────────────

// (2) soft gaps → remediate applied → PASS on round 2 → { ok:true, rounds:2 }
let softRemediateCalls = 0;
const softHeal = await improveUntilPass({
  draft: 'DRAFT-v0',
  _check: scriptedCheck([
    { verdict: 'FAIL', gaps: [{ code: 'formatting', issue: 'missing past performance section header' }] },
    { verdict: 'PASS', gaps: [] },
  ]),
  _remediate: async ({ draft }) => { softRemediateCalls++; return { draft: draft + ' [formatted]', changes: [{ code: 'formatting', what: 'added section' }] }; },
});

// (3) THE ANTI-FABRICATION GUARANTEE: a HARD gap present → escalate, _remediate NEVER called, draft UNCHANGED
let hardRemediateCalled = false;
const HARD_DRAFT = 'DRAFT-hard-original';
const hardHeal = await improveUntilPass({
  draft: HARD_DRAFT,
  _check: scriptedCheck([
    { verdict: 'FAIL', gaps: [{ code: 'missing-past-performance', issue: 'requires 3 references we do not have' }, { code: 'formatting', issue: 'x' }] },
  ]),
  _remediate: async ({ draft }) => { hardRemediateCalled = true; return { draft: draft + ' FABRICATED', changes: [{ code: 'formatting', what: 'x' }] }; },
});

// (3b) an LLM that MISLABELS a hard gap as soft still escalates (normalizeGaps re-pins severity from CODE)
let mislabelRemediateCalled = false;
const mislabelHeal = await improveUntilPass({
  draft: 'DRAFT-mislabel',
  _check: scriptedCheck([
    { verdict: 'FAIL', gaps: [{ code: 'set-aside-ineligible', issue: 'SDVOSB set-aside — not held', severity: 'soft', autoFixable: true }] },
  ]),
  _remediate: async ({ draft }) => { mislabelRemediateCalled = true; return { draft, changes: [] }; },
});

// (4) maxRounds respected: check NEVER returns PASS → escalate after maxRounds (not infinite)
let loopRemediateCalls = 0;
const loopHeal = await improveUntilPass({
  draft: 'DRAFT-loop',
  maxRounds: 2,
  _check: async () => ({ verdict: 'FAIL', gaps: [{ code: 'unaddressed-scope', issue: 'scope' }] }),
  _remediate: async ({ draft }) => { loopRemediateCalls++; return { draft: draft + '+', changes: [{ code: 'unaddressed-scope', what: 'scope' }] }; },
});

// (5) remediate on a REAL draft with a false "8(a) certified" claim → deterministic facts path strips it
const stripHeal = await remediate({ draft: FALSE_DRAFT, gaps: [{ code: 'false-cert-claim', issue: 'false 8(a)/HUBZone claims' }] });

// (6) remediate never touches HARD gaps: a mix in → only soft codes appear in changes (no LLM: only the
//     deterministic facts path runs, so this stays offline)
const mixHeal = await remediate({ draft: FALSE_DRAFT, gaps: [
  { code: 'false-cert-claim', issue: 'false certs' },
  { code: 'missing-past-performance', issue: 'no past perf' },
  { code: 'set-aside-ineligible', issue: 'ineligible' },
] });

// (7) FACTS SAFETY NET: an injected _remediate that returns a draft with a BANNED claim must be REVERTED —
//     improveUntilPass must never return a draft worse on facts than it started.
const safetyHeal = await improveUntilPass({
  draft: 'Rodgate, LLC is a Self-Certified SDB, Minority-Owned small business.',
  maxRounds: 2,
  _check: async () => ({ verdict: 'FAIL', gaps: [{ code: 'formatting', issue: 'x' }] }),
  _remediate: async ({ draft }) => ({ draft: draft + '\nWe are 8(a) certified and SDVOSB eligible.', changes: [{ code: 'formatting', what: 'x' }] }),
});

// (8) checkCompliance on an empty draft → verdict RISK, gaps:[] (deterministic early-return, no LLM, no throw)
let emptyComp = null, emptyThrew = false;
try { emptyComp = await checkCompliance({ draft: '' }); } catch { emptyThrew = true; }

export default {
  agent: 'compliance-selfheal',
  cases: [
    { name: 'normalizeGaps: CODE forces severity — LLM claiming set-aside-ineligible is "soft" is overridden to HARD', run: () => {
      const [g] = normalizeGaps([{ code: 'set-aside-ineligible', severity: 'soft', autoFixable: true }]);
      return ok(g && g.severity === 'hard' && g.autoFixable === false, JSON.stringify(g));
    } },
    { name: 'normalizeGaps: soft codes stay soft+autoFixable; unknown code → soft + autoFixable:false (safe)', run: () => {
      const gs = normalizeGaps([{ code: 'formatting' }, { code: 'made-up-code' }]);
      const fmt = gs.find((x) => x.code === 'formatting');
      const unk = gs.find((x) => x.code === 'made-up-code');
      return ok(fmt.severity === 'soft' && fmt.autoFixable === true && unk.severity === 'soft' && unk.autoFixable === false, JSON.stringify(gs));
    } },
    { name: 'improveUntilPass: soft gaps → remediate → PASS on round 2 (ok:true, rounds:2, remediated once)', run: () =>
      ok(softHeal.ok === true && softHeal.verdict === 'PASS' && softHeal.rounds === 2 && softRemediateCalls === 1 && softHeal.draft.includes('[formatted]'), JSON.stringify({ ok: softHeal.ok, rounds: softHeal.rounds, calls: softRemediateCalls })) },
    { name: 'ANTI-FABRICATION: a HARD gap (missing-past-performance) escalates, _remediate NEVER called, draft UNCHANGED', run: () =>
      ok(hardHeal.escalated === true && hardHeal.ok === false && hardRemediateCalled === false && hardHeal.draft === HARD_DRAFT && (hardHeal.hardGaps || []).some((g) => g.code === 'missing-past-performance'), JSON.stringify({ escalated: hardHeal.escalated, remediateCalled: hardRemediateCalled, unchanged: hardHeal.draft === HARD_DRAFT })) },
    { name: 'ANTI-FABRICATION: an LLM mislabeling set-aside-ineligible as soft STILL escalates (never auto-fixed)', run: () =>
      ok(mislabelHeal.escalated === true && mislabelRemediateCalled === false && (mislabelHeal.hardGaps || []).some((g) => g.code === 'set-aside-ineligible'), JSON.stringify({ escalated: mislabelHeal.escalated, remediateCalled: mislabelRemediateCalled })) },
    { name: 'improveUntilPass: maxRounds respected — never PASS → escalates after maxRounds, terminates (not infinite)', run: () =>
      ok(loopHeal.escalated === true && loopHeal.ok === false && loopRemediateCalls === 2 && loopHeal.reason === 'maxRounds exhausted', JSON.stringify({ escalated: loopHeal.escalated, calls: loopRemediateCalls, reason: loopHeal.reason })) },
    { name: 'remediate: deterministic facts path STRIPS a false "8(a) certified" claim (no LLM), no new violation', run: () => {
      const clean = !/8\s*\(\s*a\s*\)/i.test(stripHeal.draft) && !/hubzone/i.test(stripHeal.draft);
      const stillHasTrueIdentity = /Self-Certified Small Disadvantaged Business/i.test(stripHeal.draft);
      const changed = stripHeal.changes.some((c) => c.code === 'false-cert-claim');
      return ok(clean && stillHasTrueIdentity && changed, JSON.stringify({ clean, keptTrue: stillHasTrueIdentity, changes: stripHeal.changes.map((c) => c.code) }));
    } },
    { name: 'remediate: NEVER touches hard gaps — only soft codes appear in changes when a mix is passed', run: () => {
      const codes = mixHeal.changes.map((c) => c.code);
      const noHard = !codes.includes('missing-past-performance') && !codes.includes('set-aside-ineligible');
      return ok(noHard && codes.includes('false-cert-claim'), JSON.stringify(codes));
    } },
    { name: 'FACTS SAFETY NET: a remediation that would inject a banned claim is REVERTED (draft stays facts-clean)', run: () =>
      ok(!/8\s*\(\s*a\s*\)/i.test(safetyHeal.draft) && !/sdvosb/i.test(safetyHeal.draft), safetyHeal.draft.slice(-80)) },
    { name: 'checkCompliance: empty/unparseable draft → verdict RISK, gaps:[], no throw', run: () =>
      ok(!emptyThrew && emptyComp && emptyComp.verdict === 'RISK' && Array.isArray(emptyComp.gaps) && emptyComp.gaps.length === 0, JSON.stringify(emptyComp)) },
  ],
};
