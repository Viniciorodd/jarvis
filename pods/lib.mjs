// Pod-agnostic client helpers — every pod worker is a CLIENT of the control-plane (emits events = the
// audit trail) and mirrors itself onto the HQ floor so you watch it work in Jarvis World. The Gov pod
// wraps these in pods/gov/lib.mjs (adds the entity profile + a gov-defaulted mirror). Dependency-free.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { modelFor } from './org.mjs';
import { getSecret } from '../control-plane/vault.mjs';

export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url))); // pods/ -> repo root
export const CP_URL = (process.env.CONTROL_PLANE_URL || 'http://localhost:8787').replace(/\/$/, '');
export const HQ_URL = (process.env.HQ_URL || '').replace(/\/$/, '');

export function env(k, d = '') {
  if (process.env[k]) return process.env[k];
  try { const m = fs.readFileSync(path.join(ROOT, '.env'), 'utf8').match(new RegExp('^' + k + '=(.+)$', 'm')); if (m) return m[1].trim(); } catch { /* */ }
  return d;
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

// `agent` (a codename) routes the key request through the vault so least privilege is enforced in code
// (doctrine #3). Without it, falls back to .env for back-compat (dev / the classifier path).
export async function claude(system, user, { tier = 'cheap', maxTokens = 700, agent = null } = {}) {
  let key;
  try { key = agent ? getSecret(agent, 'ANTHROPIC_API_KEY') : env('ANTHROPIC_API_KEY'); }
  catch (e) { return { text: '', cost: 0, error: e.message }; } // vault denied this agent
  if (!key) return { text: '', cost: 0, stub: true };
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: modelFor(tier), max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
    });
    if (!r.ok) return { text: '', cost: 0, error: r.status };
    const data = await r.json();
    const text = (data.content || []).map((c) => c.text || '').join('');
    const u = data.usage || {};
    const cost = ((u.input_tokens || 0) * 0.8 + (u.output_tokens || 0) * 4) / 1e6;
    return { text, cost, usage: u };
  } catch (e) { return { text: '', cost: 0, error: e.message }; }
}
