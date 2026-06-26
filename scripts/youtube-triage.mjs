// youtube-triage.mjs — turn a YouTube "Watch Later" export into a glanceable, prioritized Obsidian
// note: keep the knowledge, skip the entertainment, bucket the keepers by topic. Pure title-based
// classification (deterministic, no LLM, no network) — so it scales from 200 to 2000 videos and is the
// one-time backlog clear-out. The going-forward summaries come later via the watch-later pod (deferred).
//
// Usage:
//   node scripts/youtube-triage.mjs "C:\path\watch_later_a.json" "C:\path\watch_later_b.json" [...]
//   (each input is a JSON array of { title, url }; defaults to the two Downloads exports if none given)
// Output: <VAULT_DIR>/07 - Knowledge/📺 To Absorb.md

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const VAULT_DIR = process.env.VAULT_DIR || path.join(os.homedir(), 'Documents', 'Second Brain');
const DEFAULT_INPUTS = [
  path.join(os.homedir(), 'Downloads', 'watch_later_videos vinicio.json'),
  path.join(os.homedir(), 'Downloads', 'watch_later_videos lurid.json'),
];

// PURE: clean a watch-later URL down to a canonical watch link + extract the video id.
export function videoId(url) {
  const m = String(url).match(/[?&]v=([A-Za-z0-9_-]{6,})/) || String(url).match(/youtu\.be\/([A-Za-z0-9_-]{6,})/);
  return m ? m[1] : '';
}
export function cleanUrl(url) { const id = videoId(url); return id ? `https://www.youtube.com/watch?v=${id}` : String(url); }

// ── classifier ────────────────────────────────────────────────────────────────────────────────────
// Ordered: strong-keep (gov / AI-build) wins outright; then entertainment is skipped; then topic keeps.
const has = (t, words) => words.some((w) => t.includes(w));
const BUCKETS = [
  { key: 'gov', label: '🏛️ Government contracting', test: (t) => has(t, ['government contract', 'gov contract', 'sources sought', 'sba ', 'set-aside', 'federal contract', 'middleman for government']) },
  { key: 'ai', label: '🤖 AI / Claude / building', test: (t) => has(t, ['claude', 'cowork', 'codex', ' mcp', 'llm', 'ai agent', 'ai tools', 'vibe cod', 'hermes agent', 'gpt', 'anthropic', 'headroom', 'local ai', 'self-educated', 'build apps', 'mobile app', 'ios app', 'recipe app', 'onboarding flows', 'usage limit']) },
  // entertainment → skip
  { key: 'skip', label: 'skip', test: (t) => has(t, [
    'fortnite', 'fncs', 'arc raiders', 'stardew', 'warzone', 'peterbot', 'ewc finals', 'duos', 'aimer', 'summit lan', 'tournament', 'gameplay', 'walkthrough', 'speedrun', 'assassins creed', 'reload elite', 'cup open', 'no shooting', 'goop showcase',
    'killer', 'murder', 'mvrder', 'k!ller', 'execut', 'arrested', 'indictment', 'federal charges', 'prison', 'court for', 'in court', 'trial', 'testified', 'vladtv', 'nojumper', 'drill rapper', 'foolio', 'lil durk', 'tay-k', 'chud the builder', 'wes watson', 'karmelo', 'jayy wick', 'allstar jr', 'set trippin', 'boosie', '6ix9ine', 'd4vd', 'romance scam', 'hitchhiker', 'mailman killer', 'colorado',
    'hasan', 'mizkif', 'bonnie blue', 'caught in 4k', 'caught in 4', 'scumbags', 'this is sad', 'controversial clip', 'being black for a day', 'pbd be held',
    'official video', ' mix)', 'la para', 'guerra completa', 'tu eres mi nena', 'estrellas brillar',
    'berserk', 'rimuru', 'slime', 'anime character',
    'rolex', 'dhgate', 'fake watch', 'signet ring', 'fire wardrobe', 'gentleman should wear',
    'fall asleep', 'for sleep', 'comforting scientific', 'old music', '18th century noble', 'philosophy of rick',
    'epstein', 'jd vance', 'pizza\'', 'codewords',
    'discord server', 'reaction roles', 'discohook', 'carl-bot', 'mimu', 'discord bot', 'discord feature', 'discord onboarding', 'communityone', 'discord tutorial',
    '$140,000 weekend', 'brokest millionaire', 'richest town', 'richest trader', 'weekend in italy', 'tfue', 'webcam look expensive', 'gaming youtube',
    'most powerful families', 'perception of time', 'disturbing cult', 'debt industry', 'expensive supplement', 'most disturbing book',
  ]) },
  { key: 'business', label: '💼 Business / money', test: (t) => has(t, ['business', 'make money', 'making money', 'boring businesses', 'machines you can buy', '1-person business', 'one-person', 'aso', 'from email', 'course seller', 'side hustle', 'clients', 'middleman', 'sell', 'startup', 'raising $', 'cyber security', '/month', '/hour', 'print money', 'rich']) },
  { key: 'health', label: '💪 Health / fitness', test: (t) => has(t, ['jacked', 'lifting', 'running', 'treadmill', 'exercise', 'sets', 'transforming your body', 'health cheat', 'grassfed', 'beef', 'workout', 'training basics']) },
  { key: 'reading', label: '📚 Reading / books', test: (t) => has(t, ['book', 'read', 'classics', 'novel', 'dostoevsky', 'camus', 'fiction', 'library', 'comprehension', 'crime and punishment', 'no longer human', 'the stranger', 'renaissance scholar', 'geniuses read', 'genius']) },
  { key: 'mindset', label: '🧠 Mindset / focus / systems', test: (t) => has(t, ['focus', 'distraction', 'reinvent', 'unrecognizable', 'productivity', 'journal', 'notebook', 'scrolling', 'discipline', 'power', 'greatness', 'slow life', 'god first', 'seek god', 'become yourself', 'price of', 'machiavelli', 'schopenhauer', 'jung', 'lucky', 'workaholic', 'average']) },
  { key: 'invest', label: '📈 Investing / trading  ⚠️ (you paused trading 6mo)', test: (t) => has(t, ['options', 'trading', 'trader', 'wheel strategy', 'covered call', 'tax lien', 'stock', 'regulators banned']) },
];

export function classify(title) {
  const t = ` ${String(title).toLowerCase()} `;
  for (const b of BUCKETS) if (b.test(t)) return b.key;
  return 'review';
}

// the handful worth watching first (by video id) — surfaced to the top regardless of bucket
const MUST_WATCH = new Set(['9CjJn8A07e4', 'WX-HS9o5VMY', 'd8BGxfW3Vj4', 'mKyaNr3jK-E', 'LboBIgC10uY', '7W75s7I-Gds', 'GrclaHACPhU', 'yaqpVGekrro']);

function load(inputs) {
  const rows = [];
  for (const f of inputs) {
    try { for (const v of JSON.parse(fs.readFileSync(f, 'utf8'))) rows.push({ title: v.title, id: videoId(v.url), url: cleanUrl(v.url) }); }
    catch (e) { console.error(`! skip ${f}: ${e.message}`); }
  }
  // dedupe by id (same video saved on both accounts)
  const seen = new Set(), out = [];
  for (const r of rows) { if (!r.id || seen.has(r.id)) continue; seen.add(r.id); out.push(r); }
  return out;
}

function buildNote(items) {
  const by = {}; for (const b of BUCKETS) by[b.key] = []; by.review = [];
  for (const it of items) by[classify(it.title)].push(it);
  const keepKeys = BUCKETS.filter((b) => b.key !== 'skip').map((b) => b.key).concat('review');
  const keepCount = keepKeys.reduce((n, k) => n + by[k].length, 0);
  const link = (it) => `- [ ] [${it.title.replace(/\|/g, '/')}](${it.url})`;

  const out = [];
  out.push('# 📺 To Absorb', '');
  out.push('> Your YouTube backlog, triaged: **keep the knowledge, skip the entertainment.** Glance, pull the 1–2 nuggets, check it off. The win is the summary, not the hours of video — if it can\'t be absorbed fast, skip it.', '');
  out.push(`> _${items.length} unique videos · **${keepCount} worth your time** · ${by.skip.length} skipped (entertainment). Generated ${new Date().toISOString().slice(0, 10)} by \`scripts/youtube-triage.mjs\`._`, '');
  out.push('> **Going forward:** stop using *Watch Later* (YouTube\'s API can\'t read it). Save keepers to an unlisted **📚 To Absorb** playlist — the watch-later pod will summarize those into notes here automatically (deferred until the cockpit + gov board ship).', '');

  const must = items.filter((it) => MUST_WATCH.has(it.id));
  if (must.length) { out.push('## ⭐ Watch these first', ''); for (const it of must) out.push(link(it)); out.push(''); }

  for (const b of BUCKETS) {
    if (b.key === 'skip' || !by[b.key].length) continue;
    out.push(`## ${b.label}  (${by[b.key].length})`, '');
    for (const it of by[b.key]) out.push(link(it));
    out.push('');
  }
  if (by.review.length) { out.push(`## ❓ Uncategorized — quick review  (${by.review.length})`, ''); for (const it of by.review) out.push(link(it)); out.push(''); }

  out.push('---', '');
  out.push(`## 🗑️ Skipped — entertainment  (${by.skip.length})`, '');
  out.push('> Fortnite, true-crime/drama, Discord setup, music, anime, sleep/ambiance, watches/style. Delete the playlist guilt-free — these aren\'t why you opened YouTube to learn.', '');
  out.push('<details><summary>show the skip list</summary>', '');
  for (const it of by.skip) out.push(`- ~~[${it.title.replace(/\|/g, '/')}](${it.url})~~`);
  out.push('', '</details>', '');
  return out.join('\n');
}

const inputs = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_INPUTS;
const items = load(inputs);
if (!items.length) { console.error('No videos loaded. Pass JSON export paths as arguments.'); process.exit(1); }
const note = buildNote(items);
// Reorg-proof: write into whichever "* Knowledge" folder the vault currently uses (now 05 - Knowledge).
const knowledgeDir = ['05 - Knowledge', '07 - Knowledge'].map((d) => path.join(VAULT_DIR, d)).find((d) => fs.existsSync(d)) || path.join(VAULT_DIR, '05 - Knowledge');
const outFile = path.join(knowledgeDir, '📺 To Absorb.md');
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, note);
const counts = {}; for (const it of items) { const k = classify(it.title); counts[k] = (counts[k] || 0) + 1; }
console.log(`✓ wrote ${outFile}`);
console.log(`  ${items.length} unique videos →`, JSON.stringify(counts));
