// Evals for the model-router's PURE decision core (pods/model-router.mjs). The provider chain is
// deterministic code (doctrine #1: code disposes) — these lock the behavior so a refactor can't silently
// start leaking private work to the cloud or break the "never go dark" fallback. Pure functions only;
// no network, no Ollama spawn.

import { pickChain, modelForProvider, claudeCost, thinkingFor } from '../pods/model-router.mjs';

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

    { name: 'local maps draft→LOCAL_MODEL, cheap→LOCAL_MODEL_FAST (env-pinned, not .env-dependent)',
      run: () => {
        const sm = process.env.LOCAL_MODEL, fa = process.env.LOCAL_MODEL_FAST;
        process.env.LOCAL_MODEL = 'SMART-X'; process.env.LOCAL_MODEL_FAST = 'FAST-Y';
        const big = modelForProvider('local', 'reflect'); const small = modelForProvider('local', 'cheap');
        if (sm === undefined) delete process.env.LOCAL_MODEL; else process.env.LOCAL_MODEL = sm;
        if (fa === undefined) delete process.env.LOCAL_MODEL_FAST; else process.env.LOCAL_MODEL_FAST = fa;
        return { pass: big === 'SMART-X' && small === 'FAST-Y', detail: `${big} / ${small}` };
      } },

    { name: 'claude provider always resolves to a claude-* model',
      run: () => { const m = modelForProvider('claude', 'draft'); return { pass: /^claude/i.test(m), detail: m }; } },

    // ── claudeCost: the spend guard is only as good as these numbers (directive #1) ──────────────────
    { name: 'cost: opus 4.8 = $5/$25 per 1M (was underestimated ~6x by the old flat rate)',
      run: () => { const c = claudeCost('claude-opus-4-8', { input_tokens: 1e6, output_tokens: 1e6 }); return { pass: c === 30, detail: `$${c}` }; } },

    { name: 'cost: haiku 4.5 = $1/$5, sonnet = $3/$15 per 1M',
      run: () => {
        const h = claudeCost('claude-haiku-4-5', { input_tokens: 1e6, output_tokens: 1e6 });
        const s = claudeCost('claude-sonnet-5', { input_tokens: 1e6, output_tokens: 1e6 });
        return { pass: h === 6 && s === 18, detail: `haiku $${h} / sonnet $${s}` };
      } },

    { name: 'cost: cache reads bill at 0.1x input, writes at 1.25x',
      run: () => {
        const read = claudeCost('claude-opus-4-8', { cache_read_input_tokens: 1e6 });
        const write = claudeCost('claude-opus-4-8', { cache_creation_input_tokens: 1e6 });
        return { pass: read === 0.5 && write === 6.25, detail: `read $${read} / write $${write}` };
      } },

    { name: 'cost: unknown claude model falls back to opus pricing (overestimate, never under)',
      run: () => { const c = claudeCost('claude-future-9', { input_tokens: 1e6 }); return { pass: c === 5, detail: `$${c}` }; } },

    // ── thinkingFor: adaptive on reflect, sonnet-5 default-adaptive tamed, fable omitted ─────────────
    { name: 'thinking: reflect on opus 4.8 gets adaptive (quality upgrade for strategy calls)',
      run: () => { const t = thinkingFor('claude-opus-4-8', 'reflect'); return { pass: t && t.type === 'adaptive', detail: JSON.stringify(t) }; } },

    { name: 'thinking: sonnet-5 on cheap/draft is explicitly DISABLED (else adaptive-by-default eats small max_tokens)',
      run: () => {
        const a = thinkingFor('claude-sonnet-5', 'cheap'); const b = thinkingFor('claude-sonnet-5', 'draft');
        return { pass: a && a.type === 'disabled' && b && b.type === 'disabled', detail: JSON.stringify([a, b]) };
      } },

    { name: 'thinking: fable-5 NEVER gets a thinking param (API rejects any config; always-on)',
      run: () => {
        const a = thinkingFor('claude-fable-5', 'reflect'); const b = thinkingFor('claude-fable-5', 'cheap');
        return { pass: a === undefined && b === undefined, detail: JSON.stringify([a, b]) };
      } },

    { name: 'thinking: haiku / older models untouched (no param sent)',
      run: () => { const t = thinkingFor('claude-haiku-4-5', 'cheap'); return { pass: t === undefined, detail: JSON.stringify(t) }; } },
  ],
};
