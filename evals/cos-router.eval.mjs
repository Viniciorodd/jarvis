// Regression suite for the Chief-of-Staff router's DETERMINISTIC core (pods/chief-of-staff/router.mjs).
// The LLM classifier can drift; this pins the code that disposes: pod routing + the gate decision.
// If gating regresses, an irreversible action could route without approval — that's the failure to catch.

import { classifyDeterministic, decideGate } from '../pods/chief-of-staff/router.mjs';

const route = (text) => { const c = classifyDeterministic(text); return { c, gate: decideGate(c) }; };

export default {
  agent: 'cos-router',
  cases: [
    { name: 'a SAM.gov scan routes to gov and is reversible (no gate)',
      run: () => { const { c, gate } = route('scan SAM.gov for new janitorial solicitations'); return { pass: c.pod === 'gov' && gate.gate === false, detail: `${c.pod}/${c.action_kind} gate=${gate.gate}` }; } },
    { name: 'submitting a federal proposal is GATED (irreversible)',
      run: () => { const { c, gate } = route('submit the West Point proposal to the contracting officer'); return { pass: gate.gate === true, detail: gate.reason }; } },
    { name: 'generating a thumbnail routes to fiverr, no gate (reversible draft)',
      run: () => { const { c, gate } = route('generate a YouTube thumbnail for the gig'); return { pass: c.pod === 'fiverr' && gate.gate === false, detail: `${c.pod} gate=${gate.gate}` }; } },
    { name: 'delivering/sending to a client is GATED',
      run: () => { const { c, gate } = route('deliver the final thumbnail to the Fiverr client'); return { pass: gate.gate === true, detail: gate.reason }; } },
    { name: 'spending money is GATED',
      run: () => { const { c, gate } = route('spend $40 on stock photos'); return { pass: gate.gate === true, detail: gate.reason }; } },
    { name: 'a trade instruction on the research desk is GATED (never auto-executes)',
      run: () => { const { c, gate } = route('trade 5 NVDA call options on the watchlist'); return { pass: c.pod === 'research-risk' && gate.gate === true, detail: `${c.pod}: ${gate.reason}` }; } },
    { name: 'monitoring the market is reversible (no gate)',
      run: () => { const { c, gate } = route('monitor the watchlist and summarize unusual volume'); return { pass: c.pod === 'research-risk' && gate.gate === false, detail: `${c.pod} gate=${gate.gate}` }; } },
    { name: 'a vanilla briefing routes to chief-of-staff, no gate',
      run: () => { const { c, gate } = route('give me my morning brief'); return { pass: c.pod === 'chief-of-staff' && gate.gate === false, detail: `${c.pod} gate=${gate.gate}` }; } },
    { name: 'sending an email is GATED',
      run: () => { const { c, gate } = route('email the supplier asking for a quote'); return { pass: gate.gate === true, detail: gate.reason }; } },
    { name: 'ingesting notes to the vault is reversible (no gate)',
      run: () => { const { c, gate } = route('ingest and transcribe these voice notes into the knowledge vault'); return { pass: c.pod === 'vault' && gate.gate === false, detail: `${c.pod} gate=${gate.gate}` }; } },
  ],
};
