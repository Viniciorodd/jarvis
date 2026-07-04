// pause.mjs — the KILL SWITCH (Trillion Tier 6 / doctrine §9): one tap pauses ALL proactive behavior
// — the scheduler stops firing jobs — without tearing anything down. You can still talk to Jarvis;
// she just won't act on her own until you resume. Optional auto-resume ("pause for 2 hours") so a
// forgotten pause can't silently kill the assistant forever. Flag lives in a plain file the scheduler
// reads directly (works even if the control-plane server is down). Pure check is eval-pinned.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PAUSE_FILE = path.join(ROOT, 'control-plane', 'data', 'pause.json');

// ── PURE: is the pause in force right now? Auto-resume when `until` passes. Eval-pinned. ───────────
export function pauseActive(p, now = Date.now()) {
  if (!p || !p.paused) return false;
  if (p.until && new Date(p.until).getTime() <= now) return false; // auto-resumed
  return true;
}

export function getPause() {
  try { return JSON.parse(fs.readFileSync(PAUSE_FILE, 'utf8')); } catch { return { paused: false }; }
}

// setPause({ paused: true, minutes: 120 }) → pause for 2h; omit minutes for indefinite.
export function setPause({ paused = false, minutes = 0 } = {}) {
  const rec = {
    paused: !!paused,
    at: new Date().toISOString(),
    ...(paused && Number(minutes) > 0 ? { until: new Date(Date.now() + Number(minutes) * 60000).toISOString() } : {}),
  };
  try { fs.mkdirSync(path.dirname(PAUSE_FILE), { recursive: true }); fs.writeFileSync(PAUSE_FILE, JSON.stringify(rec, null, 2)); } catch { /* */ }
  return rec;
}
