// Gathers ALL of Vinicio's transcribed material into one organized "Biography" space — the
// source archive for the book. Reads the vault (handwritten notes, voice memos, journals,
// OCR'd PDFs) and consolidates into themed files + an index. Re-run anytime to refresh.
//   node scripts/build-biography-corpus.mjs
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const VAULT = path.join(os.homedir(), 'Desktop', 'JARVIS-Workspace');
const BIO = path.join(VAULT, 'Biography');
const SRC = path.join(BIO, 'source-material');
fs.mkdirSync(SRC, { recursive: true });

function* walk(dir) {
  let items = []; try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const it of items) { const full = path.join(dir, it.name); if (it.isDirectory()) yield* walk(full); else if (/\.(md|txt)$/i.test(it.name)) yield full; }
}
function gather(dirs) {
  const out = []; let n = 0;
  for (const d of dirs) for (const f of walk(d)) { try { out.push(`\n\n===== ${path.basename(f)} =====\n${fs.readFileSync(f, 'utf8')}`); n++; } catch { /* */ } }
  return { text: out.join(''), count: n };
}

const groups = {
  'handwritten-notes': [path.join(VAULT, 'notability'), path.join(VAULT, '_ingested', 'pdf')],
  'voice-memos': [path.join(VAULT, 'transcripts')],
  'journals': [path.join(VAULT, '_ingested', 'dayone')],
};

const counts = {};
let totalChars = 0;
for (const [name, dirs] of Object.entries(groups)) {
  const g = gather(dirs);
  fs.writeFileSync(path.join(SRC, name + '.md'), `# ${name.replace(/-/g, ' ')}\n_${g.count} sources · generated ${new Date().toISOString()}_\n${g.text}\n`, 'utf8');
  counts[name] = g.count; totalChars += g.text.length;
}

const index = `# Vinicio Rodriguez — Biography Source Archive

Everything transcribed from his own notes, voice, and journals — the raw material for the book.

## What's here (\`source-material/\`)
- **handwritten-notes.md** — ${counts['handwritten-notes']} Notability notes + OCR'd handwritten PDFs
- **voice-memos.md** — ${counts['voice-memos']} voice recordings (Just Press Record)
- **journals.md** — Day One journals (multiple journals incl. the 520-entry main + Goals, Business, Mindset, Quotes)

Total: ~${Math.round(totalChars / 1000)}k characters of his own words.

## Still missing (to complete the book)
- **Physical notebook** — photograph the pages → drop the images into JARVIS-Workspace/_inbox → run
  \`node scripts/ingest.mjs\` (OCR'd via vision) → re-run this script to fold them in.

## To start / continue the biography
\`node scripts/write-biography.mjs\`  → writes Biography/biography-draft.md (outline + opening chapters).
Re-run after adding new material. This is his private story — gitignored, stays on his machine.
`;
fs.writeFileSync(path.join(BIO, 'INDEX.md'), index, 'utf8');

console.log('Biography archive built →', BIO);
for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v} sources`);
console.log(`  total ~${Math.round(totalChars / 1000)}k chars`);
