// Regression suite for the autonomy ladder (control-plane/autonomy.mjs) — doctrine §8 + §10.
// The safety-critical claim: a HARD_GATE kind (send/submit/spend/...) gates at EVERY level, and a
// workflow is only ever "promotable" when evals are green AND the human-edit-rate is below threshold
// with enough samples. If this regresses, the system could grant itself autonomy it didn't earn.

import { requiresGate, canPromote, humanEditRate, workflowFor, findWorkflow, HARD_GATE_KINDS } from '../control-plane/autonomy.mjs';

export default {
  agent: 'autonomy',
  cases: [
    // ── HARD CONSTITUTIONAL FLOOR — these never auto-run, at any level ──────────────────────────────
    { name: 'submit gates at L0 AND at L4 (constitution overrides the ladder)',
      run: () => ({ pass: requiresGate({ kind: 'submit', irreversible: true, level: 0 }).gate === true && requiresGate({ kind: 'submit', irreversible: true, level: 4 }).gate === true, detail: '' }) },
    { name: 'spend + send + pay are hard-gate kinds and always gate',
      run: () => ({ pass: ['spend', 'send', 'pay', 'wire', 'deliver'].every((k) => HARD_GATE_KINDS.has(k) && requiresGate({ kind: k, irreversible: true, level: 4 }).gate === true), detail: '' }) },

    // ── irreversible-but-recoverable: gated below L3, auto only when operator promotes to Trusted ───
    { name: 'a non-hard irreversible step gates below L3',
      run: () => ({ pass: requiresGate({ kind: 'post', irreversible: true, level: 2 }).gate === true, detail: '' }) },
    { name: 'a non-hard irreversible step auto-runs at L3 (operator-promoted)',
      run: () => ({ pass: requiresGate({ kind: 'post', irreversible: true, level: 3 }).gate === false, detail: '' }) },

    // ── reversible: manual at L0, auto from L1 ──────────────────────────────────────────────────────
    { name: 'a reversible scan gates at L0 (manual) and auto-runs at L1+',
      run: () => ({ pass: requiresGate({ kind: 'scan', irreversible: false, level: 0 }).gate === true && requiresGate({ kind: 'scan', irreversible: false, level: 2 }).gate === false, detail: '' }) },

    // ── the promotion rule ──────────────────────────────────────────────────────────────────────────
    { name: 'cannot promote when evals are red',
      run: () => ({ pass: canPromote({ level: 1, evalsPass: false, humanEditRate: 0.0, sampleSize: 50 }).ok === false, detail: '' }) },
    { name: 'cannot promote without enough samples',
      run: () => ({ pass: canPromote({ level: 1, evalsPass: true, humanEditRate: 0.0, sampleSize: 2, minSamples: 5 }).ok === false, detail: '' }) },
    { name: 'cannot promote when edit-rate is above threshold',
      run: () => ({ pass: canPromote({ level: 1, evalsPass: true, humanEditRate: 0.4, sampleSize: 20, threshold: 0.2 }).ok === false, detail: '' }) },
    { name: 'promotes when evals green + low edit-rate + enough samples',
      run: () => ({ pass: canPromote({ level: 1, evalsPass: true, humanEditRate: 0.1, sampleSize: 20, threshold: 0.2 }).ok === true, detail: '' }) },
    { name: 'never promotes past L4',
      run: () => ({ pass: canPromote({ level: 4, evalsPass: true, humanEditRate: 0, sampleSize: 999 }).ok === false, detail: '' }) },

    // ── human-edit-rate from the event log ──────────────────────────────────────────────────────────
    { name: 'humanEditRate counts redrafts + edit/pass as edits, approve + draft as accepts',
      run: () => {
        const events = [
          { pod: 'gov', action: 'proposal.draft' },
          { pod: 'gov', action: 'proposal.draft' },
          { pod: 'gov', action: 'proposal.redraft' },
          { pod: 'gov', kind: 'approval.decision', payload: { decision: 'approve' } },
          { pod: 'gov', kind: 'approval.decision', payload: { decision: 'pass' } },
        ];
        const m = humanEditRate(events, 'gov.draft');
        return { pass: m.sampleSize === 5 && m.edits === 2 && m.accepts === 3 && Math.abs(m.editRate - 0.4) < 1e-9, detail: JSON.stringify(m) };
      } },

    // ── classification → workflow mapping ───────────────────────────────────────────────────────────
    { name: 'workflowFor maps a gov submit to gov.submit (hard-gated)',
      run: () => { const id = workflowFor({ pod: 'gov', action_kind: 'submit' }); return { pass: id === 'gov.submit' && findWorkflow(id).irreversible === true, detail: id }; } },
    { name: 'workflowFor maps a research monitor to research.monitor (reversible)',
      run: () => { const id = workflowFor({ pod: 'research-risk', action_kind: 'monitor' }); return { pass: id === 'research.monitor' && findWorkflow(id).irreversible === false, detail: id }; } },
  ],
};
