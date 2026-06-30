// Evals for Simulation Mode's PURE prompt builder (pods/gov/simulate.mjs). The critique is an LLM call,
// but the prompt assembly (firm context, opportunity facts, draft-vs-pre-bid branch, out-of-lane flag)
// is deterministic — lock it so the panel always judges against who Rodgate actually is.

import { panelPrompt } from '../pods/gov/simulate.mjs';

export default {
  agent: 'gov-simulate',
  cases: [
    { name: 'always embeds the firm profile (judges against the real Rodgate)',
      run: () => { const p = panelPrompt({ title: 'Custodial' }); return { pass: /Rodgate/.test(p) && /Small Disadvantaged/.test(p), detail: 'firm in prompt' }; } },

    { name: 'embeds the opportunity facts (title/agency/set-aside)',
      run: () => { const p = panelPrompt({ title: 'Range maintenance', agency: 'Army', setAside: 'Small Business' }); return { pass: p.includes('Range maintenance') && p.includes('Army') && p.includes('Small Business'), detail: 'opp in prompt' }; } },

    { name: 'with a draft → red-teams the draft directly',
      run: () => { const p = panelPrompt({ title: 'X' }, 'Our technical approach is to...'); return { pass: /red-team this directly/i.test(p) && p.includes('technical approach'), detail: 'draft branch' }; } },

    { name: 'without a draft → falls back to a pre-bid go/no-go readiness check',
      run: () => { const p = panelPrompt({ title: 'X' }, ''); return { pass: /BID READINESS|go\/no-go/i.test(p), detail: 'pre-bid branch' }; } },

    { name: 'flags an out-of-lane set-aside (subcontract-only)',
      run: () => { const p = panelPrompt({ title: 'X', inLane: false }); return { pass: /OUTSIDE the firm's prime lane|subcontract-only/i.test(p), detail: 'lane flag' }; } },

    { name: 'long drafts are truncated (keeps the prompt bounded)',
      run: () => { const p = panelPrompt({ title: 'X' }, 'a'.repeat(20000)); return { pass: p.length < 13000, detail: p.length + ' chars' }; } },
  ],
};
