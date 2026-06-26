// absorb.mjs — turn a YouTube video into a skimmable Obsidian note: a key-points summary at the TOP
// (so you can decide in 20 seconds whether it's worth your time), then the full polished transcript at
// the bottom, plus tags + links to related absorbed notes. This is the real "To Absorb": read instead
// of watch. Transcript via yt-dlp (auto-captions, no API key); summary via Claude Haiku (cheap).
//
//   node scripts/absorb.mjs <videoId|url> [more…]        # absorb specific videos
// Writes <VAULT_DIR>/05 - Knowledge/Absorbed/<title>.md and prints token usage so cost is visible.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(SCRIPT_DIR, '.yt-titles.json');
const DONE_FILE = path.join(SCRIPT_DIR, '.absorb-done.json'); // ids already absorbed (so playlist re-runs skip them)
const VAULT_DIR = process.env.VAULT_DIR || path.join(os.homedir(), 'Documents', 'Second Brain');
const OUT_DIR = path.join(VAULT_DIR, '05 - Knowledge', 'Absorbed');
const MODEL = process.env.ABSORB_MODEL || 'claude-haiku-4-5';

function env(k) {
  if (process.env[k]) return process.env[k];
  try { const m = fs.readFileSync(path.join(SCRIPT_DIR, '..', '.env'), 'utf8').match(new RegExp('^' + k + '=(.+)$', 'm')); return m ? m[1].trim() : ''; } catch { return ''; }
}
const API_KEY = env('ANTHROPIC_API_KEY');

const vid = (s) => (String(s).match(/[?&]v=([A-Za-z0-9_-]{6,})/) || String(s).match(/youtu\.be\/([A-Za-z0-9_-]{6,})/) || [null, String(s).trim()])[1];

// ── transcript via yt-dlp (auto-subs → clean text) ────────────────────────────────────────────────
function fetchTranscript(id) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'absorb-'));
  const r = spawnSync('python', ['-m', 'yt_dlp', '--skip-download', '--write-auto-sub', '--write-sub', '--sub-lang', 'en.*', '--sub-format', 'vtt', '-o', path.join(tmp, '%(id)s.%(ext)s'), '--', `https://www.youtube.com/watch?v=${id}`], { encoding: 'utf8', timeout: 90000 });
  const meta = parseMeta(r.stderr || '');
  const vtt = fs.readdirSync(tmp).find((f) => f.endsWith('.vtt'));
  let text = '';
  if (vtt) text = vttToText(fs.readFileSync(path.join(tmp, vtt), 'utf8'));
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* */ }
  return { text, ...meta };
}
function parseMeta() { return {}; } // title/channel come from oEmbed below (more reliable than parsing yt-dlp logs)

// List a playlist's video ids via yt-dlp (no API key; works for public/unlisted playlists).
function playlistIds(url) {
  const r = spawnSync('python', ['-m', 'yt_dlp', '--flat-playlist', '--no-warnings', '--print', '%(id)s', '--', url], { encoding: 'utf8', timeout: 120000 });
  return (r.stdout || '').split(/\r?\n/).map((s) => s.trim()).filter((id) => /^[A-Za-z0-9_-]{6,}$/.test(id));
}

// PURE: VTT → readable text. Strips timing + inline tags, drops the rolling-duplicate lines auto-subs emit.
export function vttToText(vtt) {
  const out = [];
  for (let line of String(vtt).split(/\r?\n/)) {
    if (/-->/.test(line) || /^WEBVTT|^Kind:|^Language:|^\d+\s*$/.test(line) || !line.trim()) continue;
    line = line.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (!line) continue;
    if (out.length && (out[out.length - 1] === line || out[out.length - 1].endsWith(line))) continue;
    out.push(line);
  }
  // light paragraphing: group ~3 sentences
  const words = out.join(' ').replace(/\s+/g, ' ').trim();
  return words;
}
export function paragraphs(text) {
  const sents = String(text).split(/(?<=[.!?])\s+/);
  const out = []; for (let i = 0; i < sents.length; i += 4) out.push(sents.slice(i, i + 4).join(' '));
  return out.join('\n\n');
}

async function oembed(id) {
  try { const d = await (await fetch(`https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=${id}`)).json(); return { title: d.title || id, channel: d.author_name || '' }; }
  catch { return { title: id, channel: '' }; }
}

// ── summary via Claude (key points + why-it-matters + tags) ───────────────────────────────────────
const OPERATOR = 'The reader runs a one-person enterprise: #1 priority is GOVERNMENT CONTRACTING (janitorial/custodial/grounds, small-business set-asides); also Fiverr creative, web studio, real estate (Section 8), and is building AI systems. Goals: $10k/mo, leverage via AI, health/fitness, reading. Trading is paused. Tie "why it matters" to these where relevant.';
async function summarize(title, channel, transcript) {
  if (!API_KEY) throw new Error('No ANTHROPIC_API_KEY in .env');
  const clip = transcript.split(/\s+/).slice(0, 9000).join(' '); // cap input tokens on very long videos
  const sys = `You distill a YouTube video into a skimmable brief for a busy operator. ${OPERATOR}\nReturn STRICT JSON only: {"oneLine": "<one sentence: what this video is>", "keyPoints": ["5-8 crisp, specific takeaways — the actual insights, not fluff"], "whyItMatters": "<1-2 sentences tying it to the operator's goals, or 'general interest' if not>", "worthIt": "<yes|skim|skip>", "tags": ["3-6 lowercase topic tags, no # "]}`;
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 1100, system: sys, messages: [{ role: 'user', content: `Title: ${title}\nChannel: ${channel}\n\nTranscript:\n${clip}` }] }),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  const text = (d.content || []).map((c) => c.text).join('');
  let parsed; try { parsed = JSON.parse(text.match(/\{[\s\S]*\}/)[0]); } catch { parsed = { oneLine: '', keyPoints: [text], whyItMatters: '', worthIt: 'skim', tags: [] }; }
  return { ...parsed, usage: d.usage || {} };
}

// ── note writer ───────────────────────────────────────────────────────────────────────────────────
const slug = (s) => String(s).replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 90) || 'video';
function relatedNotes(tags) {
  let files = []; try { files = fs.readdirSync(OUT_DIR).filter((f) => f.endsWith('.md')); } catch { return []; }
  const out = [];
  for (const f of files) {
    try { const c = fs.readFileSync(path.join(OUT_DIR, f), 'utf8'); const ft = (c.match(/^tags: \[(.*)\]/m) || [])[1] || ''; if (tags.some((t) => ft.includes(t))) out.push(f.replace(/\.md$/, '')); } catch { /* */ }
  }
  return out.slice(0, 6);
}
function writeNote(id, meta, sum, transcript) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const url = `https://www.youtube.com/watch?v=${id}`;
  const tags = ['youtube', ...(sum.tags || [])].map((t) => String(t).replace(/[^a-z0-9/-]/gi, '-').toLowerCase());
  const related = relatedNotes(sum.tags || []);
  const md = [
    '---',
    `title: ${JSON.stringify(meta.title)}`,
    `channel: ${JSON.stringify(meta.channel)}`,
    `url: ${url}`,
    `worth_it: ${sum.worthIt || 'skim'}`,
    `tags: [${tags.join(', ')}]`,
    `absorbed: ${new Date().toISOString().slice(0, 10)}`,
    '---', '',
    `# ${meta.title}`, '',
    `> 🎬 ${meta.channel || 'YouTube'} · [watch ↗](${url}) · **worth it: ${sum.worthIt || 'skim'}**`, '',
    sum.oneLine ? `*${sum.oneLine}*\n` : '',
    '## ⚡ Key points', '',
    ...((sum.keyPoints && sum.keyPoints.length) ? sum.keyPoints.map((p) => `- ${p}`)
      : [`- ⏳ _AI summary pending — add Anthropic API credits, then re-run:_ \`node scripts/absorb.mjs ${id}\``]), '',
    sum.whyItMatters ? `## 🎯 Why it matters to you\n\n${sum.whyItMatters}\n` : '',
    '## 🔗 Related', '',
    ...(related.length ? related.map((r) => `- [[${r}]]`) : ['- _none yet — links grow as you absorb more_']), '',
    '## 🏷️ Topics', '',
    (sum.tags || []).map((t) => `#${String(t).replace(/\s+/g, '-')}`).join(' '), '',
    '---', '',
    '## 📝 Full transcript', '',
    paragraphs(transcript), '',
  ].join('\n');
  const file = path.join(OUT_DIR, slug(meta.title) + '.md');
  fs.writeFileSync(file, md);
  return file;
}

// ── main ──────────────────────────────────────────────────────────────────────────────────────────
const RUN = process.argv[1] && process.argv[1].endsWith('absorb.mjs');
if (RUN) {
  const args = process.argv.slice(2);
  const argVal = (flag, def) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : def; };
  const BUDGET = Number(argVal('--budget', 5));        // hard $ stop — never overspend the operator's credit
  const MAX = Number(argVal('--max', 0)) || Infinity;
  let done = {}; try { done = JSON.parse(fs.readFileSync(DONE_FILE, 'utf8')); } catch { /* fresh */ }
  let ids;
  if (args.includes('--playlist')) {
    // The going-forward path: absorb NEW videos from your unlisted "📚 To Absorb" playlist.
    let url = argVal('--playlist'); if (!url || url.startsWith('--')) url = env('ABSORB_PLAYLIST');
    if (!url) { console.error('--playlist needs a URL (or set ABSORB_PLAYLIST in .env)'); process.exit(1); }
    const all = playlistIds(url);
    ids = all.filter((id) => !done[id]).slice(0, MAX);
    console.error(`--playlist: ${all.length} in playlist · ${ids.length} new to absorb (≈ $${(ids.length * 0.008).toFixed(2)})\n`);
  } else if (args.includes('--keep')) {
    const { classify } = await import('./youtube-triage.mjs');
    let cache = {}; try { cache = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch { /* run youtube-triage first */ }
    const KEEP = new Set(['gov', 'ai', 'business', 'health', 'reading', 'mindset', 'invest']);
    let noteFiles = new Set(); try { noteFiles = new Set(fs.readdirSync(OUT_DIR)); } catch { /* none yet */ }
    ids = Object.keys(cache).filter((id) => cache[id] && KEEP.has(classify(cache[id])) && !done[id] && !noteFiles.has(slug(cache[id]) + '.md')).slice(0, MAX);
    console.error(`--keep: ${ids.length} valuable videos to absorb (≈ $${(ids.length * 0.008).toFixed(2)}; budget cap $${BUDGET})\n`);
  } else {
    ids = args.filter((a) => !a.startsWith('--')).map(vid);
  }
  ids = (ids || []).filter((id) => /^[A-Za-z0-9_-]{6,}$/.test(id));
  if (!ids.length) { console.error('Nothing new to absorb.  usage: absorb <id|url …> | --playlist <url> | --keep'); process.exit(0); }
  let totIn = 0, totOut = 0, n = 0;
  for (const id of ids) {
    const cost = (totIn / 1e6) * 1 + (totOut / 1e6) * 5;
    if (cost >= BUDGET) { console.error(`\n⛔ budget $${BUDGET} reached — stopping at ${n}/${ids.length}.`); break; }
    process.stderr.write(`• ${id} … `);
    const meta = await oembed(id);
    const { text } = fetchTranscript(id);
    if (!text || text.split(/\s+/).length < 30) { console.error(`no transcript — skipped: ${meta.title}`); done[id] = 'no-transcript'; fs.writeFileSync(DONE_FILE, JSON.stringify(done)); continue; }
    let sum;
    try { sum = await summarize(meta.title, meta.channel, text); }
    catch (e) { console.error(`(summary skipped — ${e.message.slice(0, 70)})`); sum = { keyPoints: [], whyItMatters: '', worthIt: 'skim', tags: [], oneLine: '', usage: {}, pending: true }; }
    const file = writeNote(id, meta, sum, text);
    if (!sum.pending) { done[id] = true; fs.writeFileSync(DONE_FILE, JSON.stringify(done)); } // only "done" once it has a real summary
    totIn += sum.usage.input_tokens || 0; totOut += sum.usage.output_tokens || 0; n++;
    console.error(`✓ ${path.basename(file)}  (${text.split(/\s+/).length}w → ${(sum.keyPoints || []).length} pts)`);
  }
  const cost = (totIn / 1e6) * 1 + (totOut / 1e6) * 5; // rough Haiku $/Mtok
  console.error(`\nDone: ${n} absorbed · ${totIn} in / ${totOut} out  ≈ $${cost.toFixed(4)} → 05 - Knowledge/Absorbed/`);
}
