// Fiverr pod worker (Remy / STUDIO-01) — turns an order brief into a real deliverable. THREE engines,
// chosen by gig type (see pickEngine):
//   • thumbnail (HYBRID, flagship) — photoreal FLUX subject + code-composited bold headline
//     (scripts/make-thumbnail.mjs): a real, clickable YouTube thumbnail. Photo where photos win, crisp
//     vector text where raster models butcher text. Never a crude silhouette, never truncated.
//   • Claude-SVG (free) — other TEXT-HEAVY design (eBook covers, logos, ad/social cards): legible vector.
//   • FLUX raster (scripts/gen-image.mjs, Cloudflare, free) — pure PHOTOREAL gigs (product shots, scenes).
// Everything goes behind the HITL "deliver?" gate — nothing ships without your QC.
// (Canva: template-based designs can be produced via the connected Canva on request; the autonomous pod
//  uses these built-in engines since it can't call the Canva MCP itself.)

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ROOT, emit, mirror, hqApproval, gateApproval, claude } from '../lib.mjs';
import { makeThumbnail } from '../../scripts/make-thumbnail.mjs';
import { makeCover } from '../../scripts/make-cover.mjs';
import { makeLogo } from '../../scripts/make-logo.mjs';

// Design engines, chosen by gig type (see pickEngine):
//   • thumbnail (HYBRID) — photoreal FLUX subject + code-composited MrBeast-style headline (make-thumbnail.mjs).
//   • cover (HYBRID) — FLUX cover art + composited title/author, KDP-ready portrait (make-cover.mjs).
//   • logo (VECTOR) — clean code-composed monogram + wordmark, always crisp (make-logo.mjs).
//   • Claude-SVG (free) — other text-heavy design (ad/social cards, banners): legible vector text.
//   • FLUX raster (free) — pure photoreal gigs (product shots, scenes) with no headline.
const THUMB = /\bthumb(nail)?s?\b/i;
const LOGO = /\blogos?\b|\bbrand(ing|mark)?\b|\bwordmark\b|\bmonogram\b/i;
const COVER = /\b(book cover|e-?book|cover|kindle|kdp|paperback|novel|memoir)\b/i;
const PHOTO = /\b(photo|photoreal|realistic|portrait|product shot|render|3d|lifestyle|scene|landscape)\b/i;
const TEXTY = /\b(ad|ads|banner|flyer|poster|infographic|social|quote|card|menu|brochure|title|typograph|design|graphic)\b/i;
function pickEngine(brief) {
  const b = String(brief);
  if (THUMB.test(b)) return 'thumbnail';
  if (LOGO.test(b)) return 'logo';
  if (COVER.test(b)) return 'cover';
  if (PHOTO.test(b)) return 'flux';
  if (TEXTY.test(b)) return 'svg';
  return 'svg';
}

// the pod's vault-scoped brain (least privilege — doctrine #3), shaped for the thumbnail engine's claudeFn.
const studioClaude = (system, user) => claude(system, user, { tier: 'draft', maxTokens: 600, agent: 'STUDIO-01' });

function genImage(prompt, out, size = '1280x720') {
  return new Promise((resolve) => {
    const ps = spawn(process.execPath, [path.join(ROOT, 'scripts', 'gen-image.mjs'), prompt, '--out', out, '--size', size], { cwd: ROOT });
    let err = '';
    ps.stderr.on('data', (d) => { err += d; });
    ps.on('close', (code) => resolve(code === 0 ? { ok: true } : { ok: false, error: (err.trim().split('\n').pop() || ('exit ' + code)).slice(0, 200) }));
    ps.on('error', (e) => resolve({ ok: false, error: e.message }));
  });
}

// Claude authors a complete, self-contained SVG deliverable (legible text, strong composition).
async function genSvgDesign(brief, outSvg) {
  const sys = 'You are a senior brand + graphic designer. Produce ONE complete, self-contained SVG for this Fiverr deliverable — NO external images or web fonts (use system font families like Arial/Georgia/Impact). Pick a viewBox that fits the format (YouTube thumbnail 1280x720; eBook cover 1600x2560; social/ad card 1080x1080; logo 800x800; banner 1500x500). Requirements: a strong focal composition, BOLD LEGIBLE text as <text> (large, high-contrast, well-kerned), tasteful gradients/shapes, a cohesive modern palette. Return ONLY the <svg>…</svg> markup — no markdown, no commentary.';
  const r = await claude(sys, String(brief), { tier: 'draft', maxTokens: 4000, agent: 'STUDIO-01' });
  let svg = String(r.text || '').replace(/```(?:svg|xml|html)?/gi, '').trim(); // drop any code fences
  const start = svg.search(/<svg[\s>]/i);
  if (start === -1) return { ok: false, error: 'model did not return SVG markup', cost: r.cost || 0 };
  svg = svg.slice(start);
  const end = svg.lastIndexOf('</svg>');
  svg = end !== -1 ? svg.slice(0, end + 6) : svg + '</svg>'; // tolerate a truncated tail so it still renders
  fs.mkdirSync(path.join(ROOT, 'fiverr-assets'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, outSvg), svg);
  return { ok: true, cost: r.cost || 0 };
}

export async function runOrder({ brief, orderId = 'order-' + Date.now() } = {}) {
  await mirror('STUDIO-01', 'work', `Producing: ${String(brief).slice(0, 56)}`, 'fiverr');
  await emit({ kind: 'action', actor: 'STUDIO-01', pod: 'fiverr', action: 'order.start', rationale: String(brief).slice(0, 120), payload: { orderId } });

  const engine = pickEngine(brief);
  let out, res, prompt = '';
  if (engine === 'thumbnail') {
    out = `fiverr-assets/${orderId}.svg`;
    await mirror('STUDIO-01', 'work', 'Designing thumbnail (photo subject + bold headline)…', 'fiverr');
    try {
      const r = await makeThumbnail({ brief: String(brief), out, claudeFn: studioClaude });
      res = { ok: true }; prompt = r.spec && r.spec.subject || '';
    } catch (e) { res = { ok: false, error: e.message }; }
  } else if (engine === 'cover') {
    out = `fiverr-assets/${orderId}.svg`;
    await mirror('STUDIO-01', 'work', 'Designing cover (art + composited title)…', 'fiverr');
    try {
      const r = await makeCover({ brief: String(brief), out, claudeFn: studioClaude });
      res = { ok: true }; prompt = r.spec && r.spec.background || '';
    } catch (e) { res = { ok: false, error: e.message }; }
  } else if (engine === 'logo') {
    out = `fiverr-assets/${orderId}.svg`;
    await mirror('STUDIO-01', 'work', 'Designing logo (vector mark + wordmark)…', 'fiverr');
    try {
      const r = await makeLogo({ brief: String(brief), out, claudeFn: studioClaude });
      res = { ok: true }; prompt = r.spec && r.spec.brand || '';
    } catch (e) { res = { ok: false, error: e.message }; }
  } else if (engine === 'svg') {
    out = `fiverr-assets/${orderId}.svg`;
    await mirror('STUDIO-01', 'work', 'Designing (Claude vector — legible text)…', 'fiverr');
    res = await genSvgDesign(brief, out);
  } else {
    const p = await claude('Turn this Fiverr order brief into ONE vivid, concrete image-generation prompt (<60 words). Output ONLY the prompt — no preamble.', String(brief), { tier: 'cheap', maxTokens: 120, agent: 'STUDIO-01' });
    prompt = (p.text || String(brief)).trim().replace(/\s+/g, ' ').slice(0, 300);
    out = `fiverr-assets/${orderId}.png`;
    await mirror('STUDIO-01', 'work', 'Rendering image (FLUX)…', 'fiverr');
    res = await genImage(prompt, out);
  }

  const KIND = { thumbnail: 'thumbnail', cover: 'book cover', logo: 'logo', svg: 'vector design' }[engine] || 'image';
  const DETAIL = {
    thumbnail: 'Clickable YouTube thumbnail (1280×720 — open the Studio tab to preview + download PNG)',
    cover: 'Book/eBook cover (1600×2400 portrait — preview + download PNG in the Studio tab)',
    logo: 'Vector logo (crisp at any size — preview + download PNG in the Studio tab)',
    svg: 'Editable vector (SVG — export to PNG/JPG when delivering)',
  }[engine] || 'Draft image';
  if (res.ok) {
    await emit({ kind: 'action', actor: 'STUDIO-01', pod: 'fiverr', action: 'order.produced', reversible: true, rationale: `${KIND} ready: ${out}`, payload: { orderId, file: out, engine, prompt } });
    await gateApproval(
      { kind: 'approval.request', actor: 'STUDIO-01', pod: 'fiverr', action: 'deliver', status: 'pending', reversible: false, rationale: `Deliverable ready for: ${String(brief).slice(0, 60)}`, payload: { orderId, file: out, engine } },
      { pod: 'Fiverr Studio', title: `Deliver: ${String(brief).slice(0, 48)}`, detail: `${DETAIL} at ${out} — QC, then deliver`, xp: 25, verb: 'Review & deliver' });
    await mirror('STUDIO-01', 'need', `Deliverable ready — review & deliver`, 'fiverr');
  } else {
    await emit({ kind: 'action', actor: 'STUDIO-01', pod: 'fiverr', action: 'order.failed', status: 'error', rationale: res.error, payload: { orderId, engine, prompt } });
    await mirror('STUDIO-01', 'error', `${engine === 'svg' ? 'Design' : 'Image gen'} failed: ${res.error}`, 'fiverr');
  }
  return { orderId, file: out, ok: res.ok, engine, prompt };
}

if (process.argv[1] && process.argv[1].endsWith('worker.mjs') && process.argv[1].includes('fiverr')) {
  const brief = process.argv.slice(2).join(' ') || 'a bold, high-contrast YouTube thumbnail about saving money';
  runOrder({ brief }).then((r) => console.log(JSON.stringify(r, null, 2))).catch((e) => { console.error(e); process.exitCode = 1; });
}
