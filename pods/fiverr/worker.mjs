// Fiverr pod worker (Remy / STUDIO-01) — turns an order brief into a real deliverable. TWO design engines,
// chosen by gig type:
//   • Claude-SVG (free) — for TEXT-HEAVY design (thumbnails, eBook covers, logos, ad/social cards): Claude
//     authors a complete, editable vector with large legible text — exactly where raster models butcher text.
//   • FLUX raster (scripts/gen-image.mjs, Cloudflare, free) — for PHOTOREAL gigs (product shots, scenes).
// Everything goes behind the HITL "deliver?" gate — nothing ships without your QC.
// (Canva: template-based designs can be produced via the connected Canva on request; the autonomous pod
//  uses Claude-SVG + FLUX since it can't call the Canva MCP itself.)

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ROOT, emit, mirror, hqApproval, gateApproval, claude } from '../lib.mjs';

// text-heavy design gigs → Claude-SVG; photoreal cues → FLUX. Default to SVG (free, strong text).
const PHOTO = /\b(photo|photoreal|realistic|portrait|product shot|render|3d|lifestyle|mockup|scene|landscape)\b/i;
const TEXTY = /\b(thumbnail|cover|logo|ad|ads|banner|flyer|poster|infographic|social|quote|card|menu|brochure|title|typograph|design|graphic)\b/i;
function pickEngine(brief) { const b = String(brief); if (PHOTO.test(b)) return 'flux'; if (TEXTY.test(b)) return 'svg'; return 'svg'; }

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
  if (engine === 'svg') {
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

  if (res.ok) {
    await emit({ kind: 'action', actor: 'STUDIO-01', pod: 'fiverr', action: 'order.produced', reversible: true, rationale: `${engine === 'svg' ? 'vector design' : 'image'} ready: ${out}`, payload: { orderId, file: out, engine, prompt } });
    await gateApproval(
      { kind: 'approval.request', actor: 'STUDIO-01', pod: 'fiverr', action: 'deliver', status: 'pending', reversible: false, rationale: `Deliverable ready for: ${String(brief).slice(0, 60)}`, payload: { orderId, file: out, engine } },
      { pod: 'Fiverr Studio', title: `Deliver: ${String(brief).slice(0, 48)}`, detail: `${engine === 'svg' ? 'Editable vector (SVG — export to PNG/JPG when delivering)' : 'Draft image'} at ${out} — QC, then deliver`, xp: 25, verb: 'Review & deliver' });
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
