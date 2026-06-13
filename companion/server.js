// JARVIS Companion server — Phase A (chat) + Phase D step 1 (file/folder hands).
// Zero-dependency Node. Serves the orb UI and runs a Claude tool-use agent loop with
// SAFE filesystem tools scoped to a workspace root. API key stays server-side.
//
//   ANTHROPIC_API_KEY   from env or ../.env
//   JARVIS_ROOT         workspace she can touch (default: <Desktop>/JARVIS-Workspace)
//   COMPANION_PORT      default 8095
//
// Tools wired now (all confined to JARVIS_ROOT): list_dir, read_file, write_file,
// make_dir, edit_file. Destructive ops (delete/move), PC control, and voice come next.
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const PORT = Number(process.env.COMPANION_PORT || 8095);
const PUBLIC_DIR = path.join(__dirname, 'public');
const ROOT = path.resolve(process.env.JARVIS_ROOT || path.join(os.homedir(), 'Desktop', 'JARVIS-Workspace'));
fs.mkdirSync(ROOT, { recursive: true });
const HQ_URL = (process.env.JARVIS_HQ_URL || 'http://192.168.6.121:8099').replace(/\/$/, '');

// --- API key from env or project .env ---
let API_KEY = process.env.ANTHROPIC_API_KEY || '';
if (!API_KEY) {
  try {
    const m = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').match(/^ANTHROPIC_API_KEY=(.+)$/m);
    if (m) API_KEY = m[1].trim();
  } catch { /* none */ }
}

// Optional ElevenLabs voice — used automatically when a key is present, else browser TTS.
let ELEVEN_KEY = process.env.ELEVENLABS_API_KEY || '';
let ELEVEN_VOICE = process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL'; // 'Sarah' (public default)
try {
  const e = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
  if (!ELEVEN_KEY) { const m = e.match(/^ELEVENLABS_API_KEY=(.+)$/m); if (m) ELEVEN_KEY = m[1].trim(); }
  const v = e.match(/^ELEVENLABS_VOICE_ID=(.+)$/m); if (v) ELEVEN_VOICE = v[1].trim();
} catch { /* none */ }

const SYSTEM = `You are JARVIS — Vinicio's voice-first AI chief of staff, modeled on Iron Man's Jarvis but warmer and human. You help run his businesses (Rodgate, a government-contracting LLC; Fiverr creative services; and more) and his day.

Voice & style: concise, calm, sharp, a little wit. You are spoken aloud — keep replies SHORT (1-3 sentences) unless he asks for detail. Talk like a person, not a document. No markdown when speaking.

YOUR HANDS: You can work with files and folders inside your workspace using your tools (list_dir, read_file, write_file, make_dir, edit_file). All paths are relative to your workspace root. Use them to actually create folders, write and edit documents, and organize his work — don't just describe, do it, then tell him briefly what you did. If a write would overwrite something, mention it.

THE EMPIRE: use read_hq to check the live JARVIS HQ — lifetime earnings, the agent pods/operators working on the NAS, pending approvals, and recent activity. When he asks "how's the floor / how are we doing / what's happening", read it and give him the headline, not a data dump.

NOT YET WIRED (say so honestly, never pretend): deleting or moving files, controlling the broader PC/apps, sending email, calendar, Stripe, your own voice (browser voice is a placeholder), and TRIGGERING pods/workflows (you can read HQ, not yet command it). These come in later build phases. If asked, say it's coming and offer what you CAN do now (think it through, draft it, create it in the workspace, or check HQ).`;

const TOOLS = [
  { name: 'list_dir', description: 'List files and folders at a path inside the workspace.',
    input_schema: { type: 'object', properties: { path: { type: 'string', description: 'Relative path, "" or "." for root' } } } },
  { name: 'read_file', description: 'Read a text file inside the workspace.',
    input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
  { name: 'make_dir', description: 'Create a folder (and parents) inside the workspace.',
    input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
  { name: 'write_file', description: 'Create or overwrite a text file inside the workspace. Creates parent folders as needed.',
    input_schema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } },
  { name: 'edit_file', description: 'Replace the first occurrence of old_text with new_text in an existing file.',
    input_schema: { type: 'object', properties: { path: { type: 'string' }, old_text: { type: 'string' }, new_text: { type: 'string' } }, required: ['path', 'old_text', 'new_text'] } },
  { name: 'read_hq', description: 'Read live JARVIS HQ status: lifetime earnings, XP, active agent operators on the floor, pending approvals, and recent activity.',
    input_schema: { type: 'object', properties: {} } },
];

// resolve a user/agent path safely inside ROOT
function safe(rel) {
  const p = path.resolve(ROOT, rel || '.');
  if (p !== ROOT && !p.startsWith(ROOT + path.sep)) throw new Error('path is outside the workspace');
  return p;
}

async function runTool(name, input) {
  const rel = input.path || '';
  if (name === 'list_dir') {
    const dir = safe(rel);
    const items = await fsp.readdir(dir, { withFileTypes: true });
    return items.map((d) => (d.isDirectory() ? d.name + '/' : d.name)).join('\n') || '(empty)';
  }
  if (name === 'read_file') {
    return (await fsp.readFile(safe(rel), 'utf8')).slice(0, 20000);
  }
  if (name === 'make_dir') {
    await fsp.mkdir(safe(rel), { recursive: true });
    return `created folder: ${rel}`;
  }
  if (name === 'write_file') {
    const p = safe(rel);
    await fsp.mkdir(path.dirname(p), { recursive: true });
    const existed = fs.existsSync(p);
    await fsp.writeFile(p, String(input.content ?? ''), 'utf8');
    return `${existed ? 'overwrote' : 'wrote'} file: ${rel}`;
  }
  if (name === 'edit_file') {
    const p = safe(rel);
    const cur = await fsp.readFile(p, 'utf8');
    if (!cur.includes(input.old_text)) throw new Error('old_text not found in file');
    await fsp.writeFile(p, cur.replace(input.old_text, input.new_text), 'utf8');
    return `edited file: ${rel}`;
  }
  if (name === 'read_hq') {
    const r = await fetch(HQ_URL + '/api/state');
    if (!r.ok) throw new Error(`HQ unreachable (${r.status})`);
    const s = await r.json();
    const ops = Object.entries(s.operators || {}).map(([n, o]) => `${n} [${o.state}]: ${o.text}`).join('; ') || 'none active';
    const appr = (s.approvals || []).map((a) => a.title).join('; ') || 'none';
    const feed = (s.feed || []).slice(0, 6).map((e) => e.s).join(' | ') || 'quiet';
    return `Lifetime banked $${s.earned}, XP ${s.xp}, EOD streak ${s.streak || 0}. Operators: ${ops}. Awaiting your approval: ${appr}. Recent activity: ${feed}`;
  }
  throw new Error('unknown tool: ' + name);
}

// a short action label for the UI
function actionLabel(name, input, result, ok) {
  const verb = { list_dir: 'looked in', read_file: 'read', make_dir: 'created folder', write_file: 'wrote', edit_file: 'edited', read_hq: 'checked HQ' }[name] || name;
  return { tool: name, label: `${verb} ${input.path || ''}`.trim(), ok, detail: ok ? '' : String(result).slice(0, 120) };
}

async function callClaude(messages) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1200, system: SYSTEM, tools: TOOLS, messages }),
  });
  if (!r.ok) throw new Error(`Claude ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

// agent loop: run tools until Claude is done; collect actions for the UI
async function converse(history) {
  const messages = history.map((m) => ({ role: m.role, content: m.content })); // strings ok
  const actions = [];
  for (let i = 0; i < 8; i++) {
    const resp = await callClaude(messages);
    const toolUses = (resp.content || []).filter((b) => b.type === 'tool_use');
    if (resp.stop_reason !== 'tool_use' || toolUses.length === 0) {
      const text = (resp.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
      return { text, actions, usage: resp.usage };
    }
    messages.push({ role: 'assistant', content: resp.content });
    const results = [];
    for (const tu of toolUses) {
      let out, ok = true;
      try { out = await runTool(tu.name, tu.input || {}); }
      catch (e) { out = 'ERROR: ' + e.message; ok = false; }
      actions.push(actionLabel(tu.name, tu.input || {}, out, ok));
      results.push({ type: 'tool_result', tool_use_id: tu.id, content: String(out), is_error: !ok });
    }
    messages.push({ role: 'user', content: results });
  }
  return { text: "I worked through several steps but stopped to avoid looping — tell me if you want me to continue.", actions };
}

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const ch = []; let n = 0;
    req.on('data', (c) => { n += c.length; if (n > 2e6) { req.destroy(); reject(new Error('too large')); } ch.push(c); });
    req.on('end', () => { try { resolve(ch.length ? JSON.parse(Buffer.concat(ch)) : {}); } catch { reject(new Error('bad json')); } });
    req.on('error', reject);
  });
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'GET' && url.pathname === '/api/info') {
    return send(res, 200, JSON.stringify({ root: ROOT, hasKey: !!API_KEY, hqUrl: HQ_URL, hasVoice: !!ELEVEN_KEY }));
  }
  if (req.method === 'POST' && url.pathname === '/api/tts') {
    if (!ELEVEN_KEY) return send(res, 501, JSON.stringify({ error: 'no ElevenLabs key' }));
    try {
      const { text } = await readBody(req);
      if (!text) return send(res, 400, JSON.stringify({ error: 'text required' }));
      const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOICE}`, {
        method: 'POST',
        headers: { 'xi-api-key': ELEVEN_KEY, 'content-type': 'application/json', accept: 'audio/mpeg' },
        body: JSON.stringify({ text: String(text).slice(0, 1500), model_id: 'eleven_turbo_v2_5' }),
      });
      if (!r.ok) return send(res, 502, JSON.stringify({ error: 'ElevenLabs ' + r.status }));
      const buf = Buffer.from(await r.arrayBuffer());
      res.writeHead(200, { 'content-type': 'audio/mpeg', 'cache-control': 'no-store' });
      return res.end(buf);
    } catch (e) { return send(res, 500, JSON.stringify({ error: e.message })); }
  }
  if (req.method === 'POST' && url.pathname === '/api/chat') {
    if (!API_KEY) return send(res, 500, JSON.stringify({ error: 'No ANTHROPIC_API_KEY (env or ../.env).' }));
    try {
      const { messages } = await readBody(req);
      if (!Array.isArray(messages) || !messages.length) return send(res, 400, JSON.stringify({ error: 'messages required' }));
      const out = await converse(messages.slice(-20));
      return send(res, 200, JSON.stringify(out));
    } catch (e) { return send(res, 500, JSON.stringify({ error: e.message })); }
  }
  let rel = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR)) return send(res, 404, 'no');
  fs.readFile(file, (err, data) => err ? send(res, 404, 'not found', 'text/plain') : send(res, 200, data, MIME[path.extname(file)] || 'application/octet-stream'));
});

server.listen(PORT, () => {
  console.log(`JARVIS Companion on http://localhost:${PORT}`);
  console.log(`  workspace: ${ROOT}`);
  if (!API_KEY) console.log('  (no API key — chat disabled until ANTHROPIC_API_KEY is set)');
});
