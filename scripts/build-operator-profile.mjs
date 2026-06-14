// Operator Profile deep-pass. Gathers your transcribed notes (Notability + voice) from the
// vault, sends them to Claude Opus, and writes a synthesized DRAFT Operator Profile you then
// review/edit. Re-run anytime you add more material — it rebuilds the draft.
//
//   node scripts/build-operator-profile.mjs
// Output: prompts/operator-profile.draft.md  (gitignored; review, then save as operator-profile.md)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url))); // jarvis/
const VAULT = path.join(os.homedir(), 'Desktop', 'JARVIS-Workspace');
const SOURCES = [path.join(VAULT, 'notability'), path.join(VAULT, 'transcripts'), path.join(VAULT, '_ingested')];
const TEMPLATE = path.join(ROOT, 'prompts', 'operator-profile-template.md');
const OUT = path.join(ROOT, 'prompts', 'operator-profile.draft.md');
const MAX_CHARS = 800000; // Opus handles it; covers notes + voice + journals

let KEY = process.env.ANTHROPIC_API_KEY || '';
if (!KEY) { try { const m = fs.readFileSync(path.join(ROOT, '.env'), 'utf8').match(/^ANTHROPIC_API_KEY=(.+)$/m); if (m) KEY = m[1].trim(); } catch { /* */ } }
if (!KEY) { console.error('No ANTHROPIC_API_KEY'); process.exit(1); }

function* walk(dir) {
  let items = []; try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const it of items) {
    const full = path.join(dir, it.name);
    if (it.isDirectory()) yield* walk(full);
    else if (/\.(md|txt)$/i.test(it.name)) yield full;
  }
}
let corpus = '';
let count = 0;
for (const dir of SOURCES) {
  for (const f of walk(dir)) {
    try {
      const body = fs.readFileSync(f, 'utf8');
      const chunk = `\n\n===== ${path.basename(f)} =====\n${body}`;
      if (corpus.length + chunk.length > MAX_CHARS) continue;
      corpus += chunk; count++;
    } catch { /* skip */ }
  }
}
let template = '';
try { template = fs.readFileSync(TEMPLATE, 'utf8'); } catch { /* */ }

console.log(`Synthesizing Operator Profile from ${count} note(s) (${Math.round(corpus.length / 1000)}k chars)…`);

const system = `You are building a sharp, honest "Operator Profile" for Vinicio Rodriguez from his own raw notes (handwritten notes OCR'd, voice memos, research). This profile gets injected into every AI agent that works for him, so it must capture who he REALLY is — not a flattering summary.

Follow this template structure exactly:
${template}

Rules:
- Infer goals, vision, risk tolerance, writing voice, decision rules, strengths, failures, and lessons FROM THE MATERIAL. Quote or paraphrase real specifics (ventures he's explored, books he studies, frameworks he's written, numbers/goals he's set).
- Where the notes reveal a decision rule or principle he believes (e.g. sales/diagnosis rules, money allocation, risk views), capture it.
- Be concrete and honest. If something is unclear or you're inferring, mark it «CONFIRM: ...» so he can verify.
- Keep it 2-3 pages. This is a draft for him to edit — end with a short "Gaps to fill" list of what the notes did NOT reveal (e.g. hours available, hard spending limits) that he should add.
- Plain text, his voice where you can infer it.`;

const r = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
  body: JSON.stringify({
    model: 'claude-opus-4-8',
    max_tokens: 4000,
    system,
    messages: [{ role: 'user', content: `Here is my raw material (${count} notes). Build my Operator Profile draft.\n${corpus}` }],
  }),
});
if (!r.ok) { console.error('Claude error', r.status, (await r.text()).slice(0, 300)); process.exit(1); }
const data = await r.json();
const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
fs.writeFileSync(OUT, text + `\n\n---\n_Draft generated ${new Date().toISOString()} from ${count} notes. Review, correct the «CONFIRM» marks, fill the gaps, then save as operator-profile.md._\n`, 'utf8');
console.log(`\nWrote draft → ${OUT}`);
console.log(`Tokens: in ${data.usage?.input_tokens}, out ${data.usage?.output_tokens}`);
