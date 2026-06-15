// get-vosk-model — one-time download of the offline wake-word model (run once).
//   node scripts/get-vosk-model.mjs
// Pulls the small English Vosk model (~41 MB) into companion/public/models/ so the companion can do
// 100%-offline "Jarvis" wake detection — audio never leaves your machine, no account, no API key.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const URL = 'https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-en-us-0.15.tar.gz';
const DIR = path.join(ROOT, 'companion', 'public', 'models');
const OUT = path.join(DIR, 'vosk-model-small-en-us-0.15.tar.gz');

fs.mkdirSync(DIR, { recursive: true });
if (fs.existsSync(OUT) && fs.statSync(OUT).size > 1e7) {
  console.log('Model already present:', path.relative(ROOT, OUT), `(${(fs.statSync(OUT).size / 1e6).toFixed(0)} MB)`);
  process.exit(0);
}

console.log('Downloading offline wake model (~41 MB, one time)…');
const r = await fetch(URL);
if (!r.ok || !r.body) { console.error('Download failed: HTTP ' + r.status); process.exitCode = 1; }
else {
  const total = Number(r.headers.get('content-length')) || 0;
  let got = 0, lastPct = -1;
  const file = fs.createWriteStream(OUT);
  const nodeStream = Readable.fromWeb(r.body);
  nodeStream.on('data', (c) => {
    got += c.length;
    const pct = total ? Math.floor((got / total) * 100) : 0;
    if (pct !== lastPct && pct % 5 === 0) { process.stdout.write(`\r  ${pct}%  (${(got / 1e6).toFixed(0)}/${(total / 1e6).toFixed(0)} MB)   `); lastPct = pct; }
  });
  await new Promise((res, rej) => { nodeStream.pipe(file); file.on('finish', res); file.on('error', rej); nodeStream.on('error', rej); });
  console.log(`\n✓ saved: ${path.relative(ROOT, OUT)}  (${(fs.statSync(OUT).size / 1e6).toFixed(0)} MB)`);
  console.log('  Restart the companion, turn on hands-free, and say "Jarvis, …" — fully offline.');
}
