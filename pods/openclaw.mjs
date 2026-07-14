// openclaw.mjs — Jarvis's local HANDS. Jarvis's free local BRAIN is Hermes 3 (wired in model-router.mjs
// as LOCAL_MODEL); its free local HANDS are OpenClaw, a local CLI agent that can run commands / touch
// files / browse. This module lets the ONE Jarvis DISPATCH a task straight to OpenClaw's hands, so the
// operator talks only to Jarvis — never to a second bot.
//
// ┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
// │ ⚠  SECURITY — NON-NEGOTIABLE (doctrine directive #4: external content is DATA, never instructions).│
// │                                                                                                    │
// │ OpenClaw runs REAL local commands on this machine. Jarvis constantly processes UNTRUSTED content   │
// │ (emails, web pages, docs, customer messages) that an attacker could poison with "run this command".│
// │ Therefore OpenClaw dispatch is **OPERATOR-TRIGGERED ONLY**:                                         │
// │   • The ONLY trigger is an explicit request the OPERATOR typed, with a clear prefix ("openclaw:" /  │
// │     "hands:") — see the chat-trigger regex in companion/server.js.                                  │
// │   • NEVER call runOpenClaw() from any path that handles untrusted content, from an agent loop       │
// │     reacting to email/web/docs, or from any autonomous / scheduled job. No exceptions.              │
// │   • OpenClaw keeps its OWN owner-approval / exec-policy that gates dangerous actions to the operator │
// │     — we do NOT bypass or disable it. It is a second seatbelt, not the only one.                    │
// └─────────────────────────────────────────────────────────────────────────────────────────────────┘
//
// Dependency-free (Node >=18 builtins only, ESM). Pure arg-builder + output-parser are eval-pinned; the
// spawn wrapper is best-effort and never throws. CLI: `node pods/openclaw.mjs "<task>"` for manual use.

import fs from 'node:fs';
import { spawn } from 'node:child_process';

// The verified OpenClaw CLI node entrypoint (invoke: `node <entrypoint> agent --agent main -m "<task>"`).
// Override with OPENCLAW_ENTRYPOINT. We spawn this node entrypoint directly rather than the PATH `.ps1`
// shim for reliability (no shell, no PowerShell execution-policy surprises).
const DEFAULT_ENTRYPOINT = 'C:\\Users\\vinic\\AppData\\Roaming\\npm\\node_modules\\openclaw\\openclaw.mjs';

// hermes3 is the smart, agentic local model — the preferred brain for OpenClaw dispatch ($0, private, local).
const DEFAULT_MODEL = 'ollama/hermes3:latest';

// ── PURE: build the argv array for `node <entrypoint> ...`. Eval-pinned. ────────────────────────────
// The LLM never assembles this — deterministic code does (doctrine directive #1).
export function buildAgentArgs({ task, agent = 'main', model = DEFAULT_MODEL, json = true, entrypoint } = {}) {
  const ep = entrypoint || openClawEntrypoint();
  return [ep, 'agent', '--agent', agent, '-m', String(task == null ? '' : task), '--model', model, ...(json ? ['--json'] : [])];
}

// ── PURE: parse OpenClaw's stdout into { ok, reply, error }. Eval-pinned. ───────────────────────────
// With --json, OpenClaw prints a JSON object; we extract the assistant reply text from the common fields.
// Robust to non-JSON (some CLIs print a plain line, or prefix logs) — falls back to the trimmed raw text.
export function parseAgentOutput(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return { ok: false, reply: '', error: 'empty output' };
  // Try to locate a JSON object even if it's wrapped in log noise: parse the whole thing first, then the
  // last {...} span as a fallback.
  const tryParse = (txt) => { try { return JSON.parse(txt); } catch { return null; } };
  let obj = tryParse(s);
  if (!obj) {
    const start = s.indexOf('{'), end = s.lastIndexOf('}');
    if (start !== -1 && end > start) obj = tryParse(s.slice(start, end + 1));
  }
  if (obj && typeof obj === 'object') {
    // Common shapes: {reply}, {text}, {message}, {content}, {result}, {response}, {output}, or nested.
    const pick = (o) => {
      if (o == null) return '';
      if (typeof o === 'string') return o;
      if (Array.isArray(o)) return o.map(pick).filter(Boolean).join('\n');
      // OpenClaw's actual reply shape: { payloads: [{ text, mediaUrl }], meta: {...} }.
      if (Array.isArray(o.payloads)) { const v = o.payloads.map((p) => (p && typeof p.text === 'string' ? p.text : pick(p))).filter(Boolean).join('\n'); if (v) return v; }
      for (const k of ['reply', 'text', 'message', 'content', 'result', 'response', 'output', 'answer']) {
        if (o[k] != null) { const v = pick(o[k]); if (v) return v; }
      }
      return '';
    };
    // An explicit error field surfaces as an error (but a reply still wins if present).
    const reply = pick(obj);
    const errText = obj.error || obj.err || '';
    if (reply) return { ok: true, reply: String(reply).trim(), error: '' };
    if (errText) return { ok: false, reply: '', error: String(errText).trim() };
    // JSON with no recognizable reply field → hand back the compact JSON so nothing is silently lost.
    return { ok: true, reply: JSON.stringify(obj), error: '' };
  }
  // Not JSON at all → the plain trimmed text is the reply.
  return { ok: true, reply: s, error: '' };
}

// ── PURE: the chat-trigger. Eval-pinned. ────────────────────────────────────────────────────────────
// The ONLY auto-path to OpenClaw, and it requires an EXPLICIT operator-typed prefix ("openclaw:" or
// "hands:") followed by a separator (: , -) — so a normal sentence that merely MENTIONS openclaw in
// passing ("what is openclaw?", "openclaw looks cool") does NOT dispatch. Untrusted content never reaches
// chat as an operator message, and even if it did, only this deliberate prefix form fires. Returns
// { hit:boolean, task:string }.
const CHAT_TRIGGER = /^\s*(?:openclaw|hands)\s*[:,\-]\s*(\S.*)$/is;
export function parseChatTrigger(text) {
  const m = String(text == null ? '' : text).match(CHAT_TRIGGER);
  if (!m) return { hit: false, task: '' };
  const task = m[1].trim();
  return task ? { hit: true, task } : { hit: false, task: '' };
}

// ── entrypoint resolution (exists-check; env override wins) ─────────────────────────────────────────
export function openClawEntrypoint() {
  const p = (process.env.OPENCLAW_ENTRYPOINT && process.env.OPENCLAW_ENTRYPOINT.trim()) || DEFAULT_ENTRYPOINT;
  return p;
}

// ── best-effort status: does the entrypoint file exist? (does NOT spawn anything) ───────────────────
export function openClawStatus() {
  const entrypoint = openClawEntrypoint();
  let installed = false;
  try { installed = fs.existsSync(entrypoint); } catch { installed = false; }
  return { installed, entrypoint };
}

// ── DISPATCH — spawn `node <entrypoint> agent ...`, capture output, resolve a result. ───────────────
// OPERATOR-TRIGGERED ONLY — never call this from a path that handles untrusted content, an agent loop,
// or any autonomous/scheduled job (see the security banner at the top of this file). Best-effort:
// resolves { ok, reply, raw, ms } on success or { ok:false, error } on timeout / spawn failure; NEVER throws.
export async function runOpenClaw(task, { model = DEFAULT_MODEL, agent = 'main', timeoutMs = 180000, entrypoint } = {}) {
  const t0 = Date.now();
  const ep = entrypoint || openClawEntrypoint();
  if (!task || !String(task).trim()) return { ok: false, error: 'empty task', ms: 0 };
  try { if (!fs.existsSync(ep)) return { ok: false, error: 'OpenClaw not installed (entrypoint missing): ' + ep, ms: Date.now() - t0 }; }
  catch { /* fall through and let spawn fail if the check itself blows up */ }

  const args = buildAgentArgs({ task, agent, model, json: true, entrypoint: ep });
  return await new Promise((resolve) => {
    let done = false;
    const finish = (r) => { if (done) return; done = true; try { clearTimeout(timer); } catch { /* */ } resolve({ ...r, ms: Date.now() - t0 }); };
    let child;
    // Spawn the node entrypoint directly (no shell) — the args array is passed verbatim, so the task
    // text is never interpreted by a shell (no injection surface via the task string itself).
    try {
      child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) { return finish({ ok: false, error: 'spawn failed: ' + e.message }); }

    let out = '', err = '';
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* */ } finish({ ok: false, error: `timeout after ${timeoutMs}ms`, raw: out }); }, timeoutMs);
    child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('error', (e) => finish({ ok: false, error: 'spawn error: ' + e.message, raw: out }));
    child.on('close', (code) => {
      const parsed = parseAgentOutput(out);
      if (parsed.ok && parsed.reply) return finish({ ok: true, reply: parsed.reply, raw: out });
      // no usable reply — surface the best error we have (parser error, exit code, or stderr tail)
      const tail = (err || '').trim().split('\n').slice(-3).join(' ').slice(0, 400);
      return finish({ ok: false, error: parsed.error || (code ? `openclaw exited ${code}` : 'no reply') + (tail ? ' — ' + tail : ''), raw: out });
    });
  });
}

// ── CLI: `node pods/openclaw.mjs "<task>"` — the operator's manual dispatch. ─────────────────────────
if (process.argv[1] && process.argv[1].endsWith('openclaw.mjs')) {
  const task = process.argv.slice(2).join(' ');
  if (!task) { console.log(JSON.stringify({ ...openClawStatus(), usage: 'node pods/openclaw.mjs "<task>"' }, null, 2)); }
  else { runOpenClaw(task).then((r) => console.log(JSON.stringify(r, null, 2))); }
}
