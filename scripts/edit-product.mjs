// edit-product — product-photo cleanup for the Fiverr Studio (Remy / STUDIO-01).
// Takes a messy real-world product photo and returns a crisp, marketplace-ready image:
//   1) background removal via fal.ai (BiRefNet) — uses the FAL_KEY already scoped to STUDIO-01 (doctrine #3)
//   2) CODE composites the transparent cutout onto a clean studio backdrop + a soft contact shadow.
// "white" style = pure #fff (Amazon/eBay compliant); "studio" style = subtle gradient + shadow (Shopify/ads).
//
// Unlike the from-scratch engines this needs an INPUT image. Output: a self-contained SVG (cutout embedded)
// + the raw cutout, so the UI can show a before/after and export a PNG. DOCTRINE #2: operator QCs before delivery.

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, env, dataUri, bufToDataUri, falRun } from './studio-lib.mjs';

const S = 1600; // square — the marketplace standard
const REMBG_MODEL = env('FAL_REMBG_MODEL', 'fal-ai/birefnet');

// Remove the background → returns a transparent-PNG data URI (or { error }).
export async function removeBackground(imageDataUri) {
  const r = await falRun(REMBG_MODEL, { image_url: imageDataUri });
  if (r.error) return { error: r.error };
  const url = r.data?.image?.url || (Array.isArray(r.data?.images) && r.data.images[0]?.url) || r.data?.image_url;
  if (!url) return { error: 'background remover returned no image' };
  if (String(url).startsWith('data:')) return { cutout: url };
  try { const ir = await fetch(url); if (!ir.ok) return { error: 'could not fetch cutout (' + ir.status + ')' }; return { cutout: bufToDataUri(await ir.arrayBuffer(), 'image/png') }; }
  catch (e) { return { error: e.message }; }
}

export function compose({ cutoutDataUri, style = 'studio' }) {
  const inset = Math.round(S * 0.12);
  const region = S - 2 * inset;
  const shadowCy = inset + region * 0.93;
  const bg = style === 'white'
    ? `<rect width="${S}" height="${S}" fill="#ffffff"/>`
    : `<rect width="${S}" height="${S}" fill="url(#studioBg)"/>`;
  const shadowOpacity = style === 'white' ? 0.14 : 0.24;
  return `<svg viewBox="0 0 ${S} ${S}" width="${S}" height="${S}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="studioBg" cx="50%" cy="40%" r="75%"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e7ebf0"/></radialGradient>
    <filter id="soft" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="26"/></filter>
  </defs>
  ${bg}
  <ellipse cx="${S / 2}" cy="${shadowCy}" rx="${Math.round(region * 0.34)}" ry="${Math.round(region * 0.055)}" fill="#000" opacity="${shadowOpacity}" filter="url(#soft)"/>
  <image href="${cutoutDataUri}" x="${inset}" y="${inset}" width="${region}" height="${region}" preserveAspectRatio="xMidYMid meet"/>
</svg>`;
}

export async function editProduct({ input, inputDataUri, out, style = 'studio' } = {}) {
  let beforeUri = inputDataUri;
  if (!beforeUri) {
    if (!input) return { ok: false, error: 'provide an input image (path or data URI)' };
    try { beforeUri = dataUri(path.resolve(ROOT, input)); } catch (e) { return { ok: false, error: 'could not read input: ' + e.message }; }
  }
  const rb = await removeBackground(beforeUri);
  if (rb.error) return { ok: false, error: rb.error, before: beforeUri };
  const svg = compose({ cutoutDataUri: rb.cutout, style });
  if (out) { fs.mkdirSync(path.resolve(ROOT, path.dirname(out)), { recursive: true }); fs.writeFileSync(path.resolve(ROOT, out), svg); }
  return { ok: true, file: out || null, svg, before: beforeUri, cutout: rb.cutout, style };
}

if (process.argv[1] && process.argv[1].endsWith('edit-product.mjs')) {
  const args = process.argv.slice(2);
  const getFlag = (n, d) => { const i = args.indexOf('--' + n); return i > -1 && args[i + 1] ? args[i + 1] : d; };
  const input = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--out' && args[args.indexOf(a) - 1] !== '--style');
  if (!input) { console.error('usage: node scripts/edit-product.mjs <product-image> [--style studio|white] [--out file.svg]'); process.exit(1); }
  const out = getFlag('out', `fiverr-assets/product-${Date.now()}.svg`);
  editProduct({ input, out, style: getFlag('style', 'studio') })
    .then((r) => console.log(JSON.stringify({ ok: r.ok, file: r.file, error: r.error || null, style: r.style }, null, 2)))
    .catch((e) => { console.error(e); process.exitCode = 1; });
}
