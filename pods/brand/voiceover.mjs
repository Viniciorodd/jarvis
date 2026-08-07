// voiceover.mjs — turn the demo's narration into audio with the local Kokoro model.
//
// Local and offline on purpose: no API key, no per-render cost, and the model is Apache-2.0 so the
// output is safe on a paid listing. The lines live in scripts/<id>-voiceover.json next to the
// recorder script, so the words that get spoken sit beside the numbers that get asserted.
//
// Each line is synthesised SEPARATELY and its real duration measured. That is the whole point: the
// video is then re-timed to the audio rather than the narrator being asked to hit a mark. A line
// that runs long widens the hold underneath it instead of being clipped.
//
// Usage:
//   node pods/brand/voiceover.mjs --script pods/brand/scripts/appsumo-demo.json [--voice af_heart] [--speed 1.0]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

// The synthesiser runs in python because that is where kokoro-onnx lives. One process for the whole
// take: loading a 325MB model per line would dominate the runtime.
const PY = `
import sys, json, os
import numpy as np, soundfile as sf
from kokoro_onnx import Kokoro
cfg = json.loads(sys.stdin.read())
k = Kokoro(cfg['model'], cfg['voices'])
out = []
for i, line in enumerate(cfg['lines']):
    samples, sr = k.create(line['text'], voice=cfg['voice'], speed=cfg['speed'], lang='en-us')
    p = os.path.join(cfg['outDir'], 'vo-%02d-%s.wav' % (i, line['id']))
    sf.write(p, samples, sr)
    out.append({'id': line['id'], 'path': p, 'seconds': float(len(samples)) / sr})
print('__RESULT__' + json.dumps(out))
`;

export function synthesise({ lines, outDir, voice = 'af_heart', speed = 1.0 }) {
  fs.mkdirSync(outDir, { recursive: true });
  const cfg = {
    lines, outDir, voice, speed,
    model: path.join(ROOT, 'kokoro-v1.0.onnx'),
    voices: path.join(ROOT, 'voices-v1.0.bin')
  };
  for (const f of [cfg.model, cfg.voices]) if (!fs.existsSync(f)) throw new Error(`kokoro model file missing: ${f}`);
  const r = spawnSync('python', ['-c', PY], { input: JSON.stringify(cfg), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`kokoro failed: ${(r.stderr || '').split('\n').slice(-6).join(' ').slice(0, 400)}`);
  const marker = (r.stdout || '').lastIndexOf('__RESULT__');
  if (marker < 0) throw new Error(`kokoro produced no result: ${(r.stderr || r.stdout || '').slice(-300)}`);
  return JSON.parse(r.stdout.slice(marker + 10));
}

// ── PURE: lay the spoken lines out on a timeline ────────────────────────────────────────────────
// Each line is pinned to the beat it narrates. A line never starts before its beat, and the beat is
// widened if the line outruns it — so the words and the picture cannot drift apart.
export function layout({ takes, lines, leadIn = 0.6, gap = 0.35 }) {
  const timeline = [];
  let cursor = leadIn;
  for (const [i, take] of takes.entries()) {
    const want = lines[i]?.atSec;
    const start = want == null ? cursor : Math.max(cursor, want);
    timeline.push({ id: take.id, path: take.path, start, end: start + take.seconds, seconds: take.seconds, wanted: want ?? null });
    cursor = start + take.seconds + gap;
  }
  return { timeline, totalSec: timeline.length ? timeline[timeline.length - 1].end : 0 };
}

// Mix the narration onto a finished video. The existing SFX track is kept and pushed down under the
// voice — a sound effect that competes with the words is worse than no sound effect.
export function mixVoice({ videoPath, timeline, outPath, voiceGain = 1.6, duckTo = 0.28 }) {
  const args = ['-y', '-i', videoPath];
  for (const t of timeline) args.push('-i', t.path);
  const chains = timeline.map((t, i) => `[${i + 1}:a]adelay=${Math.round(t.start * 1000)}:all=1,volume=${voiceGain}[v${i}]`);
  const voiceMix = `${timeline.map((_, i) => `[v${i}]`).join('')}amix=inputs=${timeline.length}:normalize=0:dropout_transition=0[vo]`;
  // 0:a is the SFX bed already muxed by record.mjs; duck it and sit the voice on top.
  const filter = `${chains.join(';')};${voiceMix};[0:a]volume=${duckTo}[bed];[bed][vo]amix=inputs=2:normalize=0:dropout_transition=0,alimiter=limit=0.95[out]`;
  args.push('-filter_complex', filter, '-map', '0:v', '-map', '[out]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', outPath);
  try { execFileSync('ffmpeg', args, { stdio: 'pipe', shell: process.platform === 'win32' }); return { ok: true }; }
  catch (e) { return { ok: false, error: String(e.stderr || e.message).split('\n').slice(-4).join(' ').slice(0, 300) }; }
}

// ── CLI ─────────────────────────────────────────────────────────────────────────────────────────
const direct = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (direct) {
  const argv = process.argv.slice(2);
  const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
  const scriptPath = arg('--script');
  if (!scriptPath) { console.error('usage: node pods/brand/voiceover.mjs --script <script.json> [--voice af_heart] [--speed 1.0]'); process.exit(2); }

  const resolved = path.resolve(process.cwd(), scriptPath);
  const script = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  const voPath = path.join(path.dirname(resolved), `${script.id}-voiceover.json`);
  const vo = JSON.parse(fs.readFileSync(voPath, 'utf8'));
  const outDir = path.resolve(ROOT, script.outDir, 'vo');

  const takes = synthesise({ lines: vo.lines, outDir, voice: arg('--voice', vo.voice || 'af_heart'), speed: +arg('--speed', vo.speed || 1.0) });
  const { timeline, totalSec } = layout({ takes, lines: vo.lines, leadIn: vo.leadIn ?? 0.6, gap: vo.gap ?? 0.35 });

  console.log(`\nvoice: ${arg('--voice', vo.voice || 'af_heart')}   lines: ${takes.length}   narration ends at ${totalSec.toFixed(1)}s\n`);
  for (const t of timeline) {
    const drift = t.wanted == null ? '' : (t.start - t.wanted > 0.05 ? `  ⟵ pushed ${(t.start - t.wanted).toFixed(1)}s late` : '');
    console.log(`  ${t.start.toFixed(1).padStart(5)}s → ${t.end.toFixed(1).padStart(5)}s  ${t.id}${drift}`);
  }
  fs.writeFileSync(path.join(outDir, 'timeline.json'), JSON.stringify({ timeline, totalSec }, null, 2));
  console.log(`\ntimeline → ${path.join(outDir, 'timeline.json')}`);
}
