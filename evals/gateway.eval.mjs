// Regression suite for Jarvis's OWN free-token gateway (pods/gateway/*). The operator is building apps whose
// agents run on these tokens, so the routing has to be honest and predictable: try free before paid, never
// spend money silently, respect a rate-limit instead of hammering it, force PRIVATE work to the local model,
// and — the doctrine line — report an honest failure rather than a fabricated completion when all else fails.
// No network: a fake fetch drives every path.

import { availableProviders, routePlan, PROVIDERS } from '../pods/gateway/providers.mjs';
import { complete, noteUsage, isCooling, usageReport } from '../pods/gateway/router.mjs';

const ok = (pass, detail = '') => ({ pass, detail });
const NOW = new Date('2026-07-28T12:00:00Z');
const ENV = { OPENROUTER_API_KEY: 'k1', GROQ_API_KEY: 'k2', OPENAI_API_KEY: 'k3' };
const reply = (text) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { role: 'assistant', content: text } }], usage: { total_tokens: 42 } }) });

export default {
  agent: 'gateway',
  cases: [
    { name: 'NO STEALTH: the registry contains no fingerprint/MITM/proxy trickery — just published free tiers', run: () => {
      const src = JSON.stringify(PROVIDERS);
      return ok(!/fingerprint|ja3|ja4|stealth|mitm|tproxy|impersonat/i.test(src), 'registry mentions evasion');
    } },

    { name: 'paid providers are EXCLUDED by default — money is never spent silently', run: () => {
      const free = availableProviders({ env: ENV }).map((p) => p.id);
      const paid = availableProviders({ env: ENV, allowPaid: true }).map((p) => p.id);
      return ok(!free.includes('openai') && paid.includes('openai'), JSON.stringify({ free, paid }));
    } },

    { name: 'a provider with no key is skipped entirely', run: () => {
      const ids = availableProviders({ env: { GROQ_API_KEY: 'k' } }).map((p) => p.id);
      return ok(ids.includes('groq') && !ids.includes('openrouter-free'), JSON.stringify(ids));
    } },

    { name: 'PRIVACY MODE forces the local model only (#ana / #finance never leave the machine)', run: () => {
      const ids = availableProviders({ env: ENV, privacyOnly: true }).map((p) => p.id);
      return ok(ids.length === 1 && ids[0] === 'local-ollama', JSON.stringify(ids));
    } },

    { name: 'needTools drops providers that cannot call tools (the local model)', run: () => {
      const ids = availableProviders({ env: ENV, needTools: true }).map((p) => p.id);
      return ok(!ids.includes('local-ollama'), JSON.stringify(ids));
    } },

    { name: 'routePlan tries every model of a provider before moving on, with LOCAL as the always-available floor', run: () => {
      const plan = routePlan({ env: { OPENROUTER_API_KEY: 'k' } });
      const ids = plan.map((h) => h.providerId);
      const firstLocal = ids.indexOf('local-ollama');
      // all 4 openrouter models come first, then the local floor (it needs no key, so it is ALWAYS there —
      // that is the point: Jarvis never goes completely dark, even with zero cloud keys)
      return ok(ids.slice(0, 4).every((i) => i === 'openrouter-free') && firstLocal === 4, JSON.stringify(ids));
    } },

    { name: 'the LOCAL floor needs no key — with zero cloud keys, Jarvis still has a brain', run: () => {
      const ids = availableProviders({ env: {} }).map((p) => p.id);
      return ok(ids.includes('local-ollama'), JSON.stringify(ids));
    } },

    { name: 'complete() returns the FIRST provider that answers', run: async () => {
      const r = await complete({ usageStore: {}, persist: false, messages: [{ role: 'user', content: 'hi' }], env: ENV, fetchImpl: async () => reply('hello'), now: NOW });
      return ok(r.ok && r.message.content === 'hello', JSON.stringify({ ok: r.ok, provider: r.provider }));
    } },

    { name: 'a 429 cools that provider down and FAILS OVER to the next one', async: true, run: async () => {
      let calls = 0;
      const fetchImpl = async () => { calls++; return calls === 1 ? { ok: false, status: 429, json: async () => ({}) } : reply('from the backup'); };
      const r = await complete({ usageStore: {}, persist: false, messages: [{ role: 'user', content: 'hi' }], env: ENV, fetchImpl, now: NOW });
      return ok(r.ok && r.message.content === 'from the backup' && r.tried.some((t) => t.status === 429), JSON.stringify(r.tried));
    } },

    { name: 'when EVERY provider fails it reports an honest failure — never a fabricated completion', run: async () => {
      const r = await complete({ usageStore: {}, persist: false, messages: [{ role: 'user', content: 'hi' }], env: ENV, fetchImpl: async () => { throw new Error('network down'); }, now: NOW });
      return ok(r.ok === false && /every provider failed/i.test(r.error) && !r.message, JSON.stringify({ ok: r.ok, error: r.error }));
    } },

    { name: 'genuinely no eligible provider (tools needed, no cloud keys) → honest error, not a crash', run: async () => {
      // needTools drops the local floor (it can't call tools) and there are no cloud keys → nothing eligible
      const r = await complete({ usageStore: {}, persist: false, messages: [{ role: 'user', content: 'hi' }], env: {}, needTools: true, fetchImpl: async () => reply('x'), now: NOW });
      return ok(r.ok === false && /no provider available/i.test(r.error), JSON.stringify(r));
    } },

    { name: 'noteUsage counts requests/tokens per provider per day', run: () => {
      let u = noteUsage({}, 'groq', { tokens: 100, now: NOW });
      u = noteUsage(u, 'groq', { tokens: 50, now: NOW });
      return ok(u.groq.requests === 2 && u.groq.tokens === 150, JSON.stringify(u));
    } },

    { name: 'usage rolls over on a new day (yesterday never inflates today\'s budget)', run: () => {
      let u = noteUsage({}, 'groq', { tokens: 900, now: new Date('2026-07-27T12:00:00Z') });
      u = noteUsage(u, 'groq', { tokens: 10, now: NOW });
      return ok(u.groq.requests === 1 && u.groq.tokens === 10, JSON.stringify(u));
    } },

    { name: 'isCooling respects the cooldown window and expires it', run: () => {
      const cooling = { groq: { day: '2026-07-28', cooldownUntil: new Date(NOW.getTime() + 60000).toISOString() } };
      const expired = { groq: { day: '2026-07-28', cooldownUntil: new Date(NOW.getTime() - 60000).toISOString() } };
      return ok(isCooling(cooling, 'groq', NOW) === true && isCooling(expired, 'groq', NOW) === false && isCooling({}, 'groq', NOW) === false);
    } },

    { name: 'usageReport shows today\'s spend per provider (the free budget, visible)', run: () => {
      const u = noteUsage(noteUsage({}, 'groq', { tokens: 100, now: NOW }), 'cerebras', { tokens: 200, now: NOW });
      const rep = usageReport(u, NOW);
      return ok(rep.totalRequests === 2 && rep.totalTokens === 300 && rep.providers.length === 2, JSON.stringify(rep));
    } },
  ],
};
