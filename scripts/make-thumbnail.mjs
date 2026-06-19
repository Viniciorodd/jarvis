// make-thumbnail — the HYBRID YouTube-thumbnail engine for the Fiverr Studio (Remy / STUDIO-01).
//
// WHY HYBRID: a clickable thumbnail is a PHOTO with bold text on top — exactly how real designers work.
//   • Raster models (FLUX) render gorgeous photoreal SUBJECTS but mangle text.
//   • Vector/SVG renders crisp TEXT but draws people as crude geometric silhouettes.
// So we let each do what it's good at: FLUX paints the subject (free, Cloudflare), and CODE composites
// the headline + accent badge on top. Deterministic composition lives here (doctrine #1: code disposes).
//
// PIPELINE:  brief → Claude designs a SPEC (subject prompt + headline lines + accent + layout + title)
//            → genImage renders the photoreal subject ($0 on Cloudflare) → compose() builds ONE
//            self-contained 1280×720 SVG (embedded raster + legibility scrim + bold stroked text + badge).
// OUTPUT:    writes <out> (.svg, self-contained → renders in any browser, exports cleanly to PNG via a
//            client-side canvas) and returns { ok, file, svg, spec, subjectOk }.
//
// DOCTRINE #2: this only WRITES a local draft — the operator QCs every thumbnail before any client sees it.

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, env, esc, safeJson, dataUri, defaultClaude, genImage, fitFont, SVG_DEFS } from './studio-lib.mjs';

export { env }; // back-compat for older imports

const W = 1280, H = 720; // YouTube thumbnail canvas

// Quality boilerplate appended to the subject prompt so FLUX returns a polished, MrBeast-grade subject:
// hyper-expressive face, extreme contrast/saturation, studio-flash pop, subject clearly separated from bg.
const SUBJECT_QUALITY = 'ultra-realistic photograph, EXTREME exaggerated facial expression (shocked, wide eyes, mouth open in awe), hyper-saturated vivid colors, very high contrast, punchy HDR look, dramatic studio flash with strong rim light, subject pops sharply off a simple blurred colorful background, shallow depth of field, tack-sharp focus on the face, MrBeast-style high-energy thumbnail subject, close-up framing with headroom, no text, no watermark, no logo';

// ── 1) DESIGN: Claude turns the brief into a structured thumbnail spec (LLM proposes) ───────────────
const SPEC_SYS = `You are the lead thumbnail designer behind viral MrBeast-style YouTube thumbnails — the
highest click-through-rate style on the platform. Given a video brief, design ONE thumbnail in that style.
Respond with ONLY a JSON object — no prose, no markdown fences:
{
  "subject": "a vivid image-gen prompt for ONE dominant photographic subject — a real person with an EXTREME, exaggerated emotion (shock, awe, excitement: wide eyes, dropped jaw), OR one bold hero object. Hyper close-up, dramatic lighting, the subject must POP off a simple colorful/blurred background. NO text, NO logos.",
  "subjectSide": "left" | "right" | "center",   // where the subject sits; text goes on the opposite side (or bottom for center)
  "headline": ["1 to 3 ULTRA-SHORT ALL-CAPS lines", "ideally 1-2 words each", "huge + punchy"],
  "accentLineIndex": 0,                            // index of the headline line to color with the accent (or -1)
  "accent": "#ffcc00",                             // a punchy, high-saturation accent (yellow/red/green/cyan pop best)
  "badge": "1-2 word corner badge or empty string",
  "mood": "dark" | "bright",
  "videoTitle": "the real, click-worthy video title in sentence case (how it reads under the thumbnail)",
  "channel": "a plausible channel name for this niche"
}
MrBeast rules: ONE dominant subject + ONE dominant idea; FEWER words = bigger = better (1-3 words total, a
big NUMBER if relevant); maximum emotion on the face; loud saturated colors and high contrast; curiosity gap
that demands the click; legible as a tiny thumbnail. Never use copyrighted characters, real brand logos, or a
real person's likeness.`;

function fallbackSpec(brief) {
  const words = String(brief || 'this video').replace(/^(a |an |the )/i, '').split(/\s+/).filter(Boolean);
  const l1 = words.slice(0, 2).join(' ').toUpperCase() || 'WATCH';
  const l2 = words.slice(2, 4).join(' ').toUpperCase();
  return {
    subject: `a person with a shocked, excited expression, looking at the camera, ${String(brief).slice(0, 120)}`,
    subjectSide: 'right', headline: [l1, l2].filter(Boolean), accentLineIndex: 1, accent: '#ffd400',
    badge: '', mood: 'dark', videoTitle: String(brief).slice(0, 80), channel: 'Studio',
  };
}

function normalizeSpec(j, brief) {
  const s = j && typeof j === 'object' ? j : fallbackSpec(brief);
  s.subject = String(s.subject || fallbackSpec(brief).subject).slice(0, 400);
  s.subjectSide = ['left', 'right', 'center'].includes(s.subjectSide) ? s.subjectSide : 'right';
  s.headline = (Array.isArray(s.headline) ? s.headline : [String(s.headline || '')])
    .map((l) => String(l || '').toUpperCase().trim()).filter(Boolean).slice(0, 3);
  if (!s.headline.length) s.headline = fallbackSpec(brief).headline;
  s.accent = /^#[0-9a-fA-F]{3,8}$/.test(String(s.accent || '')) ? s.accent : '#ffd400';
  s.accentLineIndex = Number.isInteger(s.accentLineIndex) ? s.accentLineIndex : -1;
  s.badge = String(s.badge || '').slice(0, 22);
  s.mood = s.mood === 'bright' ? 'bright' : 'dark';
  s.videoTitle = String(s.videoTitle || brief || '').slice(0, 100);
  s.channel = String(s.channel || 'Studio').slice(0, 40);
  return s;
}

export async function designSpec(brief, claudeFn = defaultClaude) {
  const r = await claudeFn(SPEC_SYS, String(brief || ''));
  return normalizeSpec(safeJson(r && r.text), brief);
}

// ── 2) COMPOSE: deterministic 1280×720 SVG — embedded raster + scrim + bold stroked headline + badge ──
export function compose({ rasterDataUri, spec }) {
  const lines = spec.headline.length ? spec.headline : ['WATCH'];
  const side = spec.subjectSide;                       // subject side; text goes opposite (bottom for center)
  const textSide = side === 'left' ? 'right' : side === 'right' ? 'left' : 'bottom';
  const accent = spec.accent || '#ffd400';

  const pad = 60;
  let colX, colW, anchor, blockBottom;
  if (textSide === 'left') { colX = pad; colW = 600; anchor = 'start'; blockBottom = H - 70; }
  else if (textSide === 'right') { colX = W - pad; colW = 600; anchor = 'end'; blockBottom = H - 70; }
  else { colX = W / 2; colW = W - 2 * pad; anchor = 'middle'; blockBottom = H - 56; }

  // MrBeast style = FEWER, BIGGER words. Push the base sizes up and the stroke thicker.
  const base = lines.length >= 3 ? 112 : lines.length === 2 ? 150 : 196;
  const fs1 = fitFont(lines, colW, base);
  const lineH = Math.round(fs1 * 1.0);
  const startY = blockBottom - (lines.length - 1) * lineH;

  const scrim =
    textSide === 'left' ? `<rect width="${W}" height="${H}" fill="url(#scrimL)"/>`
    : textSide === 'right' ? `<rect width="${W}" height="${H}" fill="url(#scrimR)"/>`
    : `<rect width="${W}" height="${H}" fill="url(#scrimB)"/>`;

  const textEls = lines.map((ln, i) => {
    const fill = i === spec.accentLineIndex ? accent : '#ffffff';
    return `<text x="${colX}" y="${startY + i * lineH}" text-anchor="${anchor}" `
      + `font-family="'Arial Black','Archivo Black',Impact,sans-serif" font-weight="900" font-size="${fs1}" `
      + `fill="${fill}" stroke="#0a0a0a" stroke-width="${Math.max(9, Math.round(fs1 * 0.1))}" `
      + `paint-order="stroke" stroke-linejoin="round" letter-spacing="-2">${esc(ln)}</text>`;
  }).join('\n    ');

  let badge = '';
  if (spec.badge) {
    const bw = Math.max(160, spec.badge.length * 24 + 48), bh = 70;
    const bx = textSide === 'right' ? W - pad - bw : pad, by = 40;
    badge = `<g filter="url(#ds)"><rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="12" fill="${accent}" stroke="#0a0a0a" stroke-width="4"/>`
      + `<text x="${bx + bw / 2}" y="${by + bh / 2 + 14}" text-anchor="middle" font-family="'Arial Black',Impact,sans-serif" font-weight="900" font-size="38" fill="#0a0a0a" letter-spacing="1">${esc(spec.badge.toUpperCase())}</text></g>`;
  }

  // the "pop" color grade: crank saturation + contrast on the photo for that hyper-vivid MrBeast look.
  const image = rasterDataUri
    ? `<image href="${rasterDataUri}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice" filter="url(#pop)"/>`
    : `<rect width="${W}" height="${H}" fill="#111827"/><rect width="${W}" height="${H}" fill="url(#fbg)"/>`;

  // a soft accent glow behind the subject for extra color punch
  const glowCx = side === 'right' ? W * 0.72 : side === 'left' ? W * 0.28 : W * 0.5;

  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>${SVG_DEFS}
    <linearGradient id="fbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1f2937"/><stop offset="1" stop-color="#0b1220"/></linearGradient>
    <filter id="pop" x="0" y="0" width="100%" height="100%">
      <feColorMatrix type="saturate" values="1.5"/>
      <feComponentTransfer><feFuncR type="linear" slope="1.18" intercept="-0.07"/><feFuncG type="linear" slope="1.18" intercept="-0.07"/><feFuncB type="linear" slope="1.18" intercept="-0.07"/></feComponentTransfer>
    </filter>
    <radialGradient id="popGlow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${accent}" stop-opacity=".5"/><stop offset="100%" stop-color="${accent}" stop-opacity="0"/></radialGradient>
  </defs>
  ${image}
  <ellipse cx="${Math.round(glowCx)}" cy="${Math.round(H * 0.46)}" rx="${Math.round(W * 0.34)}" ry="${Math.round(H * 0.5)}" fill="url(#popGlow)"/>
  <rect width="${W}" height="${H}" fill="url(#vig)"/>
  ${scrim}
  <g filter="url(#ds)">
    ${textEls}
  </g>
  ${badge}
</svg>`;
}

// ── orchestrator ────────────────────────────────────────────────────────────────────────────────
export async function makeThumbnail({ brief, out, claudeFn = defaultClaude, spec: presetSpec } = {}) {
  const spec = presetSpec ? normalizeSpec(presetSpec, brief) : await designSpec(brief, claudeFn);
  const subjRel = path.join('fiverr-assets', `subject-${Date.now()}.jpg`);
  const g = await genImage(spec.subject + ', ' + SUBJECT_QUALITY, subjRel, '1536x1024');
  let rasterDataUri = '';
  try { if (g.ok) rasterDataUri = dataUri(path.resolve(ROOT, subjRel)); } catch { /* fall back to gradient bg */ }
  const svg = compose({ rasterDataUri, spec });
  if (out) {
    fs.mkdirSync(path.resolve(ROOT, path.dirname(out)), { recursive: true });
    fs.writeFileSync(path.resolve(ROOT, out), svg);
  }
  try { if (g.ok) fs.unlinkSync(path.resolve(ROOT, subjRel)); } catch { /* */ }
  return { ok: true, file: out || null, svg, spec, subjectOk: g.ok, subjectError: g.error || null };
}

// ── CLI ───────────────────────────────────────────────────────────────────────────────────────
if (process.argv[1] && process.argv[1].endsWith('make-thumbnail.mjs')) {
  const args = process.argv.slice(2);
  const getFlag = (n, d) => { const i = args.indexOf('--' + n); return i > -1 && args[i + 1] ? args[i + 1] : d; };
  const brief = args.filter((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--out').join(' ')
    || 'a YouTube thumbnail about saving $10,000 in 90 days';
  const out = getFlag('out', `fiverr-assets/thumbnail-${Date.now()}.svg`);
  makeThumbnail({ brief, out })
    .then((r) => console.log(JSON.stringify({ ok: r.ok, file: r.file, subjectOk: r.subjectOk, subjectError: r.subjectError, spec: r.spec }, null, 2)))
    .catch((e) => { console.error(e); process.exitCode = 1; });
}
