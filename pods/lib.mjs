// Pod-agnostic client helpers — every pod worker is a CLIENT of the control-plane (emits events = the
// audit trail) and mirrors itself onto the HQ floor so you watch it work in Jarvis World. The Gov pod
// wraps these in pods/gov/lib.mjs (adds the entity profile + a gov-defaulted mirror). Dependency-free.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { llm, llmBatch } from './model-router.mjs';
import { getSecret } from '../control-plane/vault.mjs';

export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url))); // pods/ -> repo root

export function env(k, d = '') {
  if (process.env[k]) return process.env[k];
  try { const m = fs.readFileSync(path.join(ROOT, '.env'), 'utf8').match(new RegExp('^' + k + '=(.+)$', 'm')); if (m) return m[1].trim(); } catch { /* */ }
  return d;
}

// CP/HQ resolve through env() (process.env OR .env) — the old process.env-only read meant pod workers
// launched outside compose (this PC) silently emitted their audit events to an empty localhost.
export const CP_URL = env('CONTROL_PLANE_URL', 'http://localhost:8787').replace(/\/$/, '');
export const HQ_URL = env('HQ_URL', '').replace(/\/$/, '');

// secret(agent, name) — the LEAST-PRIVILEGE way a pod reads a scoped credential (doctrine directive #3).
// Routes through the vault broker, which enforces the per-agent ACL and LOGS any unauthorized request.
// Degrades gracefully: an allowed-but-unset key returns '' (the pod falls back, e.g. scout → simulated
// feed); a DENIED key is logged as a security event by the vault and also returns '' so a misconfigured
// ACL can never crash a running pod. Use this — not env() — for anything sensitive (API keys, tokens).
export function secret(agent, name) {
  try { return getSecret(agent, name) || ''; }
  catch { return ''; } // vault already logged the denial; degrade instead of throwing
}

export async function emit(ev) {
  try { const r = await fetch(CP_URL + '/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(ev) }); return await r.json().catch(() => ({})); } catch { return {}; }
}
// Create a GATED approval the right way: record it on the control-plane (system of record) AND surface it
// on the HQ floor WITH a callback to that control-plane id — so approving ONLINE (HQ over Tailscale) fires
// the very same executor the companion does, instead of being a dead end. Returns the control-plane record.
export async function gateApproval(approvalEvent, hq = {}) {
  const rec = await emit(approvalEvent);
  const callback = rec && rec.id ? `${CP_URL}/approvals/${rec.id}` : undefined;
  await hqApproval({ ...hq, callback });
  return rec;
}
export async function mirror(agent, state, text, pod = 'system') {
  if (!HQ_URL) return;
  const headers = { 'content-type': 'application/json' };
  if (env('HQ_TOKEN')) headers.authorization = 'Bearer ' + env('HQ_TOKEN');
  try { await fetch(HQ_URL + '/api/event', { method: 'POST', headers, body: JSON.stringify({ agent, pod, state, text }) }); } catch { /* */ }
}
export async function hqApproval(a) {
  if (!HQ_URL) return;
  const headers = { 'content-type': 'application/json' };
  if (env('HQ_TOKEN')) headers.authorization = 'Bearer ' + env('HQ_TOKEN');
  try { await fetch(HQ_URL + '/api/approval', { method: 'POST', headers, body: JSON.stringify(a) }); } catch { /* */ }
}

// Push a phone notification (best-effort) — used for time-sensitive alerts the operator must see off-screen.
export function notifyTelegram(text) {
  const token = env('TELEGRAM_BOT_TOKEN'); const chat = env('TELEGRAM_CHAT_ID');
  if (!token || !chat) return;
  fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text }) }).catch(() => { /* push is best-effort */ });
}
// Surface an alert on BOTH the HQ floor ("Needs you") and the operator's phone (Telegram). One call, two surfaces.
export async function notify({ title, detail = '', pod = 'Operations', verb = 'Open', xp = 0 } = {}) {
  await hqApproval({ pod, title, detail, verb, xp });
  notifyTelegram(`${title}\n${detail}`);
}

// The pod-facing LLM call. Delegates to the model-router (pods/model-router.mjs), which picks the
// provider deterministically and falls down a FREE chain so a pod never goes dark when Claude tokens
// run out: local Ollama → OpenRouter (free) → Claude. `agent` (a codename) still routes the Claude key
// through the vault for least privilege (doctrine #3). `privacy:true` forces LOCAL-ONLY (#ana/finance
// never leave the PC). `provider`/tier let a caller pin or hint a choice. Return shape is unchanged
// ({ text, cost, usage }) plus { provider, model } so callers can see which brain answered.
export async function claude(system, user, { tier = 'cheap', maxTokens = 700, agent = null, privacy = false, provider = null } = {}) {
  const r = await llm({ system, user, tier, maxTokens, agent, privacy, provider });
  if (!r.text && r.error) return { text: '', cost: 0, error: r.error, provider: r.provider || null };
  return { text: r.text, cost: r.cost || 0, usage: r.usage || {}, provider: r.provider, model: r.model };
}

// Fan-out variant of claude() for N INDEPENDENT prompts (scan scoring, bulk classification): one
// Message Batches call at 50% off instead of N sequential live calls. Anything the batch can't serve
// falls back to the normal per-item chain inside llmBatch — same "never go dark" guarantee. Results
// come back in input order with the same shape claude() returns. items: [{ system, user, ... }].
export async function claudeBatch(items, { tier = 'cheap', maxTokens = 700, agent = null, timeoutMs = null } = {}) {
  const rs = await llmBatch(items, { tier, maxTokens, agent, ...(timeoutMs ? { timeoutMs } : {}) });
  return rs.map((r) => ((!r.text && r.error)
    ? { text: '', cost: 0, error: r.error, provider: r.provider || null }
    : { text: r.text, cost: r.cost || 0, usage: r.usage || {}, provider: r.provider, model: r.model }));
}
