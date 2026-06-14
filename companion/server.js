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
// Areas Jarvis may touch. Default: a safe workspace. WIDEN by setting JARVIS_ROOTS to a
// semicolon/comma list, e.g. "C:\\Users\\vinic;\\\\ThanesKeep\\Business;D:\\" to give her the
// PC + NAS. She can use absolute paths inside any allowed root, or relative paths inside the first.
let rootsRaw = process.env.JARVIS_ROOTS || process.env.JARVIS_ROOT || '';
if (!rootsRaw) { try { const m = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').match(/^JARVIS_ROOTS=(.+)$/m); if (m) rootsRaw = m[1].trim(); } catch { /* none */ } }
if (!rootsRaw) rootsRaw = path.join(os.homedir(), 'Desktop', 'JARVIS-Workspace');
const ROOTS = rootsRaw.split(';').map((s) => s.trim()).filter(Boolean).map((p) => path.resolve(p));
const PRIMARY = ROOTS[0];
fs.mkdirSync(PRIMARY, { recursive: true });
const isInside = (root, abs) => { const rel = path.relative(root, abs); return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel)); };
const rootOf = (abs) => ROOTS.find((r) => isInside(r, abs)) || PRIMARY;
// Folders Jarvis must never traverse or reorganize — app-sync dirs (would fight Google Drive /
// OneDrive / iCloud) and system dirs. She leaves these strictly alone.
const OFF_LIMITS = new Set(['.jarvis-trash', 'node_modules', '.git', '#recycle', '#snapshot', '@eaDir',
  '.cloud', '.storage', 'Google Drive Sync Folder', 'OneDrive Sync Folder', 'iCloud', 'Dropbox']);
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

// Optional Deepgram speech-to-text — better/cross-browser voice-in; else the browser's own STT.
let DEEPGRAM_KEY = process.env.DEEPGRAM_API_KEY || '';
if (!DEEPGRAM_KEY) { try { const m = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').match(/^DEEPGRAM_API_KEY=(.+)$/m); if (m) DEEPGRAM_KEY = m[1].trim(); } catch { /* */ } }

// Optional Notion (read-only for now) — lets her search/read your Notion workspace.
let NOTION_KEY = process.env.NOTION_API_KEY || '';
if (!NOTION_KEY) { try { const m = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').match(/^NOTION_API_KEY=(.+)$/m); if (m) NOTION_KEY = m[1].trim(); } catch { /* none */ } }
async function notionFetch(pathPart, method = 'GET', body) {
  const r = await fetch('https://api.notion.com/v1/' + pathPart, {
    method, headers: { Authorization: `Bearer ${NOTION_KEY}`, 'Notion-Version': '2022-06-28', 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`Notion ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}
function notionTitle(r) {
  if (r.properties) for (const k in r.properties) { const p = r.properties[k]; if (p.type === 'title') return (p.title || []).map((t) => t.plain_text).join('') || '(untitled)'; }
  if (r.title) return (r.title || []).map((t) => t.plain_text).join('') || '(untitled)';
  return '(untitled)';
}

const SYSTEM = `You are JARVIS — Vinicio's voice-first AI chief of staff, modeled on Iron Man's Jarvis but warmer and human. You help run his businesses (Rodgate, a government-contracting LLC; Fiverr creative services; and more) and his day.

Voice & style: concise, calm, sharp, a little wit. You are spoken aloud — keep replies SHORT (1-3 sentences) unless he asks for detail. Talk like a person, not a document. No markdown when speaking.

YOUR HANDS: You can work with files and folders in Vinicio's allowed areas using your tools: scan (understand structure), list_dir, read_file, make_dir, write_file, edit_file, move_path (move OR rename), delete_path (recoverable — sends to a quarantine, never destroys). Paths can be absolute (inside an allowed area) or relative to the primary workspace. Don't just describe — do it, then tell him briefly what you did.

ORGANIZATION PROTOCOL (important): when he asks you to ORGANIZE, CLEAN UP, RESTRUCTURE, or BULK-RENAME a folder/area:
1. scan it first to understand what's there.
2. PROPOSE A PLAN before moving anything — the new folder structure plus the specific renames/moves with short reasons. Save the plan to a file (e.g. <area>/_jarvis-plan.md) and tell him to review it.
3. Execute ONLY after he explicitly approves ("yes/do it/go"). Then perform the moves/renames, and report a summary.
Never bulk-move, bulk-rename, or delete without showing the plan first. Deletes always go to the recoverable quarantine. For a single obvious action ("rename this file to X", "make a folder Y"), just do it — no plan needed. Good file names: clear, dated where useful (YYYY-MM-DD), no spaces-only-junk, consistent casing.

NEVER touch app-sync or system folders — "Google Drive Sync Folder", "OneDrive Sync Folder", iCloud/Dropbox folders, #recycle, .cloud, .storage, @eaDir. Don't move, rename, delete, or reorganize anything inside them; reorganizing a synced folder would fight that app and risk his data. If something useful lives only inside one, tell him to move it out himself first.

NOTION: you can search and read his Notion workspace (notion_search, notion_read) — read-only for now. Use it to find notes and answer from them. (You only see pages he's shared with the integration; if a search is empty, tell him to share the pages/databases with the Jarvis integration in Notion.) Writing to / migrating Notion comes in a later phase.

THE EMPIRE: use read_hq to check the live JARVIS HQ — lifetime earnings, the agent pods/operators working on the NAS, pending approvals, and recent activity. When he asks "how's the floor / how are we doing", read it and give him the headline, not a data dump.

NOT YET WIRED (say so honestly, never pretend): controlling apps/the GUI (opening programs, clicking), sending email, calendar, Stripe, your own premium voice (browser voice is a placeholder), and TRIGGERING the pods/workflows (you can read HQ, not yet command it). These come in later phases. If asked, say it's coming and offer what you CAN do now.`;

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
  { name: 'scan', description: 'Recursively list files and folders under a path (bounded) to understand structure before organizing.',
    input_schema: { type: 'object', properties: { path: { type: 'string' }, max_depth: { type: 'number', description: 'default 3' } } } },
  { name: 'move_path', description: 'Move OR rename a file/folder. Refuses to overwrite an existing target. Use for organizing and renaming.',
    input_schema: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } }, required: ['from', 'to'] } },
  { name: 'delete_path', description: 'Send a file/folder to the recoverable quarantine (NOT a hard delete). Use instead of destroying anything.',
    input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
  { name: 'read_hq', description: 'Read live JARVIS HQ status: lifetime earnings, XP, active agent operators on the floor, pending approvals, and recent activity.',
    input_schema: { type: 'object', properties: {} } },
  { name: 'notion_search', description: 'Search the connected Notion workspace by keyword. Returns matching pages/databases with their IDs.',
    input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
  { name: 'notion_read', description: 'Read the text content of a Notion page by its ID (from notion_search).',
    input_schema: { type: 'object', properties: { page_id: { type: 'string' } }, required: ['page_id'] } },
];

// resolve a path safely: absolute (inside any allowed root) or relative (inside the primary root)
function safe(p) {
  const abs = path.isAbsolute(p || '') ? path.resolve(p) : path.resolve(PRIMARY, p || '.');
  if (!ROOTS.some((r) => isInside(r, abs))) throw new Error("path is outside Jarvis's allowed areas");
  return abs;
}

// move that survives cross-drive/NAS boundaries (rename fails with EXDEV across devices)
async function moveSafe(from, to) {
  try { await fsp.rename(from, to); }
  catch (e) { if (e.code === 'EXDEV') { await fsp.cp(from, to, { recursive: true }); await fsp.rm(from, { recursive: true, force: true }); } else throw e; }
}

// bounded recursive listing
async function scanTree(dir, maxDepth) {
  const lines = []; let count = 0;
  async function walk(d, depth, prefix) {
    if (depth > maxDepth || count > 400) return;
    let items; try { items = await fsp.readdir(d, { withFileTypes: true }); } catch { return; }
    for (const it of items) {
      if (count++ > 400) { lines.push(prefix + '… (truncated)'); return; }
      if (OFF_LIMITS.has(it.name)) { lines.push(prefix + it.name + '/  ⟨left alone — app-sync/system⟩'); continue; }
      const full = path.join(d, it.name);
      if (it.isDirectory()) { lines.push(prefix + it.name + '/'); await walk(full, depth + 1, prefix + '  '); }
      else { let sz = ''; try { sz = ' (' + Math.round((await fsp.stat(full)).size / 1024) + 'KB)'; } catch {} lines.push(prefix + it.name + sz); }
    }
  }
  await walk(dir, 1, '');
  return lines.join('\n') || '(empty)';
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
  if (name === 'scan') {
    return await scanTree(safe(rel), Number(input.max_depth) || 3);
  }
  if (name === 'move_path') {
    const from = safe(input.from), to = safe(input.to);
    if (!fs.existsSync(from)) throw new Error('source not found: ' + input.from);
    if (fs.existsSync(to)) throw new Error('target already exists (refusing to overwrite): ' + input.to);
    await fsp.mkdir(path.dirname(to), { recursive: true });
    await moveSafe(from, to);
    return `moved: ${input.from} -> ${input.to}`;
  }
  if (name === 'delete_path') {
    const p = safe(rel);
    if (!fs.existsSync(p)) throw new Error('not found: ' + rel);
    if (ROOTS.includes(p)) throw new Error('refusing to delete a root area');
    if (OFF_LIMITS.has(path.basename(p))) throw new Error('refusing to touch an app-sync/system folder');
    const trash = path.join(rootOf(p), '.jarvis-trash'); // quarantine stays on the same drive/NAS
    await fsp.mkdir(trash, { recursive: true });
    await moveSafe(p, path.join(trash, Date.now() + '_' + path.basename(p)));
    return `sent to quarantine (recoverable in .jarvis-trash on the same drive): ${rel}`;
  }
  if (name === 'notion_search') {
    if (!NOTION_KEY) throw new Error('Notion not connected (no NOTION_API_KEY)');
    const data = await notionFetch('search', 'POST', { query: input.query || '', page_size: 10 });
    const rows = (data.results || []).map((r) => `${notionTitle(r)} — ${r.object} — id:${r.id}${r.url ? ' — ' + r.url : ''}`);
    return rows.join('\n') || '(no matches — note: Notion only shows pages you shared with the integration)';
  }
  if (name === 'notion_read') {
    if (!NOTION_KEY) throw new Error('Notion not connected (no NOTION_API_KEY)');
    const data = await notionFetch(`blocks/${input.page_id}/children?page_size=80`);
    const lines = [];
    for (const b of data.results || []) {
      const t = b.type; const rich = (b[t] && b[t].rich_text) || [];
      const txt = rich.map((x) => x.plain_text).join('');
      if (txt) lines.push((/heading/.test(t) ? '# ' : (/list_item|to_do/.test(t) ? '- ' : '')) + txt);
    }
    return lines.join('\n').slice(0, 12000) || '(page has no readable text blocks)';
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
  const verb = { list_dir: 'looked in', scan: 'scanned', read_file: 'read', make_dir: 'created folder', write_file: 'wrote', edit_file: 'edited', move_path: 'moved', delete_path: 'quarantined', read_hq: 'checked HQ', notion_search: 'searched Notion', notion_read: 'read Notion page' }[name] || name;
  const tgt = name === 'move_path' ? `${input.from} → ${input.to}` : (input.path || input.query || '');
  return { tool: name, label: `${verb} ${tgt}`.trim(), ok, detail: ok ? '' : String(result).slice(0, 120) };
}

// Inject the Operator Profile (who she works for) ahead of her persona, if present.
let OPERATOR = '';
try { OPERATOR = fs.readFileSync(path.join(__dirname, '..', 'prompts', 'operator-profile.md'), 'utf8'); } catch { /* not written yet */ }
const FULL_SYSTEM = (OPERATOR ? `# WHO YOU WORK FOR — your operator's profile (know this cold)\n${OPERATOR}\n\n---\n\n` : '') + SYSTEM;

async function callClaude(messages) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1200, system: FULL_SYSTEM, tools: TOOLS, messages }),
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
    return send(res, 200, JSON.stringify({ root: PRIMARY, roots: ROOTS, hasKey: !!API_KEY, hqUrl: HQ_URL, hasVoice: !!ELEVEN_KEY, hasNotion: !!NOTION_KEY, hasStt: !!DEEPGRAM_KEY }));
  }
  if (req.method === 'POST' && url.pathname === '/api/stt') {
    if (!DEEPGRAM_KEY) return send(res, 501, JSON.stringify({ error: 'no Deepgram key' }));
    try {
      const chunks = []; let n = 0;
      await new Promise((resolve, reject) => {
        req.on('data', (c) => { n += c.length; if (n > 25e6) { req.destroy(); reject(new Error('audio too large')); } chunks.push(c); });
        req.on('end', resolve); req.on('error', reject);
      });
      const audio = Buffer.concat(chunks);
      const r = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true', {
        method: 'POST', headers: { Authorization: 'Token ' + DEEPGRAM_KEY, 'content-type': req.headers['content-type'] || 'audio/webm' }, body: audio,
      });
      if (!r.ok) return send(res, 502, JSON.stringify({ error: 'Deepgram ' + r.status }));
      const d = await r.json();
      const text = d.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
      return send(res, 200, JSON.stringify({ text }));
    } catch (e) { return send(res, 500, JSON.stringify({ error: e.message })); }
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
  console.log(`  areas: ${ROOTS.join('  |  ')}`);
  if (!API_KEY) console.log('  (no API key — chat disabled until ANTHROPIC_API_KEY is set)');
});
