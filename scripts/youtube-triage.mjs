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
import { fileURLToPath } from 'node:url';

const VAULT_DIR = process.env.VAULT_DIR || path.join(os.homedir(), 'Documents', 'Second Brain');
const CACHE_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '.yt-titles.json');
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
  { key: 'ai', label: '🤖 AI / Claude / building', test: (t) => has(t, ['claude', 'cowork', 'codex', ' mcp', 'llm', 'ai agent', 'ai tools', 'ai app', 'vibe cod', 'hermes agent', 'gpt', 'anthropic', 'headroom', 'local ai', 'self-educated', 'build apps', 'mobile app', 'ios app', 'recipe app', 'onboarding flows', 'usage limit', 'automation', 'n8n', 'zapier', 'no-code', 'agentic', 'workflow', 'chatgpt', 'gemini', 'prompt eng', 'cursor', 'copilot']) },
  // entertainment → skip
  { key: 'skip', label: 'skip', test: (t) => has(t, [
    'fortnite', 'fncs', 'arc raiders', 'stardew', 'warzone', 'peterbot', 'ewc finals', 'duos', 'aimer', 'summit lan', 'tournament', 'gameplay', 'walkthrough', 'speedrun', 'assassin', 'reload elite', 'cup open', 'no shooting', 'goop showcase', 'genshin', 'drop spots', 'aim guide', 'controller settings', 'best loadout', 'patch notes', 'tier list guide', 'season pass', 'battle pass', 'minecraft', 'roblox', 'gta', 'valorant', 'league of legends',
    'killer', 'murder', 'mvrder', 'k!ller', 'execut', 'arrested', 'indictment', 'federal charges', 'prison', 'court for', 'in court', 'trial', 'testified', 'vladtv', 'nojumper', 'drill rapper', 'foolio', 'lil durk', 'tay-k', 'chud the builder', 'wes watson', 'karmelo', 'jayy wick', 'allstar jr', 'set trippin', 'boosie', '6ix9ine', 'd4vd', 'romance scam', 'hitchhiker', 'mailman killer', 'mafia', 'cartel', 'gang ', 'snitch', 'sentenced',
    'hasan', 'mizkif', 'bonnie blue', 'caught in 4k', 'caught in 4', 'scumbags', 'this is sad', 'controversial clip', 'being black for a day', 'pbd be held', 'adin', 'nle choppa', 'double date', 'reacts to', 'tier ranking nba', 'drama',
    'official video', ' mix)', 'la para', 'tu eres mi nena', 'estrellas brillar', 'lyrics', 'music video', 'full album', 'beat ', 'type beat',
    'berserk', 'rimuru', 'slime', 'anime', 'sopranos', 'game of thrones', 'got season', 'breaking bad', 'one piece', 'naruto', 'trailer', 'movie clip', 'theaters',
    'rolex', 'dhgate', 'fake watch', 'signet ring', 'fire wardrobe', 'gentleman should wear', 'sneaker', 'outfit',
    'fall asleep', 'for sleep', 'comforting scientific', 'old music', '18th century noble', 'philosophy of rick',
    'epstein', 'jd vance', 'pizza\'', 'codewords',
    'discord server', 'reaction roles', 'discohook', 'carl-bot', 'mimu', 'discord bot', 'discord feature', 'discord onboarding', 'communityone', 'discord tutorial', 'editing pack', 'preset pack', 'overlay pack', 'free pack',
    '$140,000 weekend', 'brokest millionaire', 'richest town', 'richest trader', 'weekend in italy', 'tfue', 'webcam look expensive', 'gaming youtube', 'status match', 'amex platinum', 'caesars dia', 'free atlantis',
    'most powerful families', 'perception of time', 'disturbing cult', 'debt industry', 'expensive supplement', 'most disturbing book',
    'dog training', 'puppy', 'train your dog', 'recipe', 'cooking', 'mukbang', 'asmr',
  ]) },
  { key: 'business', label: '💼 Business / money', test: (t) => has(t, ['business', 'make money', 'making money', 'boring businesses', 'machines you can buy', '1-person business', 'one-person', 'aso', 'from email', 'course seller', 'side hustle', 'clients', 'middleman', 'sell', 'startup', 'raising $', 'cyber security', '/month', '/hour', 'print money', 'rich', 'laundromat', 'vending', 'credit union', 'franchise', 'dropship', 'shopify', 'ecommerce', 'e-commerce', 'agency', 'wholesale', 'profit', 'revenue', 'passive income', 'real estate', 'rental', 'airbnb', 'flip', 'niche', 'lead', 'sales', 'marketing', 'brand']) },
  { key: 'health', label: '💪 Health / fitness', test: (t) => has(t, ['jacked', 'lifting', 'running', 'treadmill', 'exercise', 'sets', 'transforming your body', 'health cheat', 'grassfed', 'beef', 'workout', 'training basics', 'seed oil', 'processed', 'flour', 'nutrition', 'diet', 'fasting', 'protein', 'gym', 'muscle', 'fat loss', 'testosterone', 'cardio', 'longevity', 'gut health']) },
  { key: 'reading', label: '📚 Reading / books', test: (t) => has(t, ['book', 'read', 'classics', 'novel', 'dostoevsky', 'camus', 'fiction', 'library', 'comprehension', 'crime and punishment', 'no longer human', 'the stranger', 'renaissance scholar', 'geniuses read', 'genius']) },
  { key: 'mindset', label: '🧠 Mindset / focus / systems', test: (t) => has(t, ['focus', 'distraction', 'reinvent', 'unrecognizable', 'productivity', 'journal', 'notebook', 'scrolling', 'discipline', 'power', 'greatness', 'slow life', 'god first', 'seek god', 'become yourself', 'price of', 'machiavelli', 'schopenhauer', 'jung', 'lucky', 'workaholic', 'average', 'notion', 'second brain', 'obsidian', 'habit', 'stoic', 'epictetus', 'aurelius', 'meditation', 'dopamine', 'self-improvement', 'morning routine', 'systems', 'mindset', 'discipline']) },
  { key: 'invest', label: '📈 Investing / trading  ⚠️ (you paused trading 6mo)', test: (t) => has(t, ['options', 'trading', 'trader', 'wheel strategy', 'covered call', 'tax lien', 'stock', 'regulators banned', 'forex', 'crypto', 'bitcoin', 'ethereum', 'etf', 'dividend', 'portfolio', 'day trad', 'scalp', 'imbalance', 'liquidity', 'order block', 'smart money', 'small account', 'supply & demand', 'supply and demand', 'candlestick', 'chart pattern']) },
];

export function classify(title) {
  const t = ` ${String(title).toLowerCase()} `;
  for (const b of BUCKETS) if (b.test(t)) return b.key;
  return 'review';
}

// the handful worth watching first (by video id) — surfaced to the top regardless of bucket
const MUST_WATCH = new Set(['9CjJn8A07e4', 'WX-HS9o5VMY', 'd8BGxfW3Vj4', 'mKyaNr3jK-E', 'LboBIgC10uY', '7W75s7I-Gds', 'GrclaHACPhU', 'yaqpVGekrro']);

// Split one CSV line, honoring "quoted, fields" that contain commas.
function csvLine(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur); return out;
}

// Parse one input file: JSON [{title,url}]; a "title,url" CSV (titles included); or a Google Takeout
// playlist CSV whose first column is the Video ID (no titles — resolved via oEmbed below).
function parseInput(f) {
  const text = fs.readFileSync(f, 'utf8');
  if (/\.csv$/i.test(f)) {
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (/url/i.test(lines[0] || '')) {
      const out = [];
      for (let i = 1; i < lines.length; i++) {
        const row = csvLine(lines[i]);
        const url = row.find((c) => /youtu\.?be/.test(c)) || row[row.length - 1];
        const id = videoId(url);
        if (/^[A-Za-z0-9_-]{6,}$/.test(id)) out.push({ id, title: (row[0] || '').trim(), url: cleanUrl(url) });
      }
      return out;
    }
    const start = /video id/i.test(lines[0] || '') ? 1 : 0;
    const out = [];
    for (let i = start; i < lines.length; i++) {
      const id = (lines[i].split(',')[0] || '').trim();
      if (/^[A-Za-z0-9_-]{6,}$/.test(id)) out.push({ id, title: '', url: `https://www.youtube.com/watch?v=${id}` });
    }
    return out;
  }
  return JSON.parse(text).map((v) => ({ id: videoId(v.url), title: v.title || '', url: cleanUrl(v.url) }));
}

// Public oEmbed endpoint — returns a video's title with no API key. null if the video is gone/private.
async function oembed(id) {
  try {
    const r = await fetch(`https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=${id}`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    return (await r.json()).title || null;
  } catch { return null; }
}

// Resolve titles for ID-only rows, cached to .yt-titles.json so re-runs don't re-fetch. Drops videos
// that are gone (oEmbed returns null) since they can't be classified by title.
async function resolveTitles(items) {
  let cache = {}; try { cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch { /* fresh */ }
  for (const it of items) if (it.title && cache[it.id] == null) cache[it.id] = it.title;
  const todo = items.filter((it) => !it.title && cache[it.id] === undefined);
  if (todo.length) console.error(`Resolving ${todo.length} titles via oEmbed (${items.length - todo.length} already known)…`);
  const CONC = 8;
  for (let i = 0; i < todo.length; i += CONC) {
    await Promise.all(todo.slice(i, i + CONC).map(async (it) => { cache[it.id] = await oembed(it.id); }));
    if ((i / CONC) % 10 === 0) { fs.writeFileSync(CACHE_FILE, JSON.stringify(cache)); process.stderr.write(`  ${Math.min(i + CONC, todo.length)}/${todo.length}\r`); }
  }
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
  const out = []; let gone = 0;
  for (const it of items) { const t = it.title || cache[it.id]; if (t) out.push({ ...it, title: t }); else gone++; }
  if (gone) console.error(`\n  (${gone} videos were deleted/private — skipped)`);
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
  if (by.review.length) {
    out.push(`## ❓ The long tail — uncategorized  (${by.review.length})`, '');
    out.push('> Titles the auto-sorter couldn\'t confidently place — mostly the years-deep middle of the backlog. Skim if curious, or ignore.', '');
    out.push('<details><summary>show the list</summary>', '');
    for (const it of by.review) out.push(link(it));
    out.push('', '</details>', '');
  }

  out.push('---', '');
  out.push(`## 🗑️ Skipped — entertainment  (${by.skip.length})`, '');
  out.push('> Fortnite, true-crime/drama, Discord setup, music, anime, sleep/ambiance, watches/style. Delete the playlist guilt-free — these aren\'t why you opened YouTube to learn.', '');
  out.push('<details><summary>show the skip list</summary>', '');
  for (const it of by.skip) out.push(`- ~~[${it.title.replace(/\|/g, '/')}](${it.url})~~`);
  out.push('', '</details>', '');
  return out.join('\n');
}

const RUN = process.argv[1] && process.argv[1].endsWith('youtube-triage.mjs');
if (RUN) {
const inputs = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_INPUTS;
const raw = [];
for (const f of inputs) { try { raw.push(...parseInput(f)); } catch (e) { console.error(`! skip ${f}: ${e.message}`); } }
const seen = new Set(), uniq = [];
for (const r of raw) { if (!r.id || seen.has(r.id)) continue; seen.add(r.id); uniq.push(r); }
const items = await resolveTitles(uniq);
if (!items.length) { console.error('No videos loaded. Pass JSON or Takeout CSV paths as arguments.'); process.exit(1); }
const note = buildNote(items);
// Reorg-proof: write into whichever "* Knowledge" folder the vault currently uses (now 05 - Knowledge).
const knowledgeDir = ['05 - Knowledge', '07 - Knowledge'].map((d) => path.join(VAULT_DIR, d)).find((d) => fs.existsSync(d)) || path.join(VAULT_DIR, '05 - Knowledge');
const outFile = path.join(knowledgeDir, '📺 To Absorb.md');
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, note);
const counts = {}; for (const it of items) { const k = classify(it.title); counts[k] = (counts[k] || 0) + 1; }
console.log(`✓ wrote ${outFile}`);
console.log(`  ${items.length} unique videos →`, JSON.stringify(counts));
}
