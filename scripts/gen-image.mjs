// gen-image — REAL image generation for the Fiverr Producer pod. Provider-aware.
//   default provider: fal.ai (FLUX) — set FAL_KEY in .env (recommended)
//   fallback provider: OpenAI gpt-image-1 — set OPENAI_API_KEY
//   force one with MEDIA_PROVIDER=fal|openai
//
//   node scripts/gen-image.mjs "a bold MrBeast-style youtube thumbnail, shocked face, $10,000 text" \
//        --out fiverr-assets/thumb.png --size 1536x1024 --quality high
//   flags: --out <path>  --size 1024x1024|1536x1024|1024x1536  --quality low|medium|high  --n 1
//
// DOCTRINE #1 (LLM proposes, CODE disposes): a deterministic monthly spend cap lives HERE, in code.
// Before every generation a function computes the cost and REFUSES if it would exceed the cap.
// Cap = MEDIA_BUDGET_USD in .env (default 10). Spend tracked in scripts/.media-usage.json (monthly).
// DOCTRINE #2: this only WRITES a local file; the operator QCs every image before any client sees it.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
function env(k, d = '') {
  if (process.env[k]) return process.env[k];
  try { const m = fs.readFileSync(path.join(ROOT, '.env'), 'utf8').match(new RegExp('^' + k + '=(.+)$', 'm')); if (m) return m[1].trim(); } catch { /* */ }
  return d;
}

const argv = process.argv.slice(2);
const prompt = argv.find((a) => !a.startsWith('--'));
const getFlag = (n, d) => { const i = argv.indexOf('--' + n); return i > -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const OUT = getFlag('out', path.join('fiverr-assets', `image-${Date.now()}.png`));
const SIZE = getFlag('size', '1024x1024');
const QUALITY = getFlag('quality', 'medium');
const N = Math.max(1, Math.min(4, Number(getFlag('n', 1))));

const FAL_KEY = env('FAL_KEY') || env('FAL_API_KEY');
const OPENAI_KEY = env('OPENAI_API_KEY');
const CF_ACCOUNT = env('CLOUDFLARE_ACCOUNT_ID');
const CF_TOKEN = env('CLOUDFLARE_API_TOKEN');
// Provider: explicit MEDIA_PROVIDER wins; else Cloudflare (free, no card) if configured; else a paid key; else free pollinations.
const PROVIDER = (env('MEDIA_PROVIDER') || (CF_ACCOUNT && CF_TOKEN ? 'cloudflare' : (FAL_KEY ? 'fal' : (OPENAI_KEY ? 'openai' : 'pollinations')))).toLowerCase();
const BUDGET = Number(env('MEDIA_BUDGET_USD', '10'));

if (!prompt) { console.error('Usage: node scripts/gen-image.mjs "<prompt>" [--out file.png] [--size 1024x1024] [--quality low|medium|high] [--n 1]'); process.exit(1); }

// --- deterministic cost model (USD per image, conservative) ---
const FAL_MODEL = env('FAL_MODEL', 'fal-ai/flux/dev');
function perImageCost() {
  if (PROVIDER === 'pollinations' || PROVIDER === 'cloudflare') return 0; // free (cloudflare = free daily quota)
  if (PROVIDER === 'fal') return /schnell/.test(FAL_MODEL) ? 0.004 : /pro/.test(FAL_MODEL) ? 0.05 : 0.03; // dev ~$0.03
  const C = { '1024x1024': { low: 0.011, medium: 0.042, high: 0.167 }, '1536x1024': { low: 0.016, medium: 0.063, high: 0.25 }, '1024x1536': { low: 0.016, medium: 0.063, high: 0.25 } };
  return (C[SIZE] && C[SIZE][QUALITY]) || 0.06;
}
const estimate = +(perImageCost() * N).toFixed(3);

// --- monthly spend ledger (the cap is enforced here, in code) ---
const LEDGER = path.join(ROOT, 'scripts', '.media-usage.json');
const month = new Date().toISOString().slice(0, 7);
function loadLedger() { try { const l = JSON.parse(fs.readFileSync(LEDGER, 'utf8')); return l.month === month ? l : { month, spent: 0, images: 0 }; } catch { return { month, spent: 0, images: 0 }; } }
const ledger = loadLedger();

if (ledger.spent + estimate > BUDGET) {
  console.error(`REFUSED by spend cap: this would cost ~$${estimate}, but $${ledger.spent.toFixed(2)} of the $${BUDGET}/mo cap is already used this month (${month}).`);
  console.error('Raise MEDIA_BUDGET_USD in .env or wait for next month. (Nothing was generated, nothing was charged.)');
  process.exit(2);
}

const label = PROVIDER === 'fal' ? FAL_MODEL : PROVIDER === 'pollinations' ? 'pollinations/flux (free)' : PROVIDER === 'cloudflare' ? 'cloudflare flux-1-schnell (free)' : 'gpt-image-1';
console.log(`${label} · ${SIZE} · n=${N} · est ~$${estimate}  (month-to-date $${ledger.spent.toFixed(2)}/$${BUDGET})`);

// --- provider generation → array of PNG/JPEG buffers ---
async function generate() {
  if (PROVIDER === 'cloudflare') return genCloudflare();
  if (PROVIDER === 'pollinations') return genPollinations();
  if (PROVIDER === 'fal') return genFal();
  return genOpenAI();
}

// FREE (no card): Cloudflare Workers AI flux-1-schnell. Needs CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN.
async function genCloudflare() {
  if (!CF_ACCOUNT || !CF_TOKEN) return { error: 'set CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN in .env' };
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/ai/run/@cf/black-forest-labs/flux-1-schnell`;
  const bufs = [];
  for (let i = 0; i < N; i++) {
    const r = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer ' + CF_TOKEN, 'content-type': 'application/json' },
      body: JSON.stringify({ prompt, steps: 8, seed: Math.floor(Math.random() * 1e9) }) });
    if (!r.ok) return { error: `cloudflare ${r.status}: ${(await r.text()).slice(0, 240)}` };
    const data = await r.json();
    const b64 = data.result?.image || data.result?.image_b64 || (Array.isArray(data.images) && data.images[0]);
    if (!b64) return { error: 'cloudflare returned no image: ' + JSON.stringify(data).slice(0, 200) };
    bufs.push(Buffer.from(b64, 'base64'));
  }
  return { bufs };
}

// FREE: pollinations.ai public FLUX endpoint — no key, no card. Good for proofs + early drafts.
async function genPollinations() {
  const [w, h] = SIZE.split('x').map(Number);
  const width = w || 1024, height = h || 1024;
  const bufs = [];
  for (let i = 0; i < N; i++) {
    const seed = Math.floor(Math.random() * 1e9);
    const u = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&nologo=true&model=flux&seed=${seed}`;
    const r = await fetch(u);
    if (!r.ok) return { error: `pollinations ${r.status}: ${(await r.text()).slice(0, 200)}` };
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 1000) return { error: 'pollinations returned an empty image (try again)' };
    bufs.push(buf);
  }
  return { bufs };
}

const FAL_SIZE = { '1024x1024': 'square_hd', '1536x1024': 'landscape_16_9', '1024x1536': 'portrait_16_9' };
async function genFal() {
  const image_size = FAL_SIZE[SIZE] || SIZE; // allow passing a fal preset directly
  const r = await fetch('https://fal.run/' + FAL_MODEL, {
    method: 'POST',
    headers: { Authorization: 'Key ' + FAL_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ prompt, image_size, num_images: N, enable_safety_checker: true }),
  });
  if (!r.ok) return { error: `fal ${r.status}: ${(await r.text()).slice(0, 300)}` };
  const data = await r.json();
  const urls = (data.images || []).map((i) => i.url).filter(Boolean);
  if (!urls.length) return { error: 'fal returned no image' };
  const bufs = [];
  for (const u of urls) { const ir = await fetch(u); if (ir.ok) bufs.push(Buffer.from(await ir.arrayBuffer())); }
  return { bufs };
}

async function genOpenAI() {
  const r = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + OPENAI_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-image-1', prompt, size: SIZE, quality: QUALITY, n: N }),
  });
  if (!r.ok) {
    const body = (await r.text()).slice(0, 300);
    let hint = ''; if (/billing_hard_limit|quota|insufficient/i.test(body)) hint = '\n→ Add credit at platform.openai.com billing, or switch to fal.ai (set FAL_KEY).';
    return { error: `OpenAI ${r.status}: ${body}${hint}` };
  }
  const data = await r.json();
  const bufs = (data.data || []).map((im) => Buffer.from(im.b64_json, 'base64'));
  return bufs.length ? { bufs } : { error: 'OpenAI returned no image' };
}

const res = await generate();
if (res.error) { console.error(res.error); process.exitCode = 1; }
else {
  fs.mkdirSync(path.resolve(ROOT, path.dirname(OUT)), { recursive: true });
  const saved = [];
  res.bufs.forEach((buf, i) => {
    const file = res.bufs.length === 1 ? OUT : OUT.replace(/(\.\w+)?$/, `-${i + 1}$1`);
    fs.writeFileSync(path.resolve(ROOT, file), buf);
    saved.push(file);
  });
  ledger.spent = +(ledger.spent + estimate).toFixed(3); ledger.images += saved.length;
  fs.writeFileSync(LEDGER, JSON.stringify(ledger));
  console.log(`✓ saved: ${saved.join(', ')}`);
  console.log(`  month-to-date: $${ledger.spent.toFixed(2)} of $${BUDGET} · ${ledger.images} images`);
  console.log('  → QC this before delivering to any client (doctrine: never ship unreviewed AI output).');
}
