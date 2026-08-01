// vision.mjs — letting Jarvis LOOK, on demand, and letting him drive her with his hands.
//
// Operator: *"give jarvis access to my camera so that she can see with intelligence how i feel, what i am
// holding, and maybe even be able to control her with my hands like tony stark does."*
//
// Three asks. Two are straightforward and one needed changing, so this file is explicit about which is which:
//
//  1. "WHAT AM I HOLDING" — a frame, on request, to a vision model. Real and useful. Built.
//  2. "CONTROL HER WITH MY HANDS" — gesture detection. Built, dependency-free (see GESTURES below).
//  3. "HOW I FEEL" — deliberately NOT built as emotion inference. Reading an internal state off a face is
//     scientifically contested and fails hardest exactly where he lives: tired, in pain, worried about Ana,
//     concentrating. It would produce a confident wrong reading of his feelings, which is the same failure
//     class as every confabulation we removed this week — only more personal. Instead `observableNotes()`
//     reports what is actually TRUE and checkable: how long he has been at the desk, what time it is, how
//     long since a break. Same care, no guessing about his inner life.
//
// PRIVACY (his own rule, from the Desktop Presence PRD): "Never continuous recording — a persistent watcher
// over a machine holding legal, medical, and financial data is an unacceptable privacy surface. On-demand
// only, with a visible indicator when it looks." Enforced here in code: `canLook()` refuses anything that
// looks like a standing watch, frames are never written to disk, and nothing is ever sent without an
// explicit request carrying a reason.

// ── 1. LOOKING ────────────────────────────────────────────────────────────────────────────────────
// PURE: the instruction sent with a frame. Kept narrow on purpose — a broad "describe everything" invites
// the model to comment on his face, his home, and his state, which is precisely what we are not doing.
export const LOOK_KINDS = {
  object: 'Describe ONLY the object the person is holding or showing to the camera. Name it specifically (brand, model, or text on it if legible). If they are not holding anything, say exactly: "You are not holding anything I can identify." Do not describe the person, their expression, their mood, or the room.',
  read: 'Read ALL text visible in this image, verbatim, in reading order. If there is no legible text, say exactly: "No legible text." Do not describe the person or the room.',
  scene: 'Describe the workspace and objects visible. Do NOT describe the person, their face, their expression, their mood, their appearance, or anything about their emotional state.',
};

// PURE: is this a legitimate on-demand look? Fails closed. `reason` must be present because every look is
// logged with WHY it happened — a look nobody can account for is the thing we promised never to build.
export function canLook({ kind = 'object', reason = '', continuous = false, sinceLastLookMs = Infinity, minGapMs = 1500 } = {}) {
  if (continuous === true) return { allow: false, reason: 'continuous watching is not supported — Jarvis looks only when you ask' };
  if (!LOOK_KINDS[kind]) return { allow: false, reason: `unknown look type "${kind}"` };
  if (!String(reason || '').trim()) return { allow: false, reason: 'every look needs a stated reason (it goes in the record)' };
  // A tight loop of "single" looks is a watch with extra steps.
  if (Number(sinceLastLookMs) < Number(minGapMs)) return { allow: false, reason: 'too soon after the last look — that would be watching, not looking' };
  return { allow: true, reason: '' };
}

// PURE: strip anything the model volunteers about the person despite being told not to. Belt and braces:
// the prompt asks it not to, and this drops it if it does anyway — prompts are not guards.
const PERSON_LINE = /\b(you (look|seem|appear)|he (looks|seems|appears)|the (person|man|user) (looks|seems|appears)|(seems|looks) (tired|stressed|happy|sad|angry|frustrated|anxious|upset|worried))\b/i;
export function stripPersonalRead(text = '') {
  return String(text || '')
    .split(/(?<=[.!?])\s+/)
    .filter((s) => !PERSON_LINE.test(s))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── 2. GESTURES ───────────────────────────────────────────────────────────────────────────────────
// Dependency-free by design. Hand-landmark libraries (MediaPipe et al.) are third-party code loaded from a
// CDN, and the operator's own Repo Security Audit SOP says no external code ships without a logged CLEAN
// verdict. So this classifies COARSE gestures from motion energy in a 3x3 grid, computed in the browser
// from frame differences — no model, no network, no library, nothing leaves the machine.
// Coarse is honest: four reliable gestures beat twenty flaky ones. Fine-grained tracking can come later
// behind an audit.
export const GESTURES = {
  dismiss: 'palm across the camera — closes the overlay',
  next: 'sweep right — next item',
  prev: 'sweep left — previous item',
  capture: 'hold still, centre — take a look',
};

// PURE: motion grid (9 cells, 0..1) + the previous centre-of-motion → a gesture, or null.
// `null` is the common, correct answer: gestures must be rare and deliberate, or the camera starts
// "deciding" things while he is just moving around.
export function classifyGesture({ cells = [], prevX = null, energy = 0, minEnergy = 0.18 } = {}) {
  if (!Array.isArray(cells) || cells.length !== 9) return null;
  if (energy < minEnergy) return null;                       // nothing meaningful moved
  const covered = cells.filter((c) => c > 0.35).length;
  if (covered >= 7) return 'dismiss';                        // whole frame occluded = palm over the lens
  // horizontal centre of motion, 0 (left) .. 1 (right)
  const colMass = [0, 1, 2].map((c) => cells[c] + cells[c + 3] + cells[c + 6]);
  const total = colMass.reduce((a, b) => a + b, 0) || 1;
  const x = (colMass[0] * 0 + colMass[1] * 0.5 + colMass[2] * 1) / total;
  if (prevX != null) {
    if (x - prevX > 0.28) return 'next';
    if (prevX - x > 0.28) return 'prev';
  }
  // still + centred + strong = a deliberate hold
  if (colMass[1] / total > 0.6 && cells[4] > 0.4) return 'capture';
  return null;
}

// PURE: the horizontal centre of motion, for the caller to feed back as prevX next frame.
export function motionCentre(cells = []) {
  if (!Array.isArray(cells) || cells.length !== 9) return null;
  const colMass = [0, 1, 2].map((c) => cells[c] + cells[c + 3] + cells[c + 6]);
  const total = colMass.reduce((a, b) => a + b, 0);
  if (!total) return null;
  return (colMass[1] * 0.5 + colMass[2] * 1) / total;
}

// ── 3. WELLBEING, THE HONEST VERSION ──────────────────────────────────────────────────────────────
// PURE: what is actually TRUE about how he has been working — no inference about how he feels.
// Every line here is checkable against a clock. Returns [] when there is nothing worth saying, because an
// assistant that comments on every hour is one he mutes.
export function observableNotes({ sessionStartMs = null, now = Date.now(), lastBreakMs = null, hour = null } = {}) {
  const out = [];
  const h = hour == null ? new Date(now).getHours() : hour;
  const mins = (a, b) => Math.floor((b - a) / 60000);
  if (sessionStartMs) {
    const m = mins(sessionStartMs, now);
    if (m >= 180) out.push(`You've been at this ${Math.floor(m / 60)}h ${m % 60}m straight.`);
  }
  if (lastBreakMs) {
    const m = mins(lastBreakMs, now);
    if (m >= 120) out.push(`No break in ${Math.floor(m / 60)}h.`);
  }
  if (h >= 1 && h < 5) out.push(`It's ${h}am.`);
  return out;
}
