// make-logo — clean VECTOR logo engine for the Fiverr Studio (Remy / STUDIO-01).
// Logos are the one gig where the hybrid flips: raster models garble letters and marks, so we DON'T use
// FLUX here. Instead Claude designs a spec (LLM proposes) and CODE composes a guaranteed-crisp SVG (code
// disposes): a monogram inside a curated container shape + a wordmark + optional tagline. Always sharp,
// always legible, fully editable, scales to any size, and exports cleanly to PNG.
//
// OUTPUT: writes <out> (.svg) and returns { ok, file, svg, spec }.

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, esc, safeJson, defaultClaude } from './studio-lib.mjs';

const SPEC_SYS = `You are a senior brand identity designer. Given a brand brief, design ONE clean, modern logo.
Respond with ONLY a JSON object — no prose, no fences:
{
  "brand": "the brand name as it should read",
  "monogram": "1-2 UPPERCASE letters for the mark (usually the initials)",
  "tagline": "a short tagline or empty string",
  "container": "circle" | "rounded" | "hexagon" | "shield" | "none",
  "layout": "icon-left" | "icon-top" | "wordmark-only",
  "font": "geometric" | "serif" | "rounded" | "mono",
  "palette": { "bg": "#hex", "ink": "#hex", "accent": "#hex" },
  "vibe": "modern | luxury | playful | techy | organic | corporate"
}
Principles: timeless over trendy; high contrast between accent and ink; geometric sans for tech/modern, serif for luxury/law/editorial, rounded for friendly/consumer, mono for dev/crypto. Pick a bg that flatters the palette (light or dark).`;

const FONTS = {
  geometric: { family: "'Segoe UI','Helvetica Neue',Arial,sans-serif", weight: 700, ls: 2 },
  serif: { family: "'Georgia','Times New Roman',serif", weight: 700, ls: 1 },
  rounded: { family: "'Trebuchet MS','Segoe UI',sans-serif", weight: 700, ls: 1 },
  mono: { family: "ui-monospace,'Consolas','Courier New',monospace", weight: 700, ls: 3 },
};

function fallbackSpec(brief) {
  const brand = String(brief || 'Brand').replace(/^(a |an |the )/i, '').split(/[\s,]+/).slice(0, 2).join(' ') || 'Brand';
  const mono = brand.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || 'B';
  return { brand, monogram: mono, tagline: '', container: 'rounded', layout: 'icon-left', font: 'geometric', palette: { bg: '#0f1620', ink: '#ffffff', accent: '#39e0d0' }, vibe: 'modern' };
}

function normalizeSpec(j, brief) {
  const f = fallbackSpec(brief);
  const s = j && typeof j === 'object' ? j : f;
  s.brand = String(s.brand || f.brand).slice(0, 40);
  s.monogram = String(s.monogram || f.monogram).toUpperCase().replace(/[^A-Z0-9&]/g, '').slice(0, 2) || f.monogram;
  s.tagline = String(s.tagline || '').slice(0, 48);
  s.container = ['circle', 'rounded', 'hexagon', 'shield', 'none'].includes(s.container) ? s.container : 'rounded';
  s.layout = ['icon-left', 'icon-top', 'wordmark-only'].includes(s.layout) ? s.layout : 'icon-left';
  s.font = FONTS[s.font] ? s.font : 'geometric';
  const p = s.palette || {};
  const hex = (v, d) => (/^#[0-9a-fA-F]{3,8}$/.test(String(v)) ? v : d);
  s.palette = { bg: hex(p.bg, f.palette.bg), ink: hex(p.ink, f.palette.ink), accent: hex(p.accent, f.palette.accent) };
  return s;
}

export async function designSpec(brief, claudeFn = defaultClaude) {
  const r = await claudeFn(SPEC_SYS, String(brief || ''));
  return normalizeSpec(safeJson(r && r.text), brief);
}

// relative luminance → choose readable monogram color against the accent fill
function luma(hex) {
  let h = hex.replace('#', ''); if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16) / 255, g = parseInt(h.slice(2, 4), 16) / 255, b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// a curated container shape centered at (cx,cy) with radius r, filled with `fill`.
function container(shape, cx, cy, r, fill) {
  if (shape === 'none') return '';
  if (shape === 'circle') return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`;
  if (shape === 'rounded') return `<rect x="${cx - r}" y="${cy - r}" width="${2 * r}" height="${2 * r}" rx="${r * 0.3}" fill="${fill}"/>`;
  if (shape === 'hexagon') {
    const pts = [];
    for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`); }
    return `<polygon points="${pts.join(' ')}" fill="${fill}"/>`;
  }
  // shield
  return `<path d="M ${cx - r} ${cy - r} Q ${cx - r} ${cy - r * 1.05} ${cx - r * 0.7} ${cy - r * 1.05} L ${cx + r * 0.7} ${cy - r * 1.05} Q ${cx + r} ${cy - r * 1.05} ${cx + r} ${cy - r} L ${cx + r} ${cy + r * 0.25} Q ${cx + r} ${cy + r * 0.9} ${cx} ${cy + r * 1.15} Q ${cx - r} ${cy + r * 0.9} ${cx - r} ${cy + r * 0.25} Z" fill="${fill}"/>`;
}

export function compose({ spec }) {
  const { palette: pal, font } = spec;
  const F = FONTS[font];
  const monoColor = luma(pal.accent) > 0.6 ? pal.ink : '#ffffff';
  const wordmark = spec.brand;
  const wm = font === 'geometric' || font === 'mono' ? wordmark.toUpperCase() : wordmark;

  // canvas + layout geometry
  let W, Hh, iconCx, iconCy, iconR, wmX, wmY, wmAnchor, wmSize, tagX, tagY, tagAnchor;
  if (spec.layout === 'icon-top') {
    W = 900; Hh = 980; iconCx = W / 2; iconCy = 330; iconR = 180; wmAnchor = 'middle'; wmX = W / 2; wmY = 660;
    wmSize = Math.max(46, Math.min(96, Math.round(760 / (0.62 * Math.max(wm.length, 1)))));
    tagAnchor = 'middle'; tagX = W / 2; tagY = wmY + 64;
  } else if (spec.layout === 'wordmark-only') {
    W = 1200; Hh = 460; iconR = 0; iconCx = iconCy = 0; wmAnchor = 'middle'; wmX = W / 2; wmY = Hh / 2 + 10;
    wmSize = Math.max(60, Math.min(150, Math.round(1040 / (0.62 * Math.max(wm.length, 1)))));
    tagAnchor = 'middle'; tagX = W / 2; tagY = wmY + 80;
  } else { // icon-left
    W = 1200; Hh = 480; iconCx = 250; iconCy = Hh / 2; iconR = 165; wmAnchor = 'start'; wmX = 470; wmY = Hh / 2 + 8;
    wmSize = Math.max(54, Math.min(120, Math.round(660 / (0.6 * Math.max(wm.length, 1)))));
    tagAnchor = 'start'; tagX = 472; tagY = wmY + 60;
  }

  const cont = container(spec.container, iconCx, iconCy, iconR, pal.accent);
  // monogram (or, for container:none in an icon layout, a small accent dot-mark before the wordmark)
  let mark = '';
  if (spec.layout !== 'wordmark-only') {
    if (spec.container === 'none') {
      mark = `<circle cx="${iconCx}" cy="${iconCy}" r="${iconR * 0.5}" fill="${pal.accent}"/>`
        + `<circle cx="${iconCx + iconR * 0.36}" cy="${iconCy - iconR * 0.36}" r="${iconR * 0.26}" fill="${pal.ink}"/>`;
    } else {
      mark = cont + `<text x="${iconCx}" y="${iconCy + iconR * 0.34}" text-anchor="middle" font-family="${F.family}" font-weight="800" font-size="${iconR * 1.0}" fill="${monoColor}" letter-spacing="0">${esc(spec.monogram)}</text>`;
    }
  }

  // wordmark — color the wordmark in ink; if wordmark-only, accent the first letter for a focal point
  let wmEl;
  if (spec.layout === 'wordmark-only' && wm.length > 1) {
    wmEl = `<text x="${wmX}" y="${wmY}" text-anchor="${wmAnchor}" font-family="${F.family}" font-weight="${F.weight}" font-size="${wmSize}" letter-spacing="${F.ls}"><tspan fill="${pal.accent}">${esc(wm[0])}</tspan><tspan fill="${pal.ink}">${esc(wm.slice(1))}</tspan></text>`;
  } else {
    wmEl = `<text x="${wmX}" y="${wmY}" text-anchor="${wmAnchor}" font-family="${F.family}" font-weight="${F.weight}" font-size="${wmSize}" fill="${pal.ink}" letter-spacing="${F.ls}">${esc(wm)}</text>`;
  }
  const tag = spec.tagline
    ? `<text x="${tagX}" y="${tagY}" text-anchor="${tagAnchor}" font-family="${F.family}" font-weight="400" font-size="${Math.round(wmSize * 0.3)}" fill="${pal.ink}" opacity=".7" letter-spacing="${Math.max(2, F.ls * 2)}">${esc(spec.tagline.toUpperCase())}</text>`
    : '';

  return `<svg viewBox="0 0 ${W} ${Hh}" width="${W}" height="${Hh}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${Hh}" fill="${pal.bg}"/>
  ${mark}
  ${wmEl}
  ${tag}
</svg>`;
}

export async function makeLogo({ brief, out, claudeFn = defaultClaude, spec: presetSpec } = {}) {
  const spec = presetSpec ? normalizeSpec(presetSpec, brief) : await designSpec(brief, claudeFn);
  const svg = compose({ spec });
  if (out) { fs.mkdirSync(path.resolve(ROOT, path.dirname(out)), { recursive: true }); fs.writeFileSync(path.resolve(ROOT, out), svg); }
  return { ok: true, file: out || null, svg, spec };
}

if (process.argv[1] && process.argv[1].endsWith('make-logo.mjs')) {
  const args = process.argv.slice(2);
  const getFlag = (n, d) => { const i = args.indexOf('--' + n); return i > -1 && args[i + 1] ? args[i + 1] : d; };
  const brief = args.filter((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--out').join(' ') || 'a logo for "Northwind Coffee Roasters", warm and artisanal';
  const out = getFlag('out', `fiverr-assets/logo-${Date.now()}.svg`);
  makeLogo({ brief, out })
    .then((r) => console.log(JSON.stringify({ ok: r.ok, file: r.file, spec: r.spec }, null, 2)))
    .catch((e) => { console.error(e); process.exitCode = 1; });
}
