// Batch-transcribe a folder of audio (e.g. PersonalVault\Just Press Record) via a Whisper
// ASR service, writing a .txt next to each in an output folder. Skips already-done.
// Reads ORIGINALS read-only; never modifies your source audio.
//
//   WHISPER_URL   default http://192.168.6.121:9100   (the onerahmet whisper-asr container)
//   node scripts/transcribe-audio.mjs "<src folder>" "<out folder>"
//
// Bring Whisper up on the NAS first (port 9100 to avoid Portainer's 9000):
//   on the NAS:  cd /volume1/docker/jarvis
//     sed -i 's/"9000:9000"/"9100:9000"/' docker-compose.yml
//     docker compose up -d whisper
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const WHISPER = (process.env.WHISPER_URL || 'http://192.168.6.121:9100').replace(/\/$/, '');
const SRC = process.argv[2] || '\\\\192.168.6.121\\PersonalVault\\Just Press Record';
const OUT = process.argv[3] || path.join(os.homedir(), 'Desktop', 'JARVIS-Workspace', 'transcripts');
const AUDIO = new Set(['.m4a', '.mp3', '.wav', '.aac', '.mp4', '.ogg', '.flac', '.webm']);

fs.mkdirSync(OUT, { recursive: true });

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === '#recycle') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (AUDIO.has(path.extname(e.name).toLowerCase())) out.push(full);
  }
  return out;
}

const files = walk(SRC);
console.log(`Found ${files.length} audio files under ${SRC}`);
console.log(`Whisper: ${WHISPER}  →  transcripts to: ${OUT}\n`);

let done = 0, skipped = 0, failed = 0;
for (const f of files) {
  const base = path.basename(f, path.extname(f));
  const outFile = path.join(OUT, base + '.txt');
  if (fs.existsSync(outFile)) { skipped++; continue; }
  process.stdout.write(`… ${base}  `);
  try {
    const buf = fs.readFileSync(f);
    const fd = new FormData();
    fd.append('audio_file', new Blob([buf]), path.basename(f));
    const r = await fetch(`${WHISPER}/asr?output=txt&task=transcribe`, { method: 'POST', body: fd });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const text = (await r.text()).trim();
    fs.writeFileSync(outFile, `# ${base}\n# source: ${f}\n# transcribed: ${new Date().toISOString()}\n\n${text}\n`, 'utf8');
    console.log(`done (${text.length} chars)`);
    done++;
  } catch (e) {
    console.log('FAILED: ' + e.message);
    failed++;
  }
}
console.log(`\nTranscribed ${done}, skipped ${skipped} (already done), failed ${failed}.`);
if (failed && done === 0) console.log('All failed — is the Whisper container up on the NAS at ' + WHISPER + ' ? (see header)');
