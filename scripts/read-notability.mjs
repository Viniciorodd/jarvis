// Read Notability .note files WITHOUT converting them — opens a COPY in memory, never
// modifies the original (you keep editing in Notability). Extracts: typed text, metadata,
// embedded images + the page thumbnail, and (if ANTHROPIC_API_KEY set) uses Claude vision to
// OCR the handwriting it can see. Writes a searchable .md per note into the vault.
//
//   node scripts/read-notability.mjs "<a .note file OR a folder of them>" "<out folder>"
//   default src: \\192.168.6.121\NotabilityBackups   out: <Desktop>\JARVIS-Workspace\notability
//
// HONEST LIMITS: typed text extracts cleanly. Handwriting is pen strokes (no text) and the .note
// stores no full page images — only a page-1 thumbnail + any images you inserted. Claude vision
// reads those, so you get page-1 handwriting + inserted images, not every handwritten page. Full
// multi-page handwriting OCR needs a rendered (image/PDF) shadow — separate, opt-in.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import AdmZip from 'adm-zip';

const SRC = process.argv[2] || '\\\\192.168.6.121\\NotabilityBackups';
const OUT = process.argv[3] || path.join(os.homedir(), 'Desktop', 'JARVIS-Workspace', 'notability');
let KEY = process.env.ANTHROPIC_API_KEY || '';
if (!KEY) { try { const m = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\//, '')), '..', '.env'), 'utf8').match(/^ANTHROPIC_API_KEY=(.+)$/m); if (m) KEY = m[1].trim(); } catch { /* */ } }

fs.mkdirSync(OUT, { recursive: true });

// Pull only natural-language sentences out of the binary plist; drop all NSKeyedArchiver noise.
const PLIST_JUNK = /(Key|Color|Font|Layout|Object|Array|Coords|Mode|Style|UUID|Index|Version|Number|Attributes|Origin|Dimension|Platform|Orientation|Document|Canvas|Media|Paper|Session|RGB|Alpha|class|hint|points|curves|groups|archiver|NSString|NSDictionary)/;
function typedText(buf) {
  const runs = buf.toString('latin1').match(/[\x20-\x7E]{8,}/g) || [];
  const keep = runs.filter((r) => {
    if (PLIST_JUNK.test(r) || /[{}\\$#^_\[\]|<>]/.test(r)) return false;
    const words = r.trim().split(/\s+/).filter((w) => /^[A-Za-z][A-Za-z'.,!?:-]*$/.test(w));
    return words.length >= 3; // a real sentence has 3+ word-like tokens
  });
  return [...new Set(keep)].join('\n');
}

async function visionOCR(pngBuf, label) {
  if (!KEY) return '(vision OCR skipped — no ANTHROPIC_API_KEY)';
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6', max_tokens: 900,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: pngBuf.toString('base64') } },
        { type: 'text', text: 'This is a page (or thumbnail) from a handwritten/typed Notability note. Transcribe ALL text you can read, verbatim, preserving line breaks. Mark unclear words [unclear]. If there is no readable text, reply exactly "(no readable text)".' },
      ] }],
    }),
  });
  if (!r.ok) return `(vision failed: ${r.status})`;
  const d = await r.json();
  return (d.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
}

function listNotes(src) {
  const st = fs.statSync(src);
  if (st.isFile()) return src.toLowerCase().endsWith('.note') ? [src] : [];
  return fs.readdirSync(src).filter((n) => n.toLowerCase().endsWith('.note')).map((n) => path.join(src, n));
}

const notes = listNotes(SRC);
console.log(`${notes.length} .note file(s) under ${SRC}\nKey: ${KEY ? 'yes (vision on)' : 'no (typed-text only)'}  →  out: ${OUT}\n`);

let done = 0;
for (const note of notes) {
  const name = path.basename(note, '.note');
  const outMd = path.join(OUT, name + '.md');
  if (fs.existsSync(outMd)) { console.log('skip (done): ' + name); continue; }
  process.stdout.write('• ' + name + '  ');
  try {
    const zip = new AdmZip(fs.readFileSync(note)); // read a copy into memory; original untouched
    const entries = zip.getEntries();
    const sess = entries.find((e) => /Session\.plist$/.test(e.entryName));
    const typed = sess ? typedText(sess.getData()) : '';
    const imgs = entries.filter((e) => /\.(png|jpg|jpeg)$/i.test(e.entryName) && !/thumb/i.test(e.entryName));
    const thumb = entries.find((e) => /thumb.*\.png$/i.test(e.entryName));
    const assetDir = path.join(OUT, name + '_assets');

    let ocr = '';
    const toOCR = thumb || imgs[0];
    if (toOCR) { fs.mkdirSync(assetDir, { recursive: true }); ocr = await visionOCR(toOCR.getData(), name); }
    // save embedded images for reference
    for (const im of imgs.slice(0, 12)) { fs.mkdirSync(assetDir, { recursive: true }); fs.writeFileSync(path.join(assetDir, path.basename(im.entryName)), im.getData()); }

    const md = `# ${name}\n\n_source: ${note}_\n_read: ${new Date().toISOString()}_\n\n`
      + `## Typed text\n${typed || '(none — likely handwritten)'}\n\n`
      + `## Page (vision OCR — page 1 / thumbnail)\n${ocr || '(none)'}\n\n`
      + `## Embedded images\n${imgs.length ? imgs.map((i) => '- ' + path.basename(i.entryName)).join('\n') + `\n(saved to ${name}_assets/)` : '(none)'}\n`;
    fs.writeFileSync(outMd, md, 'utf8');
    console.log(`done  [typed ${typed.length}c | ocr ${ocr.length}c | ${imgs.length} imgs]`);
    done++;
  } catch (e) { console.log('FAILED: ' + e.message); }
}
console.log(`\nWrote ${done} note transcript(s) to ${OUT}. Originals untouched.`);
