// OCR large/long PDFs that failed the batch (timeout or 413) by splitting into page-batches,
// OCR'ing each via Claude, then combining. Reads originals read-only.
//   node scripts/ocr-large-pdf.mjs "<file1.pdf>" "<file2.pdf>" ...
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { PDFDocument } from 'pdf-lib';

const OUT = path.join(os.homedir(), 'Desktop', 'JARVIS-Workspace', '_ingested', 'pdf');
const BASE = process.env.JARVIS_OCR_BASE || '\\\\192.168.6.121\\NotabilityBackups';
const BATCH = 4; // pages per OCR call — small enough to dodge timeout/413
fs.mkdirSync(OUT, { recursive: true });

// An arg can be a real path OR a simple search substring (avoids shell-quoting $ / emoji / spaces).
function resolveFile(arg) {
  if (fs.existsSync(arg)) return arg;
  let hit = null;
  (function walk(d) {
    if (hit) return; let items; try { items = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const it of items) { if (hit) return; const full = path.join(d, it.name); if (it.isDirectory()) { if (it.name !== '#recycle') walk(full); } else if (/\.pdf$/i.test(it.name) && it.name.includes(arg)) hit = full; }
  })(BASE);
  return hit;
}

let KEY = process.env.ANTHROPIC_API_KEY || '';
if (!KEY) { try { const m = fs.readFileSync(path.join(path.dirname(path.dirname(new URL(import.meta.url).pathname.replace(/^\//, ''))), '.env'), 'utf8').match(/^ANTHROPIC_API_KEY=(.+)$/m); if (m) KEY = m[1].trim(); } catch { /* */ } }
if (!KEY) { console.error('No ANTHROPIC_API_KEY'); process.exit(1); }

async function ocrChunk(bytes) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 180000);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: ctrl.signal,
      headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-5', max_tokens: 8000,
        messages: [{ role: 'user', content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: Buffer.from(bytes).toString('base64') } },
          { type: 'text', text: 'Transcribe ALL text from every page verbatim (including handwriting), preserving structure and page breaks. Mark unclear words [unclear].' },
        ] }],
      }),
    });
    if (!r.ok) throw new Error('Claude ' + r.status);
    const d = await r.json();
    return (d.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  } finally { clearTimeout(t); }
}

for (const arg of process.argv.slice(2)) {
  const file = resolveFile(arg);
  if (!file) { console.log(`\n• "${arg}"  ✗ not found under ${BASE}`); continue; }
  const name = path.basename(file, '.pdf');
  process.stdout.write(`\n• ${name}  `);
  try {
    const src = await PDFDocument.load(fs.readFileSync(file));
    const n = src.getPageCount();
    process.stdout.write(`(${n} pages) `);
    const parts = [];
    for (let i = 0; i < n; i += BATCH) {
      const doc = await PDFDocument.create();
      const idx = Array.from({ length: Math.min(BATCH, n - i) }, (_, k) => i + k);
      const pages = await doc.copyPages(src, idx);
      pages.forEach((p) => doc.addPage(p));
      const bytes = await doc.save();
      process.stdout.write(`[${i + 1}-${i + idx.length}]`);
      parts.push(await ocrChunk(bytes));
    }
    fs.writeFileSync(path.join(OUT, name + '.md'), `# ${name}\n_source: ${file}_\n_OCR (split): ${new Date().toISOString()}_\n\n${parts.join('\n\n')}\n`, 'utf8');
    console.log(`  ✓ done (${parts.join('').length} chars)`);
  } catch (e) { console.log(`  ✗ FAILED: ${e.message}`); }
}
