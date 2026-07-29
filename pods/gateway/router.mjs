// router.mjs — Jarvis's OWN free-token gateway. One call, many free providers, honest failover, and a local
// quota ledger so we spend each provider's published free tier deliberately instead of discovering the ceiling
// by getting 429'd. This is the part of OmniRoute worth having, rebuilt so WE control it: no stealth, no MITM,
// no third party holding a key or seeing a prompt.
//
// Every request tries the route plan in order and STOPS at the first real answer. A provider that 429s
// (rate-limited) or 402s (quota gone) is cooled down locally so we stop hammering it. A provider that errors
// is skipped. If every provider fails, we say so honestly — we never fabricate a completion.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { routePlan } from './providers.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LEDGER = path.join(HERE, '..', '..', 'control-plane', 'data', 'gateway-usage.json');
const readJson = (p, f) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return f; } };
const today = (now = new Date()) => new Date(now).toISOString().slice(0, 10);

export function loadUsage() { const d = readJson(LEDGER, {}); return d && typeof d === 'object' ? d : {}; }
function saveUsage(u) { try { fs.mkdirSync(path.dirname(LEDGER), { recursive: true }); fs.writeFileSync(LEDGER, JSON.stringify(u, null, 2)); } catch { /* best-effort */ } }

// PURE: record one call against a provider's daily counters. Eval-pinned.
export function noteUsage(usage = {}, providerId, { tokens = 0, ok = true, cooldownUntil = null, now = new Date() } = {}) {
  const day = today(now);
  const u = { ...usage };
  const cur = u[providerId] && u[providerId].day === day ? u[providerId] : { day, requests: 0, tokens: 0, failures: 0 };
  u[providerId] = {
    day,
    requests: cur.requests + 1,
    tokens: cur.tokens + (Number(tokens) || 0),
    failures: cur.failures + (ok ? 0 : 1),
    cooldownUntil: cooldownUntil || (u[providerId] && u[providerId].cooldownUntil) || null,
  };
  return u;
}

// PURE: is this provider cooled down (rate-limited earlier) right now? Eval-pinned.
export function isCooling(usage = {}, providerId, now = new Date()) {
  const c = usage[providerId] && usage[providerId].cooldownUntil;
  if (!c) return false;
  const t = new Date(c).getTime();
  return Number.isFinite(t) && t > new Date(now).getTime();
}

// PURE: a plain-English view of what's left today across providers — so the operator can SEE the free budget.
export function usageReport(usage = {}, now = new Date()) {
  const day = today(now);
  const rows = Object.entries(usage)
    .filter(([, v]) => v && v.day === day)
    .map(([id, v]) => ({ provider: id, requests: v.requests || 0, tokens: v.tokens || 0, failures: v.failures || 0, cooling: isCooling(usage, id, now) }));
  return { day, providers: rows, totalRequests: rows.reduce((s, r) => s + r.requests, 0), totalTokens: rows.reduce((s, r) => s + r.tokens, 0) };
}

const COOLDOWN_MS = 15 * 60000; // a 429 rests that provider for 15 minutes

// PURE: a deliberately rough token estimate for the OUTBOUND request. It only has to tell "comfortably under a
// provider's ceiling" from "over it", so a crude ratio beats a tokenizer dependency. Two corrections learned
// from a live Groq 413 on 2026-07-29, where it counted 13,810 against a payload we had estimated at ~12,000:
//   • 3.5 chars/token, not 4 — JSON escaping and prompt boilerplate tokenize denser than prose.
//   • `maxTokens` counts. Providers RESERVE the completion budget against the same per-minute ceiling.
// It errs high on purpose: over-estimating costs one skipped hop, under-estimating costs a guaranteed 413.
export function estimateTokens(messages = [], tools = null, maxTokens = 0) {
  const chars = JSON.stringify(messages || []).length + (tools ? JSON.stringify(tools).length : 0);
  return Math.ceil(chars / 3.5) + (Number(maxTokens) || 0);
}

// The one call every app/agent makes. OpenAI-shaped in, OpenAI-shaped out.
//   complete({ messages, tools, needTools, allowPaid, privacy, maxTokens })
// Returns { ok, provider, model, message, usage, tried } — or { ok:false, error, tried } when every provider
// failed. NEVER returns a fabricated completion.
export async function complete({ messages = [], tools = null, needTools = false, allowPaid = false, privacy = false, maxTokens = 1200, env = process.env, fetchImpl = fetch, now = new Date(), usageStore = null, persist = true } = {}) {
  const plan = routePlan({ env, needTools: needTools || !!tools, allowPaid, privacyOnly: privacy });
  if (!plan.length) return { ok: false, error: 'no provider available for this request (check keys, or privacy mode with no local model)', tried: [] };
  // usageStore lets a caller (and the evals) supply an isolated ledger — otherwise we use the real one.
  let usage = usageStore || loadUsage();
  const tried = [];
  const estTokens = estimateTokens(messages, tools, maxTokens);

  for (const hop of plan) {
    if (isCooling(usage, hop.providerId, now)) { tried.push({ provider: hop.providerId, model: hop.model, skipped: 'cooling down' }); continue; }
    // Don't spend a round-trip discovering a published limit we already know. This is a SKIP, not a failure:
    // the provider is healthy, the payload just doesn't fit it, so it must not count against its error budget.
    if (hop.maxRequestTokens && estTokens > hop.maxRequestTokens) { tried.push({ provider: hop.providerId, model: hop.model, skipped: 'payload ~' + estTokens + ' tok exceeds its ' + hop.maxRequestTokens + ' limit' }); continue; }
    const key = hop.keyEnv ? env[hop.keyEnv] : '';
    const body = { model: hop.model, messages, max_tokens: maxTokens };
    if (tools) { body.tools = tools; body.tool_choice = 'auto'; }
    try {
      const r = await fetchImpl(hop.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(key ? { Authorization: 'Bearer ' + key } : {}) },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90000),
      });
      if (r.status === 429 || r.status === 402) {          // rate-limited / out of free quota → rest it
        usage = noteUsage(usage, hop.providerId, { ok: false, cooldownUntil: new Date(new Date(now).getTime() + COOLDOWN_MS).toISOString(), now });
        tried.push({ provider: hop.providerId, model: hop.model, status: r.status, note: 'rate-limited — cooling down' });
        continue;
      }
      if (!r.ok) {
        // Keep the provider's own words. A 400 that says "tool schema invalid" is a bug WE can fix; without
        // the body it looks identical to a dead endpoint and we'd keep failing over forever instead.
        let detail = '';
        try { detail = typeof r.text === 'function' ? (await r.text()).slice(0, 200) : ''; } catch { /* body already consumed or absent */ }
        usage = noteUsage(usage, hop.providerId, { ok: false, now });
        tried.push({ provider: hop.providerId, model: hop.model, status: r.status, detail });
        continue;
      }
      const data = await r.json();
      const msg = data.choices && data.choices[0] && data.choices[0].message;
      if (!msg) { usage = noteUsage(usage, hop.providerId, { ok: false, now }); tried.push({ provider: hop.providerId, model: hop.model, note: 'empty response' }); continue; }
      usage = noteUsage(usage, hop.providerId, { tokens: (data.usage && data.usage.total_tokens) || 0, ok: true, now });
      if (persist) saveUsage(usage);
      return { ok: true, provider: hop.providerId, label: hop.label, model: hop.model, message: msg, usage: data.usage || null, tried };
    } catch (e) {
      usage = noteUsage(usage, hop.providerId, { ok: false, now });
      tried.push({ provider: hop.providerId, model: hop.model, error: String(e.message || e).slice(0, 80) });
    }
  }
  if (persist) saveUsage(usage);
  return { ok: false, error: 'every provider failed or is rate-limited', tried };
}
