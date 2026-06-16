// Pod-agnostic client helpers — every pod worker is a CLIENT of the control-plane (emits events = the
// audit trail) and mirrors itself onto the HQ floor so you watch it work in Jarvis World. The Gov pod
// wraps these in pods/gov/lib.mjs (adds the entity profile + a gov-defaulted mirror). Dependency-free.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { modelFor } from './org.mjs';

export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url))); // pods/ -> repo root
export const CP_URL = (process.env.CONTROL_PLANE_URL || 'http://localhost:8787').replace(/\/$/, '');
export const HQ_URL = (process.env.HQ_URL || '').replace(/\/$/, '');

export function env(k, d = '') {
  if (process.env[k]) return process.env[k];
  try { const m = fs.readFileSync(path.join(ROOT, '.env'), 'utf8').match(new RegExp('^' + k + '=(.+)$', 'm')); if (m) return m[1].trim(); } catch { /* */ }
  return d;
}

export async function emit(ev) {
  try { await fetch(CP_URL + '/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(ev) }); } catch { /* spine offline */ }
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

export async function claude(system, user, { tier = 'cheap', maxTokens = 700 } = {}) {
  const key = env('ANTHROPIC_API_KEY');
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
