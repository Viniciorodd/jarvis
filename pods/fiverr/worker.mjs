// Fiverr pod worker (Remy / STUDIO-01) — turns an order brief into a real deliverable.
// Brief → Claude refines it into an image prompt → the existing image engine (scripts/gen-image.mjs,
// Cloudflare FLUX, free) renders it → HITL "deliver to client?" gate. Nothing ships without your QC.

import path from 'node:path';
import { spawn } from 'node:child_process';
import { ROOT, emit, mirror, hqApproval, claude } from '../lib.mjs';

function genImage(prompt, out, size = '1280x720') {
  return new Promise((resolve) => {
    const ps = spawn(process.execPath, [path.join(ROOT, 'scripts', 'gen-image.mjs'), prompt, '--out', out, '--size', size], { cwd: ROOT });
    let err = '';
    ps.stderr.on('data', (d) => { err += d; });
    ps.on('close', (code) => resolve(code === 0 ? { ok: true } : { ok: false, error: (err.trim().split('\n').pop() || ('exit ' + code)).slice(0, 200) }));
    ps.on('error', (e) => resolve({ ok: false, error: e.message }));
  });
}

export async function runOrder({ brief, orderId = 'order-' + Date.now() } = {}) {
  await mirror('STUDIO-01', 'work', `Producing: ${String(brief).slice(0, 56)}`, 'fiverr');
  await emit({ kind: 'action', actor: 'STUDIO-01', pod: 'fiverr', action: 'order.start', rationale: String(brief).slice(0, 120), payload: { orderId } });

  const p = await claude('Turn this Fiverr order brief into ONE vivid, concrete image-generation prompt (<60 words). Output ONLY the prompt — no preamble.', String(brief), { tier: 'cheap', maxTokens: 120 });
  const prompt = (p.text || String(brief)).trim().replace(/\s+/g, ' ').slice(0, 300);

  const out = `fiverr-assets/${orderId}.png`;
  await mirror('STUDIO-01', 'work', `Rendering image…`, 'fiverr');
  const res = await genImage(prompt, out);

  if (res.ok) {
    await emit({ kind: 'action', actor: 'STUDIO-01', pod: 'fiverr', action: 'order.produced', reversible: true, rationale: `image ready: ${out}`, payload: { orderId, file: out, prompt } });
    await emit({ kind: 'approval.request', actor: 'STUDIO-01', pod: 'fiverr', action: 'deliver', status: 'pending', reversible: false, rationale: `Deliverable ready for: ${String(brief).slice(0, 60)}`, payload: { orderId, file: out } });
    await hqApproval({ pod: 'Fiverr Studio', title: `Deliver: ${String(brief).slice(0, 48)}`, detail: `Draft image at ${out} — QC, then deliver to client`, xp: 25, verb: 'Review & deliver' });
    await mirror('STUDIO-01', 'need', `Deliverable ready — review & deliver`, 'fiverr');
  } else {
    await emit({ kind: 'action', actor: 'STUDIO-01', pod: 'fiverr', action: 'order.failed', status: 'error', rationale: res.error, payload: { orderId, prompt } });
    await mirror('STUDIO-01', 'error', `Image gen failed: ${res.error}`, 'fiverr');
  }
  return { orderId, file: out, ok: res.ok, prompt };
}

if (process.argv[1] && process.argv[1].endsWith('worker.mjs') && process.argv[1].includes('fiverr')) {
  const brief = process.argv.slice(2).join(' ') || 'a bold, high-contrast YouTube thumbnail about saving money';
  runOrder({ brief }).then((r) => console.log(JSON.stringify(r, null, 2))).catch((e) => { console.error(e); process.exitCode = 1; });
}
