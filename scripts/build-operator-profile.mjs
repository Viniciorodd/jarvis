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
const EXISTING = path.join(ROOT, 'prompts', 'operator-profile.md'); // confirmed baseline (preserve)
const OUT = path.join(ROOT, 'prompts', 'operator-profile.draft.md');
const MAX_CHARS = 1300000; // Opus 1M-token context; covers notes + voice + journals + handwritten PDFs

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
let existing = '';
try { existing = fs.readFileSync(EXISTING, 'utf8'); } catch { /* first build — none yet */ }

console.log(`Synthesizing Operator Profile from ${count} note(s) (${Math.round(corpus.length / 1000)}k chars)${existing ? ' + existing confirmed profile' : ''}…`);

const baseline = existing
  ? `\n\nHIS CURRENT CONFIRMED PROFILE (authoritative — he reviewed/edited this himself). PRESERVE every confirmed fact, number, name, rule, and his exact voice. Do NOT contradict or drop anything here; his confirmed current facts WIN over older aspirational notes:\n<<<CONFIRMED>>>\n${existing}\n<<<END CONFIRMED>>>`
  : '';

const system = `You are deepening a sharp, honest "Operator Profile" for Vinicio Rodriguez from his own raw notes (handwritten OCR, voice memos/journals 2018–2026, research). This profile is injected into every AI agent that works for him, so it must capture who he REALLY is — not a flattering summary.

Follow this template structure exactly:
${template}
${baseline}

Your job: produce the FULL profile, keeping the confirmed baseline intact and ENRICHING it with what the fuller corpus now reveals — many voice journals were only just transcribed, so mine them for material the prior version missed.

Rules:
- PRESERVE all confirmed facts, numbers, names, rules, and his voice from the baseline. Build ON it; do not regress it.
- ADD depth from the corpus: recent developments/life events (esp. 2024–2026), additional failures→lessons, sharper voice examples and phrases he actually uses, decision rules/principles he states, evolving priorities. Quote or paraphrase real specifics.
- Where you add something NEW or inferred (not in the baseline), mark it «CONFIRM: ...» so he can verify. Do not «CONFIRM»-tag facts already confirmed in the baseline.
- Keep his structure and section headings. 2–3 pages, tight. End with a short "What's new in this pass" list (the key additions the newly-transcribed journals surfaced) and a "Gaps to fill" list.
- Plain text, his voice. Be concrete and honest — this is the soul of his system.`;

const r = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
  body: JSON.stringify({
    model: 'claude-opus-4-8',
    max_tokens: 8000,
    system,
    messages: [{ role: 'user', content: `Here is my raw material (${count} notes) — read all of it, then synthesize.\n${corpus}\n\n===== END OF RAW MATERIAL =====\n\nNow output ONLY my synthesized Operator Profile, following the system instructions and template exactly. Begin your reply with the line "# Operator Profile — VINICIO RODRIGUEZ". Do NOT echo, quote at length, or continue the raw material above — distill it into the profile.` }],
  }),
});
if (!r.ok) { console.error('Claude error', r.status, (await r.text()).slice(0, 300)); process.exit(1); }
const data = await r.json();
const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
fs.writeFileSync(OUT, text + `\n\n---\n_Draft generated ${new Date().toISOString()} from ${count} notes. Review, correct the «CONFIRM» marks, fill the gaps, then save as operator-profile.md._\n`, 'utf8');
console.log(`\nWrote draft → ${OUT}`);
console.log(`Tokens: in ${data.usage?.input_tokens}, out ${data.usage?.output_tokens}`);
