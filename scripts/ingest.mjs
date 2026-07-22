// JARVIS unified ingestion — "always know my latest notes & audio."
// Scans your source folders, processes only NEW/changed files (tracked in a manifest), and
// writes searchable text into the vault. Handles: audio (Whisper), Notability .note, PDFs
// (full handwriting OCR via Claude), images (vision OCR), Day One .zip exports, and text.
// Reads everything read-only; never modifies originals.
//
//   node scripts/ingest.mjs            # one pass over all sources
//   node scripts/ingest.mjs --watch 15 # re-scan every 15 minutes (always-updated mode)
//
// Sources (override with JARVIS_INGEST_DIRS, semicolon-separated):
//   <vault>/_inbox            ← DROP ZONE: put Day One .zip, Notability PDFs, notebook photos here
//   \\NAS\NotabilityBackups   ← your .note files
//   \\NAS\PersonalVault\Just Press Record ← voice memos
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';
import StreamZip from 'node-stream-zip';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const VAULT = process.env.JARVIS_VAULT || path.join(os.homedir(), 'Desktop', 'JARVIS-Workspace');
const INBOX = path.join(VAULT, '_inbox');
const OUT = path.join(VAULT, '_ingested');
const INDEX = path.join(VAULT, 'index');
const MANIFEST = path.join(INDEX, 'processed.json');
const WHISPER = (process.env.WHISPER_URL || 'http://192.168.6.121:9100').replace(/\/$/, '');
// Data-lake model: Jarvis reads your note/journal/audio folders ON THE NAS directly. Devices
// (PC/Mac/iPhone/iPad) back up into these; Jarvis pulls — you never hand-feed a single folder.
const NAS = '\\\\192.168.6.121';
const DEFAULT_DIRS = [
  INBOX, // optional extra drop-zone, still works
  `${NAS}\\NotabilityBackups`,
  `${NAS}\\PersonalVault\\Just Press Record`,
  `${NAS}\\PersonalVault\\DayOne Backups`,
  `${NAS}\\PersonalVault\\Notability PDFs`, // create this folder + back up Notability PDFs here
];
let dirsRaw = process.env.JARVIS_INGEST_DIRS || '';
if (!dirsRaw) { try { const m = fs.readFileSync(path.join(ROOT, '.env'), 'utf8').match(/^JARVIS_INGEST_DIRS=(.+)$/m); if (m) dirsRaw = m[1].trim(); } catch { /* */ } }
const DIRS = (dirsRaw ? dirsRaw.split(';') : DEFAULT_DIRS).map((d) => d.trim()).filter(Boolean)
  .map((d) => (process.platform === 'win32' ? d.replace(/\//g, '\\') : d));

const ONLY = (process.env.JARVIS_ONLY_EXT || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
let KEY = process.env.ANTHROPIC_API_KEY || '';
if (!KEY) { try { const m = fs.readFileSync(path.join(ROOT, '.env'), 'utf8').match(/^ANTHROPIC_API_KEY=(.+)$/m); if (m) KEY = m[1].trim(); } catch { /* */ } }

const OFF_LIMITS = new Set(['.jarvis-trash', 'node_modules', '.git', '#recycle', '#snapshot', '@eaDir', '.cloud', '.storage', 'Google Drive Sync Folder', 'OneDrive Sync Folder', 'iCloud', 'Dropbox']);
const AUDIO = new Set(['.m4a', '.mp3', '.wav', '.aac', '.mp4', '.ogg', '.flac', '.webm']);
const IMAGE = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const IMG_MEDIA = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };

for (const d of [VAULT, INBOX, OUT, INDEX]) fs.mkdirSync(d, { recursive: true });
let manifest = {}; try { manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); } catch { /* fresh */ }
const saveManifest = () => fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));

async function claude(body, timeoutMs = 150000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs); // don't let one slow/huge file freeze the batch
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal,
    });
    if (!r.ok) throw new Error('Claude ' + r.status + ': ' + (await r.text()).slice(0, 200));
    const d = await r.json();
    return (d.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  } finally { clearTimeout(timer); }
}
const visionOCR = (buf, media) => claude({ model: 'claude-sonnet-5', max_tokens: 1500, messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: media, data: buf.toString('base64') } }, { type: 'text', text: 'Transcribe ALL text in this image verbatim (handwritten or typed), preserving line breaks. Mark unclear words [unclear]. If no text, reply "(no readable text)".' }] }] });
const pdfOCR = (buf) => claude({ model: 'claude-sonnet-5', max_tokens: 8000, messages: [{ role: 'user', content: [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buf.toString('base64') } }, { type: 'text', text: 'Transcribe ALL text from every page of this document verbatim (including handwriting), preserving structure and page breaks. Mark unclear words [unclear].' }] }] });

function noteTyped(buf) {
  const JUNK = /(Key|Color|Font|Layout|Object|Array|Coords|Mode|Style|UUID|Index|Version|Number|Attributes|Origin|Dimension|Platform|Orientation|Document|Canvas|Media|Paper|Session|RGB|Alpha|class|hint|points|curves|groups|archiver|NSString|NSDictionary)/;
  const runs = buf.toString('latin1').match(/[\x20-\x7E]{8,}/g) || [];
  return [...new Set(runs.filter((r) => !JUNK.test(r) && !/[{}\\$#^_\[\]|<>]/.test(r) && r.trim().split(/\s+/).filter((w) => /^[A-Za-z][A-Za-z'.,!?:-]*$/.test(w)).length >= 3))].join('\n');
}

async function transcribeAudio(file) {
  const buf = await fsp.readFile(file);
  const fd = new FormData(); fd.append('audio_file', new Blob([buf]), path.basename(file));
  const r = await fetch(`${WHISPER}/asr?output=txt&task=transcribe`, { method: 'POST', body: fd });
  if (!r.ok) throw new Error('Whisper ' + r.status);
  return (await r.text()).trim();
}

// Day One zips are large and use a format adm-zip mishandles — use node-stream-zip. Async; takes a path.
async function dayOneEntries(filePath) {
  const zip = new StreamZip.async({ file: filePath });
  let names = [];
  try { names = Object.keys(await zip.entries()); } catch { await zip.close(); return null; }
  const out = [];
  for (const name of names.filter((n) => /\.json$/i.test(n))) {
    let data; try { data = JSON.parse((await zip.entryData(name)).toString('utf8')); } catch { continue; }
    const entries = data.entries || [];
    if (!entries.length) continue;
    let journal = name.replace(/\.json$/i, '');
    try { journal = decodeURIComponent(journal); } catch { /* keep raw */ }
    out.push(`# Journal: ${journal} (${entries.length} entries)`);
    for (const e of entries) out.push(`## ${e.creationDate || ''}\n${(e.text || '').trim()}`);
  }
  await zip.close();
  return out.length ? out.join('\n\n---\n\n') : null;
}

async function ingestOne(file) {
  const ext = path.extname(file).toLowerCase();
  const base = path.basename(file, ext);
  let text = '', kind = ext.slice(1) || 'file';
  if (AUDIO.has(ext)) { kind = 'audio'; text = await transcribeAudio(file); }
  else if (ext === '.note') { const z = new AdmZip(await fsp.readFile(file)); const s = z.getEntries().find((e) => /Session\.plist$/.test(e.entryName)); const thumb = z.getEntries().find((e) => /thumb.*\.png$/i.test(e.entryName)); kind = 'notability'; text = `## Typed\n${s ? noteTyped(s.getData()) : ''}\n\n## Handwriting (page 1)\n${thumb ? await visionOCR(thumb.getData(), 'image/png') : '(none)'}`; }
  else if (ext === '.pdf') {
    kind = 'pdf';
    const st = await fsp.stat(file);
    if (st.size > 28 * 1024 * 1024) { text = `(skipped — PDF too large for OCR: ${Math.round(st.size / 1e6)}MB; split it or export fewer pages)`; }
    else { text = await pdfOCR(await fsp.readFile(file)); }
  }
  else if (IMAGE.has(ext)) { kind = 'image'; text = await visionOCR(await fsp.readFile(file), IMG_MEDIA[ext]); }
  else if (ext === '.zip') { const t = await dayOneEntries(file); if (t === null) return null; kind = 'dayone'; text = t; }
  else if (ext === '.txt' || ext === '.md') { kind = 'text'; text = await fsp.readFile(file, 'utf8'); }
  else return null; // unsupported type — skip silently
  const outDir = path.join(OUT, kind); fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, base + '.md'), `# ${base}\n_source: ${file}_\n_ingested: ${new Date().toISOString()}_\n\n${text}\n`, 'utf8');
  return kind;
}

function* walk(dir) {
  let items = []; try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const it of items) {
    if (OFF_LIMITS.has(it.name) || it.name.startsWith('.')) continue;
    const full = path.join(dir, it.name);
    if (it.isDirectory()) yield* walk(full); else yield full;
  }
}

async function pass() {
  let done = 0, skip = 0, fail = 0, n = 0;
  for (const dir of DIRS) {
    if (!fs.existsSync(dir)) { console.log('(source missing, skipping) ' + dir); continue; }
    for (const file of walk(dir)) {
      if (ONLY.length && !ONLY.includes(path.extname(file).slice(1).toLowerCase())) continue;
      let st; try { st = fs.statSync(file); } catch { continue; }
      const sig = `${st.mtimeMs}:${st.size}`;
      if (manifest[file] === sig) { skip++; continue; }
      n++;
      try {
        const kind = await ingestOne(file);
        if (kind) { manifest[file] = sig; saveManifest(); done++; process.stdout.write(`✓ [${kind}] ${path.basename(file)}\n`); }
        else { manifest[file] = sig; saveManifest(); }
      } catch (e) { fail++; console.log(`✗ ${path.basename(file)} — ${e.message}`); }
    }
  }
  console.log(`\nPass complete: ${done} ingested, ${skip} unchanged, ${fail} failed. Output → ${OUT}`);
  return done;
}

const watchIdx = process.argv.indexOf('--watch');
if (!KEY) { console.error('No ANTHROPIC_API_KEY'); process.exit(1); }
if (watchIdx !== -1) {
  const mins = Number(process.argv[watchIdx + 1]) || 15;
  console.log(`Watch mode: scanning every ${mins} min. Drop new exports into ${INBOX}\n`);
  for (;;) { await pass(); await new Promise((r) => setTimeout(r, mins * 60000)); }
} else {
  await pass();
}
