// providers.mjs — the free-token PROVIDER REGISTRY for Jarvis's own gateway.
//
// Operator (2026-07-27): *"i dont want OmniRoute installed, but i want it replicated and rebult for us fully
// controllable by use, if they could build it, so can we, we need those 1billion tokens, i am building apps,
// and each app will have ai agents managing them, i need to have the ai as my hands."*
//
// So this is the honest version of what OmniRoute sells, owned by us:
//   • ONLY documented, public free tiers — each provider's own offer, used the normal way with our own key.
//   • NO TLS-fingerprint impersonation, NO MITM/TPROXY, NO root CA, NO stealth. Nothing here disguises a
//     request as something it isn't, so no account of ours can be banned for evading detection.
//   • Everything runs in OUR process, with OUR keys, on OUR machine. No third party sees a prompt or a key.
//
// Adding a provider = one entry here. Keys come from env; a provider with no key is simply skipped.
// `limits` are the provider's PUBLISHED free-tier ceilings — used to budget locally, never to evade.

export const PROVIDERS = [
  {
    id: 'openrouter-free',
    label: 'OpenRouter (free pool)',
    keyEnv: 'OPENROUTER_API_KEY',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    // benchmarked on a real tool call 2026-07-27 — fastest first
    models: ['nvidia/nemotron-3-nano-30b-a3b:free', 'openai/gpt-oss-20b:free', 'nvidia/nemotron-nano-9b-v2:free', 'inclusionai/ling-3.0-flash:free'],
    tools: true,
    limits: { requestsPerDay: 1000 },
    notes: 'Aggregates many vendors\' free tiers behind one key. Free models rotate — the router probes and skips dead ones.',
  },
  {
    id: 'groq',
    label: 'Groq (free tier)',
    keyEnv: 'GROQ_API_KEY',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
    tools: true,
    limits: { requestsPerDay: 14400, tokensPerDay: 500000 },
    notes: 'Very fast inference. Generous published free tier.',
  },
  {
    id: 'cerebras',
    label: 'Cerebras (free tier)',
    keyEnv: 'CEREBRAS_API_KEY',
    url: 'https://api.cerebras.ai/v1/chat/completions',
    models: ['llama-3.3-70b', 'llama3.1-8b'],
    tools: true,
    limits: { tokensPerDay: 1000000 },
    notes: '~1M tokens/day published free. Excellent for bulk agent work.',
  },
  {
    id: 'google-ai-studio',
    label: 'Google AI Studio (free tier)',
    keyEnv: 'GEMINI_API_KEY',
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    models: ['gemini-2.0-flash', 'gemini-2.0-flash-lite'],
    tools: true,
    limits: { requestsPerDay: 1500 },
    notes: 'OpenAI-compatible endpoint. Strong quality for a free tier.',
  },
  {
    id: 'local-ollama',
    label: 'Local (Ollama)',
    keyEnv: null,                       // no key — it's your own machine
    url: (process.env.OLLAMA_URL || 'http://127.0.0.1:11434') + '/v1/chat/completions',
    models: [process.env.LOCAL_MODEL || 'hermes3'],
    tools: false,                       // local models are unreliable tool-callers; used for bulk text only
    limits: {},                         // unlimited — it's your hardware
    privacy: true,                      // the ONLY tier allowed to see #ana / #finance work
    notes: 'Always-available floor. Unlimited + fully private, but slower and weaker at tool calls.',
  },
  {
    id: 'openai',
    label: 'OpenAI (paid)',
    keyEnv: 'OPENAI_API_KEY',
    url: 'https://api.openai.com/v1/chat/completions',
    models: ['gpt-4o-mini'],
    tools: true,
    paid: true,                         // only used when explicitly allowed — never silently
    limits: {},
    notes: 'Paid fallback. Most reliable tool-caller; costs real money, so it is last and opt-in.',
  },
];

const has = (p, env) => !p.keyEnv || !!(env[p.keyEnv] && String(env[p.keyEnv]).trim());

// PURE: which providers are actually usable right now, in the order we should try them.
// `needTools` drops providers that can't call tools; `allowPaid` (default false) keeps money out of the
// default path; `privacyOnly` forces the local tier — the #ana/#finance rule, enforced here not by prompt.
export function availableProviders({ env = process.env, needTools = false, allowPaid = false, privacyOnly = false } = {}) {
  return PROVIDERS.filter((p) => {
    if (!has(p, env)) return false;
    if (privacyOnly) return p.privacy === true;
    if (needTools && !p.tools) return false;
    if (p.paid && !allowPaid) return false;
    return true;
  });
}

// PURE: a flat try-list of {provider, model} in fallback order — every model of provider 1, then provider 2…
// so a single rate-limited model rolls to its sibling before we abandon a provider entirely.
export function routePlan(opts = {}) {
  const out = [];
  for (const p of availableProviders(opts)) for (const model of p.models) out.push({ providerId: p.id, label: p.label, url: p.url, keyEnv: p.keyEnv, model, tools: p.tools });
  return out;
}
