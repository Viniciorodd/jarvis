// Shared helpers for the Fiverr Studio engines (thumbnail / cover / logo / product-edit).
// Dependency-free. Each engine imports what it needs from here so the deterministic bits (cost-capped
// image gen, JSON parsing, SVG escaping, data-URI embedding) live in ONE place (doctrine #1).

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getSecret } from '../control-plane/vault.mjs';

export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url))); // scripts/ -> repo root

// Least-privilege secret read scoped to the Creative Director (STUDIO-01). Falls back gracefully ('') so
// a standalone `node scripts/make-thumbnail.mjs` still works when a key is simply absent (doctrine #3).
const studioSecret = (name) => { try { return getSecret('STUDIO-01', name) || ''; } catch { return ''; } };

export function env(k, d = '') {
  if (process.env[k]) return process.env[k];
  try { const m = fs.readFileSync(path.join(ROOT, '.env'), 'utf8').match(new RegExp('^' + k + '=(.+)$', 'm')); if (m) return m[1].trim(); } catch { /* */ }
  return d;
}

// XML/SVG-safe escaping for any text we composite.
export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

// Tolerant JSON extractor for LLM responses (strips prose/fences, trailing commas, smart quotes).
export function safeJson(text) {
  const m = String(text || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { /* */ }
  try { return JSON.parse(m[0].replace(/,\s*([}\]])/g, '$1').replace(/[“”]/g, '"').replace(/[‘’]/g, "'")); } catch { return null; }
}

// Embed a local raster as a self-contained data URI (so composed SVGs render anywhere + export to PNG
// without tainting a canvas). Detects PNG/JPEG/WebP from magic bytes.
export function dataUri(absPath) {
  const buf = fs.readFileSync(absPath);
  const mime = buf[0] === 0x89 && buf[1] === 0x50 ? 'image/png'
    : buf[0] === 0xff && buf[1] === 0xd8 ? 'image/jpeg'
    : buf.slice(0, 4).toString() === 'RIFF' ? 'image/webp' : 'image/png';
  return `data:${mime};base64,${buf.toString('base64')}`;
}
export const bufToDataUri = (buf, mime = 'image/png') => `data:${mime};base64,${Buffer.from(buf).toString('base64')}`;

// Built-in Claude call (used standalone / from the server). Pod workers pass their own vault-scoped
// claudeFn so least-privilege (doctrine #3) is preserved on that path.
export async function defaultClaude(system, user, { maxTokens = 700, model } = {}) {
  const key = studioSecret('ANTHROPIC_API_KEY');
  if (!key) return { text: '' };
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: model || env('MODEL_DRAFT', 'claude-sonnet-5'), max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
    });
    if (!r.ok) return { text: '' };
    const d = await r.json();
    return { text: (d.content || []).map((c) => c.text || '').join('') };
  } catch { return { text: '' }; }
}

// Render a raster via the existing provider-aware engine (Cloudflare FLUX free by default; $10/mo code cap
// enforced inside gen-image.mjs). outRel is relative to ROOT. Returns { ok } or { ok:false, error }.
export function genImage(prompt, outRel, size = '1024x1024') {
  return new Promise((resolve) => {
    const ps = spawn(process.execPath, [path.join(ROOT, 'scripts', 'gen-image.mjs'), prompt, '--out', outRel, '--size', size], { cwd: ROOT });
    let err = '';
    ps.stderr.on('data', (d) => { err += d; });
    ps.on('close', (code) => resolve(code === 0 ? { ok: true } : { ok: false, error: (String(err).trim().split('\n').pop() || ('exit ' + code)).slice(0, 220) }));
    ps.on('error', (e) => resolve({ ok: false, error: e.message }));
  });
}

// One fal.ai call (image utilities: background removal, etc.). Uses the FAL_KEY already scoped to STUDIO-01.
export async function falRun(model, input) {
  const key = studioSecret('FAL_KEY') || studioSecret('FAL_API_KEY');
  if (!key) return { error: 'set FAL_KEY in .env to use this (fal.ai gives free starter credits).' };
  try {
    const r = await fetch('https://fal.run/' + model, {
      method: 'POST', headers: { Authorization: 'Key ' + key, 'content-type': 'application/json' }, body: JSON.stringify(input),
    });
    if (!r.ok) return { error: `fal ${r.status}: ${(await r.text()).slice(0, 300)}` };
    return { data: await r.json() };
  } catch (e) { return { error: e.message }; }
}

// Pick a font size so the longest line fits its column (Arial Black ≈ 0.6em/char; serif a touch wider).
export function fitFont(lines, usableW, base, factor = 0.6) {
  const longest = lines.reduce((m, l) => Math.max(m, String(l).length), 1);
  return Math.max(28, Math.min(base, Math.round(usableW / (factor * longest))));
}

// Common SVG defs (scrims + drop shadow + vignette) reused across composers.
export const SVG_DEFS = `
    <linearGradient id="scrimL" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".82"/><stop offset=".55" stop-color="#000" stop-opacity=".25"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>
    <linearGradient id="scrimR" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".82"/><stop offset=".55" stop-color="#000" stop-opacity=".25"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>
    <linearGradient id="scrimB" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".88"/><stop offset=".45" stop-color="#000" stop-opacity=".3"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>
    <radialGradient id="vig" cx="50%" cy="46%" r="72%"><stop offset="60%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity=".45"/></radialGradient>
    <filter id="ds" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="4" stdDeviation="7" flood-color="#000" flood-opacity=".55"/></filter>`;
