// model-router.mjs — the FREE compute layer. Every LLM call in Jarvis goes through here so the system
// NEVER goes dark when Claude tokens run out: it falls down a chain of providers automatically.
//
//   FREE LOCAL (Ollama)  →  FREE/CHEAP CLOUD (OpenRouter)  →  PAID BEST (Claude)
//
// Doctrine fit: routing is DETERMINISTIC CODE (the LLM never picks its own provider) and the decision
// function `pickChain` is PURE + eval-pinned. Private work (#ana / finance) is forced LOCAL-ONLY so it
// never leaves the PC. Per-agent Claude keys still flow through the vault (least privilege, directive #3).
//
// Providers:
//   local       Ollama, OpenAI-compatible at OLLAMA_URL (default http://localhost:11434/v1). $0, private.
//   openrouter  https://openrouter.ai/api/v1, one key → many models; FREE via ":free" slugs. $0 fallback.
//   claude      Anthropic Messages API — best reasoning, used for the hard/important work.
//
// Used by pods/lib.mjs `claude()` (so all pods inherit fallback) and by the companion front door.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { getSecret } from '../control-plane/vault.mjs';
import { modelFor } from './org.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url))); // pods/ -> repo root
const BRAIN_FILE = path.join(ROOT, 'control-plane', 'brain-mode.json'); // runtime toggle (UI writes it)

// Small self-contained .env reader (router is imported by lib.mjs, so it must NOT import back from it).
export function env(k, d = '') {
  if (process.env[k] != null && process.env[k] !== '') return process.env[k];
  try { const m = fs.readFileSync(path.join(ROOT, '.env'), 'utf8').match(new RegExp('^' + k + '=(.+)$', 'm')); if (m) return m[1].trim(); } catch { /* no .env */ }
  return d;
}

// ── config getters ────────────────────────────────────────────────────────────────────────────────
const OLLAMA_URL = () => env('OLLAMA_URL', 'http://localhost:11434/v1').replace(/\/$/, '');
const LOCAL_SMART = () => env('LOCAL_MODEL', 'qwen3.6');          // reasoning / drafts (slower, smarter)
const LOCAL_FAST = () => env('LOCAL_MODEL_FAST', 'gemma4');       // bulk / classification (fast, light)
const OR_FREE = () => env('OPENROUTER_MODEL_FREE', 'meta-llama/llama-3.3-70b-instruct:free');
const OR_CHEAP = () => env('OPENROUTER_MODEL_CHEAP', OR_FREE());
const TIERS_BIG = new Set(['draft', 'reflect']);                 // "real work" tiers (quality-first)

// ── runtime brain-mode (the UI toggle) — file overrides .env so the chip is the live control ────────
function getPrefer() {
  try { const f = JSON.parse(fs.readFileSync(BRAIN_FILE, 'utf8')); if (f && PREFS.has(f.mode)) return f.mode; } catch { /* none */ }
  const e = String(env('LLM_PREFER', '')).toLowerCase();
  return PREFS.has(e) ? e : 'auto';
}
const PREFS = new Set(['local', 'openrouter', 'claude', 'auto']);
export function setPrefer(mode) {
  const m = PREFS.has(mode) ? mode : 'auto';
  try { fs.writeFileSync(BRAIN_FILE, JSON.stringify({ mode: m, ts: new Date().toISOString() }, null, 2)); } catch { /* */ }
  return m;
}

// ── key availability (so the chain skips providers we know we can't use) ────────────────────────────
function haveClaude(agent) {
  try { return !!(agent ? getSecret(agent, 'ANTHROPIC_API_KEY') : env('ANTHROPIC_API_KEY')); }
  catch { return false; } // vault denied this agent → treat as unavailable, fall to free
}
const haveOpenRouter = () => !!env('OPENROUTER_API_KEY');

// ── PURE: which providers to try, in order. Eval-pinned. The LLM never touches this. ────────────────
// task = { tier, provider, privacy, prefer, have:{claude,openrouter,local} }
export function pickChain({ tier = 'cheap', provider = null, privacy = false, prefer = 'auto', have = {} } = {}) {
  if (privacy) return ['local'];                              // #ana / finance NEVER leave the PC
  if (provider) return [provider];                            // explicit per-call choice wins (caller owns it)
  if (prefer && prefer !== 'auto') {                          // global manual override (the UI chip)
    const rest = ['claude', 'openrouter', 'local'].filter((p) => p !== prefer);
    return [prefer, ...rest].filter((p) => have[p] !== false);
  }
  const base = TIERS_BIG.has(tier)
    ? ['claude', 'openrouter', 'local']                      // real work: quality first, degrade to free
    : ['local', 'openrouter', 'claude'];                     // bulk/scan: free first, escalate if needed
  return base.filter((p) => have[p] !== false);              // drop providers known-unavailable (local stays)
}

// ── PURE: pick the concrete model for a provider + tier ─────────────────────────────────────────────
export function modelForProvider(provider, tier) {
  if (provider === 'local') return TIERS_BIG.has(tier) ? LOCAL_SMART() : LOCAL_FAST();
  if (provider === 'openrouter') return TIERS_BIG.has(tier) ? OR_CHEAP() : OR_FREE();
  // claude: honor the operator's MODEL_* override if it points at a claude model, else a sane default
  const m = modelFor(tier);
  if (/^claude/i.test(m)) return m;
  return ({ cheap: 'claude-haiku-4-5', draft: 'claude-sonnet-5', reflect: 'claude-opus-4-8' })[tier] || 'claude-haiku-4-5';
}

// ── PURE: real Claude pricing, $ per 1M tokens [input, output]. Eval-pinned — the spend guard
// (control-plane/spend.mjs) only works if these numbers are right. Longest-prefix match so dated or
// suffixed model IDs still resolve; unknown claude models fall back to Opus pricing (overestimate,
// never underestimate — directive #1). Cache writes bill at 1.25x input, cache reads at 0.1x.
const CLAUDE_PRICES = [
  ['claude-fable-5', [10, 50]],
  ['claude-opus', [5, 25]],
  ['claude-sonnet', [3, 15]],
  ['claude-haiku', [1, 5]],
];
export function claudeCost(model, u = {}) {
  const hit = CLAUDE_PRICES.find(([prefix]) => String(model).startsWith(prefix));
  const [inp, out] = hit ? hit[1] : [5, 25];
  return ((u.input_tokens || 0) * inp
    + (u.cache_creation_input_tokens || 0) * inp * 1.25
    + (u.cache_read_input_tokens || 0) * inp * 0.1
    + (u.output_tokens || 0) * out) / 1e6;
}

// ── PURE: thinking config per model + tier. Eval-pinned. ───────────────────────────────────────────
// reflect (weekly strategy / hard reasoning) gets adaptive thinking on models that support it — the
// single cheapest quality upgrade for the highest-stakes calls. Sonnet 5 runs adaptive BY DEFAULT when
// the param is omitted, so cheap/draft calls must send an explicit "disabled" or thinking tokens eat
// the small max_tokens budgets. Fable 5 rejects any thinking config (always on) — omit entirely.
export function thinkingFor(model, tier) {
  if (/^claude-fable/.test(model)) return undefined;
  if (tier === 'reflect' && /^claude-(opus-4-[678]|sonnet-(4-6|5))/.test(model)) return { type: 'adaptive' };
  if (/^claude-sonnet-5/.test(model)) return { type: 'disabled' };
  return undefined;
}

// ── Ollama availability + optional autostart (it's a silent background service with no window) ───────
let ollamaTried = false;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function ollamaUp() {
  try { const r = await fetch(OLLAMA_URL() + '/models', { signal: AbortSignal.timeout(2500) }); return r.ok; } catch { return false; }
}
export async function ensureOllama() {
  if (await ollamaUp()) return true;
  const want = String(env('OLLAMA_AUTOSTART', '')).toLowerCase();
  if (want !== '1' && want !== 'true' && want !== 'yes') return false;
  if (ollamaTried) return false;
  ollamaTried = true;
  try { const c = spawn(env('OLLAMA_BIN', 'ollama'), ['serve'], { detached: true, stdio: 'ignore' }); c.unref(); } catch { /* not installed / on PATH */ }
  for (let i = 0; i < 16; i++) { await sleep(500); if (await ollamaUp()) return true; } // up to ~8s for the service
  return false;
}

// ── provider callers — each returns { ok, text, cost, usage, model, provider, error?, status? } ─────
async function callClaude({ system, user, tier, maxTokens, agent }) {
  let key;
  try { key = agent ? getSecret(agent, 'ANTHROPIC_API_KEY') : env('ANTHROPIC_API_KEY'); }
  catch (e) { return { ok: false, error: 'vault: ' + e.message }; }
  if (!key) return { ok: false, error: 'no anthropic key' };
  const model = modelForProvider('claude', tier);
  const thinking = thinkingFor(model, tier);
  // adaptive thinking spends from max_tokens — give reflect calls headroom so the answer isn't truncated
  const max = thinking && thinking.type === 'adaptive' ? Math.max(maxTokens, 8000) : maxTokens;
  const body = { model, max_tokens: max, messages: [{ role: 'user', content: user }] };
  // cache the system prompt (operator profile etc.) — the stable prefix repeated across every agent call
  // in a pipeline run. Below the model's minimum prefix it silently doesn't cache; above it, repeat calls
  // within the 5-min TTL bill at ~0.1x. claudeCost() accounts for write premium + read discount.
  if (system) body.system = [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }];
  if (thinking) body.thinking = thinking;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(thinking && thinking.type === 'adaptive' ? 300000 : 60000),
    });
    if (!r.ok) return { ok: false, status: r.status, error: `anthropic ${r.status}` };
    const data = await r.json();
    const text = (data.content || []).map((c) => c.text || '').join('');
    const u = data.usage || {};
    const cost = claudeCost(model, u);
    return { ok: !!text.trim(), text, cost, usage: u, model, provider: 'claude', ...(text.trim() ? {} : { error: 'empty' }) };
  } catch (e) { return { ok: false, error: e.message }; }
}

// Ollama + OpenRouter share the OpenAI chat-completions shape.
async function callOpenAICompat({ base, key, model, system, user, maxTokens, provider, timeout }) {
  try {
    const headers = { 'content-type': 'application/json' };
    if (key) headers.authorization = 'Bearer ' + key;
    if (provider === 'openrouter') { headers['HTTP-Referer'] = 'https://github.com/jarvis'; headers['X-Title'] = 'Jarvis'; }
    const messages = [];
    if (system) messages.push({ role: 'system', content: system });
    messages.push({ role: 'user', content: user });
    const r = await fetch(base + '/chat/completions', {
      method: 'POST', headers,
      body: JSON.stringify({ model, max_tokens: maxTokens, messages, stream: false }),
      signal: AbortSignal.timeout(timeout || 60000),
    });
    if (!r.ok) return { ok: false, status: r.status, error: `${provider} ${r.status}` };
    const data = await r.json();
    const text = data?.choices?.[0]?.message?.content || '';
    return { ok: !!text.trim(), text, cost: 0, usage: data.usage || {}, model, provider, ...(text.trim() ? {} : { error: 'empty' }) };
  } catch (e) { return { ok: false, error: e.message }; }
}

const UNSURE = /\b(i'?m not sure|i do ?n'?o?t know|cannot determine|unable to (?:answer|help)|no idea)\b/i;

// ── the one entrypoint everything calls ─────────────────────────────────────────────────────────────
// { system, user, tier, maxTokens, agent, provider, privacy } → { text, cost, provider, model, usage, attempts }
export async function llm({ system = '', user = '', tier = 'cheap', maxTokens = 700, agent = null, provider = null, privacy = false } = {}) {
  const prefer = getPrefer();
  const have = { claude: haveClaude(agent), openrouter: haveOpenRouter(), local: true };
  const chain = pickChain({ tier, provider, privacy, prefer, have });
  const attempts = [];
  let lastErr = '';
  for (const p of chain) {
    let res;
    if (p === 'claude') {
      res = await callClaude({ system, user, tier, maxTokens, agent });
    } else if (p === 'openrouter') {
      const key = env('OPENROUTER_API_KEY');
      if (!key) { attempts.push('openrouter:no-key'); continue; }
      res = await callOpenAICompat({ base: 'https://openrouter.ai/api/v1', key, model: modelForProvider('openrouter', tier), system, user, maxTokens, provider: 'openrouter' });
    } else if (p === 'local') {
      await ensureOllama();
      res = await callOpenAICompat({ base: OLLAMA_URL(), key: null, model: modelForProvider('local', tier), system, user, maxTokens, provider: 'local', timeout: 120000 });
    } else { continue; }

    attempts.push(`${p}:${res.ok ? 'ok' : (res.error || res.status || 'fail')}`);
    if (res.ok && res.text && res.text.trim()) {
      // auto-escalate: a FREE model that flags uncertainty → keep going toward Claude (if still in the chain)
      const isFree = p === 'local' || p === 'openrouter';
      if (isFree && have.claude && chain.indexOf('claude') > chain.indexOf(p) && UNSURE.test(res.text)) {
        lastErr = 'low-confidence, escalating'; continue;
      }
      return { text: res.text, cost: res.cost || 0, provider: p, model: res.model, usage: res.usage || {}, attempts };
    }
    lastErr = res.error || ('status ' + res.status);
  }
  return { text: '', cost: 0, provider: null, error: lastErr || 'all providers failed', attempts };
}

// ── status for the UI chip / /api/brain ─────────────────────────────────────────────────────────────
export function brainStatus(agent = null) {
  return {
    prefer: getPrefer(),
    have: { claude: haveClaude(agent), openrouter: haveOpenRouter(), local: true },
    models: { local: LOCAL_SMART(), localFast: LOCAL_FAST(), openrouter: OR_FREE() },
    ollamaUrl: OLLAMA_URL(),
  };
}
