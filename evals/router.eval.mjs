// Evals for the model-router's PURE decision core (pods/model-router.mjs). The provider chain is
// deterministic code (doctrine #1: code disposes) — these lock the behavior so a refactor can't silently
// start leaking private work to the cloud or break the "never go dark" fallback. Pure functions only;
// no network, no Ollama spawn.

import { pickChain, modelForProvider } from '../pods/model-router.mjs';

const ALL = { claude: true, openrouter: true, local: true };

export default {
  agent: 'model-router',
  cases: [
    { name: 'privacy forces LOCAL-ONLY (never leaves the PC)',
      run: () => { const c = pickChain({ tier: 'reflect', privacy: true, have: ALL }); return { pass: c.length === 1 && c[0] === 'local', detail: c.join(' › ') }; } },

    { name: 'privacy beats even an explicit provider/prefer',
      run: () => { const c = pickChain({ tier: 'draft', privacy: true, provider: 'claude', prefer: 'claude', have: ALL }); return { pass: c.length === 1 && c[0] === 'local', detail: c.join(' › ') }; } },

    { name: 'bulk/cheap tier tries FREE local first, Claude last',
      run: () => { const c = pickChain({ tier: 'cheap', have: ALL }); return { pass: c[0] === 'local' && c[c.length - 1] === 'claude', detail: c.join(' › ') }; } },

    { name: 'real-work (draft) tier tries Claude first',
      run: () => { const c = pickChain({ tier: 'draft', have: ALL }); return { pass: c[0] === 'claude', detail: c.join(' › ') }; } },

    { name: 'no Claude key → Claude dropped, local still there ("no tokens" fix)',
      run: () => { const c = pickChain({ tier: 'draft', have: { claude: false, openrouter: true, local: true } }); return { pass: !c.includes('claude') && c.includes('local'), detail: c.join(' › ') }; } },

    { name: 'explicit provider wins (caller owns it)',
      run: () => { const c = pickChain({ tier: 'cheap', provider: 'claude', have: ALL }); return { pass: c.length === 1 && c[0] === 'claude', detail: c.join(' › ') }; } },

    { name: 'manual prefer=local puts local first even for draft',
      run: () => { const c = pickChain({ tier: 'draft', prefer: 'local', have: ALL }); return { pass: c[0] === 'local', detail: c.join(' › ') }; } },

    { name: 'every auto chain still contains a free option (no dead end)',
      run: () => {
        const a = pickChain({ tier: 'reflect', have: ALL });
        const b = pickChain({ tier: 'cheap', have: { claude: false, openrouter: false, local: true } });
        return { pass: (a.includes('local') || a.includes('openrouter')) && b.length >= 1 && b.includes('local'), detail: `${a.join('›')} | ${b.join('›')}` };
      } },

    { name: 'local model maps smart(draft) vs fast(cheap) distinctly',
      run: () => { const big = modelForProvider('local', 'reflect'); const small = modelForProvider('local', 'cheap'); return { pass: !!big && !!small && big !== small, detail: `${big} vs ${small}` }; } },

    { name: 'claude provider always resolves to a claude-* model',
      run: () => { const m = modelForProvider('claude', 'draft'); return { pass: /^claude/i.test(m), detail: m }; } },
  ],
};
