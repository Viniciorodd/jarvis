// council.mjs — Andrej Karpathy's "LLM council" pattern, folded into Jarvis (no external app, no extra
// servers, no uv). For a HARD question, a panel of your DIFFERENT brains each answer, then a chairman
// synthesizes the best single answer — noting where they agree, flagging disagreements, and committing
// to a recommendation + confidence. Runs on the FREE stack first via the model-router.
//
// Why fold it in (vs cloning karpathy/llm-council): it reuses pods/model-router.mjs (so it inherits the
// local→OpenRouter→Claude fallback + the brain toggle), it's committable in-repo, and it costs $0 when
// the panel is local/free. Diverse brains > one brain on the questions that actually matter.
//
//   node pods/council.mjs "Should I bid solo or team on the West Point custodial RFP?"
//   node pods/council.mjs --json "..."
// Companion: POST /api/council { question }.
//
// NOTE: a council is for HARD/strategic questions and deliberately consults CLOUD brains too — so the
// question DOES leave the PC (unlike the privacy-local idea-miner). Don't send #ana/finance secrets here.

import { llm, brainStatus } from './model-router.mjs';

// The panel — one seat per distinct brain. Edit freely. Seats whose provider is unavailable are skipped.
export const SEATS = [
  { name: 'Local',      provider: 'local',      tier: 'draft' },  // qwen3.6 on your GPU — free, private-ish
  { name: 'OpenRouter', provider: 'openrouter', tier: 'draft' },  // a different free cloud model
  { name: 'Claude',     provider: 'claude',     tier: 'draft' },  // the strongest reasoner
];

const MEMBER_SYS = `You are one member of an advisory council answering the operator's question. Give your sharpest, most useful answer in a few tight sentences — a clear position with the key reason(s). No hedging, no filler. If the question needs an assumption, state it.`;

// ── PURE: which seats can we actually fill right now? (eval-tested) ─────────────────────────────────
export function pickCouncil(have = {}, seats = SEATS) {
  return seats.filter((s) => have[s.provider] !== false);
}

// ── PURE: anonymize opinions so the chairman judges substance, not brand (A, B, C…) ─────────────────
export function anonymize(opinions = []) {
  return opinions.map((o, i) => ({ label: String.fromCharCode(65 + i), text: o.answer }));
}

// ── PURE: the chairman's synthesis prompt (eval-tested) ─────────────────────────────────────────────
export function chairmanPrompt(question, opinions) {
  const panel = anonymize(opinions).map((o) => `### Member ${o.label}\n${o.text}`).join('\n\n');
  return `QUESTION:\n${question}\n\nThe council members answered independently:\n\n${panel}\n\n`
    + `As the chairman, synthesize ONE decisive answer. Structure it:\n`
    + `1. **Recommendation** — the single best course of action.\n`
    + `2. **Why** — the strongest reasoning, drawing on where members AGREE.\n`
    + `3. **Disagreements / risks** — where members differed and what would change the call.\n`
    + `4. **Confidence** — High / Medium / Low, in one line.\n`
    + `Judge the arguments on merit; do not merely average them.`;
}

const CHAIRMAN_SYS = `You are the chairman of an advisory council. You weigh the members' answers on merit and deliver one clear, decisive synthesis for a solo founder building a government-contracting business. Be direct and practical.`;

// pick the chairman brain: the strongest available (Claude → local → openrouter).
function chairmanSeat(have) {
  if (have.claude !== false) return { provider: 'claude', tier: 'reflect' };
  if (have.local !== false) return { provider: 'local', tier: 'draft' };
  return { provider: 'openrouter', tier: 'draft' };
}

// ── the run ─────────────────────────────────────────────────────────────────────────────────────────
export async function council(question, { agent = 'EXEC-01', maxTokens = 700 } = {}) {
  const q = String(question || '').trim();
  if (!q) return { ok: false, reason: 'empty question' };
  const have = brainStatus(agent).have;
  const seats = pickCouncil(have);
  if (!seats.length) return { ok: false, reason: 'no brains available' };

  // Stage 1 — every seat answers in parallel; a seat that errors (429 / OOM) is simply skipped.
  const settled = await Promise.all(seats.map(async (s) => {
    const r = await llm({ provider: s.provider, tier: s.tier, system: MEMBER_SYS, user: q, maxTokens, agent });
    return { name: s.name, provider: s.provider, model: r.model, answer: (r.text || '').trim(), error: r.text ? null : (r.error || 'no response') };
  }));
  const opinions = settled.filter((m) => m.answer);
  if (!opinions.length) return { ok: false, reason: 'every council member failed (is Ollama loaded / OpenRouter not rate-limited?)', members: settled };

  // Stage 2 — chairman synthesizes (skip if a single member answered — nothing to synthesize).
  let chairman = null;
  if (opinions.length >= 2) {
    const cs = chairmanSeat(have);
    const r = await llm({ provider: cs.provider, tier: cs.tier, system: CHAIRMAN_SYS, user: chairmanPrompt(q, opinions), maxTokens: 900, agent });
    if (r.text) chairman = { provider: r.provider, model: r.model, answer: r.text.trim() };
  }

  return { ok: true, question: q, members: settled, opinions: opinions.length, chairman: chairman || { note: 'single member — no synthesis needed', answer: opinions[0].answer, provider: opinions[0].provider } };
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────────────
if (process.argv[1] && process.argv[1].endsWith('council.mjs')) {
  const json = process.argv.includes('--json');
  const q = process.argv.slice(2).filter((a) => a !== '--json').join(' ');
  council(q).then((r) => {
    if (json) { console.log(JSON.stringify(r, null, 2)); return; }
    if (!r.ok) { console.error('council: ' + r.reason); process.exit(2); }
    const bar = '─'.repeat(64);
    console.log(`\n${bar}\nCOUNCIL · "${r.question}"\n${bar}`);
    for (const m of r.members) console.log(`\n▸ ${m.name} (${m.provider}${m.model ? '/' + m.model : ''})\n${m.error ? '  ✗ ' + m.error : '  ' + m.answer.replace(/\n/g, '\n  ')}`);
    console.log(`\n${bar}\n🪑 CHAIRMAN (${r.chairman.provider}${r.chairman.model ? '/' + r.chairman.model : ''})\n${bar}\n${r.chairman.answer}\n`);
  }).catch((e) => { console.error(e); process.exit(1); });
}
