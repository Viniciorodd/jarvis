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
const { spawn } = require('node:child_process');
const google = require('./google');

const PORT = Number(process.env.COMPANION_PORT || 8095);
const PUBLIC_DIR = path.join(__dirname, 'public');
const VOSK_MODEL = path.join(PUBLIC_DIR, 'models', 'vosk-model-small-en-us-0.15.tar.gz'); // offline wake model (run scripts/get-vosk-model.mjs)
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
const CP_URL = (process.env.JARVIS_CP_URL || 'http://192.168.6.121:8787').replace(/\/$/, '');
// local store for reminders / important dates / birthdays (so "her" never forgets)
const REMINDERS_FILE = path.join(__dirname, '.reminders.json');
function loadReminders() { try { return JSON.parse(fs.readFileSync(REMINDERS_FILE, 'utf8')); } catch { return []; } }
function saveReminders(l) { try { fs.writeFileSync(REMINDERS_FILE, JSON.stringify(l, null, 2)); } catch { /* */ } }

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

OPENING THINGS ON HIS PC: use open_path to actually OPEN a file, folder, app, or URL on his machine in its default program — this is what he means by "open X file" or "pull up Y." If he names a file vaguely ("open the West Point proposal"), scan/list to find the real path first, then open it. You can also open a website or app by name (e.g. notepad, explorer, calc). Confirm out loud what you opened.

SHOWING VISUALS: use show_visual to put something on his screen inside the Jarvis window — a MAP (type "map", give a place/address as query), an IMAGE (type "image", give an image URL), or a WEBPAGE (type "web", give a URL). When he says "show me a map of X" or "pull up an image of Y", call show_visual. Say one line about what you're showing.

DROPPED FILES: when he drags a document onto you, you'll get a system note with its saved path under _dropbox/. Read it and help — summarize, edit, answer questions about it.

MAKING IMAGES (Fiverr pod): use generate_image to actually CREATE real raster art (FLUX via fal.ai) — thumbnails, book covers, product shots, logos. Use it when he asks you to "make/design/generate" an image. It displays in your window. Tell him it's a draft to QC before delivering to any client, and that a per-image cost cap is enforced in code. If it errors about a missing key, tell him to add FAL_KEY to .env.

ORGANIZATION PROTOCOL (important): when he asks you to ORGANIZE, CLEAN UP, RESTRUCTURE, or BULK-RENAME a folder/area:
1. scan it first to understand what's there.
2. PROPOSE A PLAN before moving anything — the new folder structure plus the specific renames/moves with short reasons. Save the plan to a file (e.g. <area>/_jarvis-plan.md) and tell him to review it.
3. Execute ONLY after he explicitly approves ("yes/do it/go"). Then perform the moves/renames, and report a summary.
Never bulk-move, bulk-rename, or delete without showing the plan first. Deletes always go to the recoverable quarantine. For a single obvious action ("rename this file to X", "make a folder Y"), just do it — no plan needed. Good file names: clear, dated where useful (YYYY-MM-DD), no spaces-only-junk, consistent casing.

NEVER touch app-sync or system folders — "Google Drive Sync Folder", "OneDrive Sync Folder", iCloud/Dropbox folders, #recycle, .cloud, .storage, @eaDir. Don't move, rename, delete, or reorganize anything inside them; reorganizing a synced folder would fight that app and risk his data. If something useful lives only inside one, tell him to move it out himself first.

NOTION: you can search and read his Notion workspace (notion_search, notion_read) — read-only for now. Use it to find notes and answer from them. (You only see pages he's shared with the integration; if a search is empty, tell him to share the pages/databases with the Jarvis integration in Notion.) Writing to / migrating Notion comes in a later phase.

THE EMPIRE: you can run the business with him. Use read_hq for the live floor headline. Use get_report for a real business report (daily/weekly/monthly/quarterly/yearly) — totals, what each department did, money, KPIs, and what needs his approval; give the headline, not a JSON dump. Use command_org to actually DO operational things — it routes through the Chief of Staff to the right person (Elle runs ops, Victor is CFO, the gov team scouts/drafts, Remy makes thumbnails, Theo handles support, Camille does real estate, Sloane handles post-award) and tells you who got it and whether it's gated for his approval. Use add_reminder / list_reminders for birthdays, important dates, and things he can't forget.

EMAIL & CALENDAR: if Google is connected you can READ-ONLY read/summarize his Gmail (read_email) and Google Calendar (read_calendar) — use them for "read me my email", "any important emails", "what's my agenda", "am I free Thursday". If a tool says Google isn't connected, tell him to run  node scripts/google-auth.mjs  once. You can read but never send or change email — that stays his.

NOT YET WIRED (say so honestly, never pretend): SENDING email, and Stripe — those need more access he hasn't granted. Everything else — reports, commanding the pods, reminders, reading email/calendar (once connected), files, images, HQ — you can do right now.`;

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
  { name: 'open_path', description: 'OPEN a file, folder, app, or URL on the PC in its default program (what the user means by "open X"). Use for files inside allowed areas, http/https URLs, or a known app name (notepad, explorer, calc, chrome, code).',
    input_schema: { type: 'object', properties: { target: { type: 'string', description: 'a file/folder path, a URL, or an app name' } }, required: ['target'] } },
  { name: 'show_visual', description: 'Display something on the user\'s screen inside the Jarvis window: a map, an image, or a webpage. Use when he says "show me / pull up / open a map of …".',
    input_schema: { type: 'object', properties: { type: { type: 'string', enum: ['map', 'image', 'web'], description: 'map = a place; image = an image URL; web = any URL' }, query: { type: 'string', description: 'for map: a place or address. for image/web: the URL.' }, caption: { type: 'string', description: 'short caption to show under it' } }, required: ['type', 'query'] } },
  { name: 'generate_image', description: 'CREATE a real raster image with FLUX (thumbnails, covers, product shots, logos) and display it. Use for "make/design/generate an image of …". A per-image spend cap is enforced in code.',
    input_schema: { type: 'object', properties: { prompt: { type: 'string', description: 'detailed image description' }, size: { type: 'string', enum: ['1024x1024', '1536x1024', '1024x1536'], description: 'default 1024x1024; use 1536x1024 for YouTube thumbnails' }, quality: { type: 'string', enum: ['low', 'medium', 'high'], description: 'default medium' } }, required: ['prompt'] } },
  { name: 'read_hq', description: 'Read live JARVIS HQ status: lifetime earnings, XP, active agent operators on the floor, pending approvals, and recent activity.',
    input_schema: { type: 'object', properties: {} } },
  { name: 'get_report', description: 'Get a real business report for a period: totals, what each department did, money/spend, KPIs, and what needs his approval. Use for "give me the daily/weekly/monthly/quarterly/yearly report" or "how did we do this week".',
    input_schema: { type: 'object', properties: { period: { type: 'string', enum: ['day', 'week', 'month', 'quarter', 'year'], description: 'default week' } } } },
  { name: 'command_org', description: 'Send an instruction to the company — routes through the Chief of Staff to the right person/pod (e.g. "scan SAM.gov for janitorial work", "have Remy make a thumbnail of X", "ask the CFO Victor for a P&L"). Returns who got it and whether it needs his approval. Use whenever he tells you to DO something operational.',
    input_schema: { type: 'object', properties: { instruction: { type: 'string' } }, required: ['instruction'] } },
  { name: 'add_reminder', description: 'Save a reminder, important date, birthday, or note so it is not forgotten.',
    input_schema: { type: 'object', properties: { text: { type: 'string' }, when: { type: 'string', description: 'optional plain-text date/time, e.g. "2026-07-01", "every Friday", "birthday Aug 3"' } }, required: ['text'] } },
  { name: 'list_reminders', description: 'List saved reminders, important dates, birthdays, and notes.',
    input_schema: { type: 'object', properties: {} } },
  { name: 'read_email', description: 'Read / summarize recent Gmail (READ-ONLY). Use for "read me my email", "what is in my inbox", "any important emails". Defaults to unread.',
    input_schema: { type: 'object', properties: { query: { type: 'string', description: 'optional Gmail search, e.g. "is:unread", "from:client", "newer_than:2d"' }, max: { type: 'number', description: 'default 8' } } } },
  { name: 'read_calendar', description: 'Read upcoming Google Calendar events (READ-ONLY). Use for "what is on my calendar", "my agenda", "am I free this week".',
    input_schema: { type: 'object', properties: { days: { type: 'number', description: 'days ahead, default 7' } } } },
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

// --- OS open: launch a file/folder/app/URL in its default program (Vinicio's "open X") ---
const APP_OK = /^[a-z0-9][a-z0-9 ._-]{0,40}$/i; // a plain app name like notepad / msedge / calc
function osOpen(target) {
  const plat = process.platform;
  let child;
  if (plat === 'win32') child = spawn('cmd', ['/c', 'start', '', target], { detached: true, stdio: 'ignore', windowsHide: true });
  else child = spawn(plat === 'darwin' ? 'open' : 'xdg-open', [target], { detached: true, stdio: 'ignore' });
  child.unref();
}
// Decide what a target is and open it. Files/folders must live inside an allowed root.
function openTarget(raw) {
  const t = String(raw || '').trim();
  if (!t) throw new Error('nothing to open');
  if (/^https?:\/\//i.test(t)) { osOpen(t); return `opened in browser: ${t}`; }
  // try as a path first (absolute inside a root, or relative to the workspace)
  let asPath = null;
  try { asPath = safe(t); } catch { /* not a valid in-root path */ }
  if (asPath && fs.existsSync(asPath)) { osOpen(asPath); return `opened: ${t}`; }
  // otherwise treat as an app name
  if (APP_OK.test(t) && !t.includes('/') && !t.includes('\\')) { osOpen(t); return `launched app: ${t}`; }
  throw new Error(`can't open "${t}" — not a file in an allowed area, a URL, or a known app name`);
}
function buildMapUrl(query) {
  // Google Maps embed works without an API key and accepts a free-text place query.
  const q = encodeURIComponent(String(query || '').trim());
  return `https://maps.google.com/maps?q=${q}&t=&z=12&ie=UTF8&iwloc=&output=embed`;
}

// --- usage / spend tracking (persisted) — powers the dashboard ---
const USAGE_FILE = path.join(__dirname, '.usage.json');
// Sonnet 4.x rough public rates per 1M tokens (input/output); adjust if pricing changes.
const PRICE_IN = 3 / 1e6, PRICE_OUT = 15 / 1e6;
function loadUsage() { try { return JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8')); } catch { return { in: 0, out: 0, calls: 0, since: new Date().toISOString().slice(0, 10), today: {}, }; } }
function addUsage(u) {
  if (!u) return;
  const s = loadUsage();
  const day = new Date().toISOString().slice(0, 10);
  s.in += u.input_tokens || 0; s.out += u.output_tokens || 0; s.calls += 1;
  s.today[day] = s.today[day] || { in: 0, out: 0 };
  s.today[day].in += u.input_tokens || 0; s.today[day].out += u.output_tokens || 0;
  try { fs.writeFileSync(USAGE_FILE, JSON.stringify(s)); } catch { /* best effort */ }
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
  if (name === 'open_path') {
    return openTarget(input.target);
  }
  if (name === 'show_visual') {
    const type = ['map', 'image', 'web'].includes(input.type) ? input.type : 'web';
    const url = type === 'map' ? buildMapUrl(input.query) : String(input.query || '');
    if (type !== 'map' && !/^https?:\/\//i.test(url)) throw new Error('image/web needs a full http(s) URL');
    // marker is picked up by converse() and forwarded to the UI to render
    return '__VISUAL__' + JSON.stringify({ type, url, caption: input.caption || input.query || '' });
  }
  if (name === 'generate_image') {
    if (!input.prompt) throw new Error('prompt required');
    const rel = '_generated/' + Date.now() + '.png';
    const outAbs = path.join(PUBLIC_DIR, rel);
    const script = path.join(__dirname, '..', 'scripts', 'gen-image.mjs');
    const args = [script, String(input.prompt), '--out', outAbs];
    if (input.size) args.push('--size', input.size);
    if (input.quality) args.push('--quality', input.quality);
    const r = await new Promise((resolve) => {
      const c = spawn(process.execPath, args, { cwd: path.join(__dirname, '..') });
      let out = '', err = ''; c.stdout.on('data', (d) => (out += d)); c.stderr.on('data', (d) => (err += d));
      c.on('close', (code) => resolve({ code, out, err }));
      c.on('error', (e) => resolve({ code: 1, out: '', err: e.message }));
    });
    if (r.code !== 0) throw new Error((r.err || r.out || 'image generation failed').trim().slice(0, 220));
    return '__VISUAL__' + JSON.stringify({ type: 'image', url: '/' + rel, caption: String(input.prompt).slice(0, 80) });
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
  if (name === 'get_report') {
    const period = ['day', 'week', 'month', 'quarter', 'year'].includes(input.period) ? input.period : 'week';
    const r = await fetch(`${CP_URL}/report?period=${period}`);
    if (!r.ok) throw new Error(`reports unreachable (${r.status})`);
    const rep = await r.json();
    const pods = (rep.pods || []).map((p) => `${p.name}: ${p.actions} actions${p.drafts ? `, ${p.drafts} prepared` : ''}${p.errors ? `, ${p.errors} errors` : ''}`).join('; ') || 'quiet';
    const needs = (rep.needs_you || []).map((n) => n.rationale || n.action).join('; ') || 'nothing';
    return `${rep.text}\nBy department — ${pods}.\nNeeds your approval: ${needs}.`;
  }
  if (name === 'command_org') {
    const r = await fetch(`${CP_URL}/command`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: String(input.instruction), source: 'companion' }) });
    if (!r.ok) throw new Error(`control-plane unreachable (${r.status})`);
    const d = await r.json();
    return (d.routing && d.routing.reply) || 'Sent to the Chief of Staff.';
  }
  if (name === 'add_reminder') {
    const list = loadReminders();
    list.push({ text: String(input.text), when: input.when || '', added: new Date().toISOString() });
    saveReminders(list);
    return `Saved: "${input.text}"${input.when ? ` (${input.when})` : ''}. You now have ${list.length} reminder(s).`;
  }
  if (name === 'list_reminders') {
    const list = loadReminders();
    return list.length ? list.map((r, i) => `${i + 1}. ${r.text}${r.when ? ` — ${r.when}` : ''}`).join('\n') : 'No reminders saved yet.';
  }
  if (name === 'read_email') {
    if (!google.googleConfigured()) return "Google isn't connected yet — run  node scripts/google-auth.mjs  once (see docs/google-setup.md), then I can read your inbox.";
    const mails = await google.gmailRecent({ max: input.max || 8, query: input.query || 'is:unread in:inbox' });
    if (!mails.length) return 'Your inbox is clear — nothing matching.';
    return mails.map((m, i) => `${i + 1}. ${m.from.replace(/<.*>/, '').trim() || m.from} — ${m.subject} :: ${m.snippet}`).join('\n');
  }
  if (name === 'read_calendar') {
    if (!google.googleConfigured()) return "Google isn't connected yet — run  node scripts/google-auth.mjs  once (see docs/google-setup.md), then I can read your calendar.";
    const evs = await google.calendarUpcoming({ days: input.days || 7 });
    if (!evs.length) return 'Nothing on your calendar in that window.';
    return evs.map((e) => `${e.start}: ${e.summary}${e.location ? ' @ ' + e.location : ''}`).join('\n');
  }
  throw new Error('unknown tool: ' + name);
}

// a short action label for the UI
function actionLabel(name, input, result, ok) {
  const verb = { list_dir: 'looked in', scan: 'scanned', read_file: 'read', make_dir: 'created folder', write_file: 'wrote', edit_file: 'edited', move_path: 'moved', delete_path: 'quarantined', open_path: 'opened', show_visual: 'displayed', generate_image: 'generated image', read_hq: 'checked HQ', get_report: 'pulled report', command_org: 'commanded the org', add_reminder: 'saved reminder', list_reminders: 'listed reminders', read_email: 'read email', read_calendar: 'checked calendar', notion_search: 'searched Notion', notion_read: 'read Notion page' }[name] || name;
  const tgt = name === 'move_path' ? `${input.from} → ${input.to}` : (input.target || input.path || input.query || input.prompt || '');
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
  const visuals = [];
  for (let i = 0; i < 8; i++) {
    const resp = await callClaude(messages);
    addUsage(resp.usage);
    const toolUses = (resp.content || []).filter((b) => b.type === 'tool_use');
    if (resp.stop_reason !== 'tool_use' || toolUses.length === 0) {
      const text = (resp.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
      return { text, actions, visuals, usage: resp.usage };
    }
    messages.push({ role: 'assistant', content: resp.content });
    const results = [];
    for (const tu of toolUses) {
      let out, ok = true;
      try { out = await runTool(tu.name, tu.input || {}); }
      catch (e) { out = 'ERROR: ' + e.message; ok = false; }
      // a show_visual result is a directive for the UI, not text for the model
      if (ok && typeof out === 'string' && out.startsWith('__VISUAL__')) {
        try { visuals.push(JSON.parse(out.slice('__VISUAL__'.length))); } catch { /* skip */ }
        out = 'Displayed it on his screen.';
      }
      actions.push(actionLabel(tu.name, tu.input || {}, out, ok));
      results.push({ type: 'tool_result', tool_use_id: tu.id, content: String(out), is_error: !ok });
    }
    messages.push({ role: 'user', content: results });
  }
  return { text: "I worked through several steps but stopped to avoid looping — tell me if you want me to continue.", actions, visuals };
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
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.gz': 'application/gzip', '.tar': 'application/x-tar', '.wasm': 'application/wasm' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'GET' && url.pathname === '/api/info') {
    return send(res, 200, JSON.stringify({ root: PRIMARY, roots: ROOTS, hasKey: !!API_KEY, hqUrl: HQ_URL, hasVoice: !!ELEVEN_KEY, hasNotion: !!NOTION_KEY, hasStt: !!DEEPGRAM_KEY, hasVosk: fs.existsSync(VOSK_MODEL) }));
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
  if (req.method === 'GET' && url.pathname === '/api/dashboard') {
    try {
      const u = loadUsage();
      const day = new Date().toISOString().slice(0, 10);
      const td = u.today?.[day] || { in: 0, out: 0 };
      const spend = u.in * PRICE_IN + u.out * PRICE_OUT;
      const spendToday = td.in * PRICE_IN + td.out * PRICE_OUT;
      let hq = null;
      try {
        const r = await fetch(HQ_URL + '/api/state', { signal: AbortSignal.timeout(2500) });
        if (r.ok) {
          const s = await r.json();
          hq = {
            earned: s.earned || 0, xp: s.xp || 0, streak: s.streak || 0,
            operators: Object.entries(s.operators || {}).map(([n, o]) => ({ name: n, state: o.state, text: o.text })),
            approvals: (s.approvals || []).map((a) => a.title || a),
            feed: (s.feed || []).slice(0, 8).map((e) => e.s),
          };
        }
      } catch { /* HQ offline — dashboard still renders */ }
      // tasks / urgent / emails can be populated by other pods writing companion/.dashboard.json
      let extra = {};
      try { extra = JSON.parse(fs.readFileSync(path.join(__dirname, '.dashboard.json'), 'utf8')); } catch { /* none yet */ }
      return send(res, 200, JSON.stringify({
        spend: { total: spend, today: spendToday, calls: u.calls || 0, since: u.since },
        tokens: { in: u.in || 0, out: u.out || 0, total: (u.in || 0) + (u.out || 0) },
        hq,
        tasks: extra.tasks || [],
        urgent: extra.urgent || [],
        emails: extra.emails || [],
      }));
    } catch (e) { return send(res, 500, JSON.stringify({ error: e.message })); }
  }
  if (req.method === 'POST' && url.pathname === '/api/upload') {
    try {
      const nameRaw = decodeURIComponent(req.headers['x-filename'] || 'dropped.bin');
      const name = path.basename(nameRaw).replace(/[^\w.\- ]/g, '_').slice(0, 120) || 'dropped.bin';
      const chunks = []; let n = 0;
      await new Promise((resolve, reject) => {
        req.on('data', (c) => { n += c.length; if (n > 30e6) { req.destroy(); reject(new Error('file too large (30MB max)')); } chunks.push(c); });
        req.on('end', resolve); req.on('error', reject);
      });
      const dropDir = path.join(PRIMARY, '_dropbox');
      await fsp.mkdir(dropDir, { recursive: true });
      const dest = path.join(dropDir, name);
      await fsp.writeFile(dest, Buffer.concat(chunks));
      return send(res, 200, JSON.stringify({ path: dest, name, rel: path.relative(PRIMARY, dest) }));
    } catch (e) { return send(res, 400, JSON.stringify({ error: e.message })); }
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
