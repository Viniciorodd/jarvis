// make-cover — HYBRID book / eBook cover engine for the Fiverr Studio (Remy / STUDIO-01).
// Same idea as the thumbnail: FLUX paints the cover ART (atmospheric scene/object, NO text), and CODE
// composites the title / subtitle / author with genre-aware typography. Portrait, KDP-ready (1600×2400).
//
// PIPELINE: brief → Claude designs a cover SPEC → genImage paints the art ($0 Cloudflare) →
//           compose() builds a self-contained 1600×2400 SVG (art + scrim + title block + author).
// OUTPUT:   writes <out> (.svg) and returns { ok, file, svg, spec, artOk }.

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, esc, safeJson, dataUri, defaultClaude, genImage, fitFont, SVG_DEFS } from './studio-lib.mjs';

const W = 1600, H = 2400; // KDP 6×9 proportion
const ART_QUALITY = 'book cover art, atmospheric, cinematic lighting, rich detail, professional illustration/photography, evocative mood, NO text, NO typography, NO letters, NO words';

const SPEC_SYS = `You are an award-winning book-cover designer. Given a book brief, design ONE cover.
Respond with ONLY a JSON object — no prose, no fences:
{
  "background": "a vivid image prompt for the cover ART only — an atmospheric scene, character, object, or texture that fits the genre. NO text/letters/typography in the image.",
  "title": ["1 or 2 short lines of the TITLE"],
  "subtitle": "a short subtitle/hook or empty string",
  "author": "the author name",
  "genre": "thriller | romance | fantasy | scifi | mystery | horror | nonfiction | business | selfhelp | literary | memoir | childrens",
  "font": "serif" | "sans",
  "titlePos": "top" | "center" | "bottom",
  "accent": "#hex accent color that pops against the art"
}
Principles: the title must dominate and stay legible as a tiny thumbnail; serif suits literary/nonfiction/romance, bold sans suits thriller/scifi/business; pick a title position over the calmest part of the art.`;

function fallbackSpec(brief) {
  const t = String(brief || 'Untitled').replace(/^(a |an |the )/i, '').split(/\s+/).slice(0, 4).join(' ');
  return { background: `atmospheric evocative cover art for: ${String(brief).slice(0, 140)}`, title: [t.toUpperCase()], subtitle: '', author: 'A. Author', genre: 'literary', font: 'serif', titlePos: 'center', accent: '#d8b15a' };
}

function normalizeSpec(j, brief) {
  const s = j && typeof j === 'object' ? j : fallbackSpec(brief);
  s.background = String(s.background || fallbackSpec(brief).background).slice(0, 400);
  s.title = (Array.isArray(s.title) ? s.title : [String(s.title || '')]).map((l) => String(l || '').trim()).filter(Boolean).slice(0, 2);
  if (!s.title.length) s.title = fallbackSpec(brief).title;
  s.subtitle = String(s.subtitle || '').slice(0, 80);
  s.author = String(s.author || '').slice(0, 60);
  s.genre = String(s.genre || 'literary').toLowerCase();
  s.font = s.font === 'sans' ? 'sans' : s.font === 'serif' ? 'serif' : (/thriller|scifi|sci-fi|horror|business|action/.test(s.genre) ? 'sans' : 'serif');
  s.titlePos = ['top', 'center', 'bottom'].includes(s.titlePos) ? s.titlePos : 'center';
  s.accent = /^#[0-9a-fA-F]{3,8}$/.test(String(s.accent || '')) ? s.accent : '#d8b15a';
  return s;
}

export async function designSpec(brief, claudeFn = defaultClaude) {
  const r = await claudeFn(SPEC_SYS, String(brief || ''));
  return normalizeSpec(safeJson(r && r.text), brief);
}

export function compose({ rasterDataUri, spec }) {
  const serif = "'Georgia','Times New Roman',serif";
  const sans = "'Arial Black','Archivo Black',Impact,sans-serif";
  const titleFont = spec.font === 'sans' ? sans : serif;
  const upper = spec.font === 'sans';
  const title = spec.title.map((l) => (upper ? l.toUpperCase() : l));
  const pad = 150, colW = W - 2 * pad;

  // vertical anchor for the title block
  const anchorY = spec.titlePos === 'top' ? 360 : spec.titlePos === 'bottom' ? H - 560 : H / 2 - 160;
  const tFs = fitFont(title, colW, spec.font === 'sans' ? 230 : 210, spec.font === 'sans' ? 0.6 : 0.55);
  const tLineH = Math.round(tFs * 1.05);

  const titleEls = title.map((ln, i) =>
    `<text x="${W / 2}" y="${anchorY + i * tLineH}" text-anchor="middle" font-family="${titleFont}" font-weight="${spec.font === 'sans' ? 900 : 700}" font-size="${tFs}" fill="#ffffff" stroke="#0a0a0a" stroke-width="${Math.max(4, Math.round(tFs * 0.04))}" paint-order="stroke" stroke-linejoin="round" letter-spacing="${spec.font === 'sans' ? '-2' : '1'}">${esc(ln)}</text>`
  ).join('\n    ');

  const ruleY = anchorY + (title.length - 1) * tLineH + Math.round(tFs * 0.55);
  const rule = `<rect x="${W / 2 - 170}" y="${ruleY}" width="340" height="5" rx="2" fill="${spec.accent}"/>`;
  const subY = ruleY + 70;
  const sub = spec.subtitle ? `<text x="${W / 2}" y="${subY}" text-anchor="middle" font-family="${serif}" font-style="italic" font-size="58" fill="#f0f0f0" stroke="#0a0a0a" stroke-width="2" paint-order="stroke">${esc(spec.subtitle)}</text>` : '';
  const author = spec.author ? `<text x="${W / 2}" y="${H - 150}" text-anchor="middle" font-family="${spec.font === 'sans' ? sans : serif}" font-size="64" fill="#ffffff" stroke="#0a0a0a" stroke-width="2.5" paint-order="stroke" letter-spacing="6">${esc(spec.author.toUpperCase())}</text>` : '';

  // scrim positioned to back the title block + a bottom scrim for the author
  const titleScrim = spec.titlePos === 'top' ? `<rect width="${W}" height="${H}" fill="url(#scrimT)"/>`
    : spec.titlePos === 'bottom' ? `<rect width="${W}" height="${H}" fill="url(#scrimB)"/>`
    : `<rect x="0" y="${H / 2 - 420}" width="${W}" height="840" fill="url(#scrimC)"/>`;

  const image = rasterDataUri
    ? `<image href="${rasterDataUri}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/>`
    : `<rect width="${W}" height="${H}" fill="#11151c"/>`;

  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>${SVG_DEFS}
    <linearGradient id="scrimT" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".8"/><stop offset=".4" stop-color="#000" stop-opacity=".2"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>
    <linearGradient id="scrimC" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset=".5" stop-color="#000" stop-opacity=".62"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>
  </defs>
  ${image}
  <rect width="${W}" height="${H}" fill="url(#vig)"/>
  ${titleScrim}
  <rect width="${W}" height="${H}" fill="url(#scrimB)" opacity=".5"/>
  <g filter="url(#ds)">
    ${titleEls}
    ${rule}
    ${sub}
    ${author}
  </g>
</svg>`;
}

export async function makeCover({ brief, out, claudeFn = defaultClaude, spec: presetSpec } = {}) {
  const spec = presetSpec ? normalizeSpec(presetSpec, brief) : await designSpec(brief, claudeFn);
  const artRel = path.join('fiverr-assets', `cover-art-${Date.now()}.jpg`);
  const g = await genImage(spec.background + ', ' + ART_QUALITY, artRel, '1024x1536');
  let rasterDataUri = '';
  try { if (g.ok) rasterDataUri = dataUri(path.resolve(ROOT, artRel)); } catch { /* */ }
  const svg = compose({ rasterDataUri, spec });
  if (out) { fs.mkdirSync(path.resolve(ROOT, path.dirname(out)), { recursive: true }); fs.writeFileSync(path.resolve(ROOT, out), svg); }
  try { if (g.ok) fs.unlinkSync(path.resolve(ROOT, artRel)); } catch { /* */ }
  return { ok: true, file: out || null, svg, spec, artOk: g.ok, artError: g.error || null };
}

if (process.argv[1] && process.argv[1].endsWith('make-cover.mjs')) {
  const args = process.argv.slice(2);
  const getFlag = (n, d) => { const i = args.indexOf('--' + n); return i > -1 && args[i + 1] ? args[i + 1] : d; };
  const brief = args.filter((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--out').join(' ') || 'a thriller novel called The Last Signal about a lighthouse keeper who hears the dead';
  const out = getFlag('out', `fiverr-assets/cover-${Date.now()}.svg`);
  makeCover({ brief, out })
    .then((r) => console.log(JSON.stringify({ ok: r.ok, file: r.file, artOk: r.artOk, artError: r.artError, spec: r.spec }, null, 2)))
    .catch((e) => { console.error(e); process.exitCode = 1; });
}
