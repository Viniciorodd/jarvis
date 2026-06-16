// Writes the START of Vinicio's biography/memoir from his own corpus (notes + voice + journals).
// Outputs Biography/biography-draft.md: a chapter outline + the Prologue + Chapter 1, in his voice.
// Re-run after adding material (e.g. the physical notebook) to regenerate. Private (gitignored).
//   node scripts/write-biography.mjs
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname.replace(/^\//, '')));
const BIO = path.join(os.homedir(), 'Desktop', 'JARVIS-Workspace', 'Biography');
const SRC = path.join(BIO, 'source-material');
const OUT = path.join(BIO, 'biography-draft.md');
const MAX_CHARS = 1300000;

let KEY = process.env.ANTHROPIC_API_KEY || '';
if (!KEY) { try { const m = fs.readFileSync(path.join(ROOT, '.env'), 'utf8').match(/^ANTHROPIC_API_KEY=(.+)$/m); if (m) KEY = m[1].trim(); } catch { /* */ } }
if (!KEY) { console.error('No ANTHROPIC_API_KEY'); process.exit(1); }

let corpus = '';
try { for (const f of fs.readdirSync(SRC)) { if (/\.md$/i.test(f)) { const c = `\n\n${fs.readFileSync(path.join(SRC, f), 'utf8')}`; if (corpus.length + c.length <= MAX_CHARS) corpus += c; } } }
catch { console.error('Run build-biography-corpus.mjs first.'); process.exit(1); }
if (!corpus.trim()) { console.error('No source material found.'); process.exit(1); }

console.log(`Writing the biography from ${Math.round(corpus.length / 1000)}k chars of his own words…`);

const system = `You are a gifted biographer and memoirist writing the life story of Vinicio Rodriguez, drawing entirely from his own raw material: handwritten notes, voice memos, and private journals. This is HIS story, written to honor it.

Write a MEMOIR in the first person ("I") — it should read like Vinicio telling his own life, because the source is his own words. Capture his real voice: plain, direct, sincere, faith-threaded, bilingual touches (Spanish for family/faith), the warrior-but-weary spirit.

Produce, in this order:
1. **CHAPTER OUTLINE** — a chapter-by-chapter arc of his life as the material reveals it: roots (Paterson NJ, Dominican family), the early dream and hustle, the move to Pennsylvania, the real-estate fight (the wins and the brutal failures — 218 W Ridge, the debt, the lawsuits), the people who shaped and betrayed him, his faith, his battles with fear/burnout/depression, his love for his family (his mother, his father's decline, Ana), and the relentless drive toward freedom and a legacy. 8-14 chapters.
2. **PROLOGUE** — a short, powerful opening that sets the emotional center: a man with his back against the wall, building something to save his family and himself.
3. **CHAPTER 1** — the real first chapter, written in full, grounded in specific details from the material.

Craft: honest, dignified, vivid. Handle the hard parts (debt, depression, dark thoughts, family illness) with compassion and truth — this is a story of perseverance and love, not despair; show the fight, not just the wound. Use real specifics from his notes (places, deals, books that shaped him, sayings he repeats). Don't invent facts; where you infer, keep it true to the material. Markdown, with chapter headings.`;

const r = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST', headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
  body: JSON.stringify({ model: 'claude-opus-4-8', max_tokens: 8000, system, messages: [{ role: 'user', content: `Here is my life, in my own words (notes, voice, journals). Begin my memoir.\n${corpus}` }] }),
});
if (!r.ok) { console.error('Claude', r.status, (await r.text()).slice(0, 300)); process.exit(1); }
const d = await r.json();
const text = (d.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
fs.writeFileSync(OUT, `# The Memoir of Vinicio Rodriguez — DRAFT\n_Begun ${new Date().toISOString()} from his own notes, voice, and journals. Physical notebook still to come._\n\n${text}\n`, 'utf8');
console.log('\nWrote →', OUT);
console.log(`Tokens: in ${d.usage?.input_tokens}, out ${d.usage?.output_tokens}`);
