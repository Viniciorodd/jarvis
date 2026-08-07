// record.mjs — a deterministic product-video recorder (Playwright/chromium).
//
// The point of this module is NOT that it drives a browser. It is that it CANNOT ship a video
// containing a number the product did not produce. Marketing everywhere else in this vault is
// guarded by a prompt; here it is guarded by code:
//
//   • an "assert" step compares live product output to an expected value,
//   • ANY mismatch fails the run, DELETES the video file, and exits non-zero,
//   • "capture" is the escape hatch for values nobody has measured yet — it records what the
//     product actually said into the run report so copy can be written from real output, and it
//     never fails a run.
//
// Everything above the IO line is pure and eval-pinned (evals/brand.eval.mjs). The step engine
// takes an injected `driver`, so the assert rule, the selector-map failure and the address guard
// are all provable without a browser or a network.
//
// CLI
//   node pods/brand/record.mjs --script scripts/appsumo-demo.json
//   node pods/brand/record.mjs --script scripts/appsumo-demo.json --stills-only
//   node pods/brand/record.mjs --script scripts/01-taxes-reset.json --dry-run

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

// ── PURE: argument parsing ──────────────────────────────────────────────────────────────────────
export function parseArgs(argv = []) {
  const out = { script: null, stillsOnly: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--script') out.script = argv[++i] || null;
    else if (a.startsWith('--script=')) out.script = a.slice(9);
    else if (a === '--stills-only') out.stillsOnly = true;
    else if (a === '--dry-run') out.dryRun = true;
  }
  return out;
}

// ── PURE: the fictional-property guard ──────────────────────────────────────────────────────────
// Doctrine: every property in published material is fictional, Springfield IL. A real address in a
// demo video is a privacy leak that cannot be recalled once the file is uploaded, so the recorder
// refuses to run rather than trusting the script author to have remembered.
const STREET = /\b\d{1,6}\s+[A-Za-z0-9'.-]+(?:\s+[A-Za-z0-9'.-]+){0,3}\s+(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Ct|Court|Way|Ter|Terrace|Pl|Place|Cir|Circle|Hwy|Highway|Pkwy|Parkway|Trl|Trail)\b\.?/i;
const CITY_STATE = /\b([A-Z][A-Za-z.-]*(?:\s+[A-Z][A-Za-z.-]*){0,2}),\s*(A[LKZR]|C[AOT]|D[EC]|FL|GA|HI|I[ADLN]|K[SY]|LA|M[ADEINOST]|N[CDEHJMVY]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[AT]|W[AIVY])\b/g;
const IS_SPRINGFIELD = /springfield/i;
const IS_ILLINOIS = /\bIL\b|illinois/i;

function everyString(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) everyString(v, out);
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) { out.push(k); everyString(v, out); }
  return out;
}

// → { ok:true } | { ok:false, error, offender }
export function assertFictionalAddresses(script) {
  for (const s of everyString(script)) {
    if (STREET.test(s) && !(IS_SPRINGFIELD.test(s) && IS_ILLINOIS.test(s))) {
      return { ok: false, offender: s, error: `refusing to run: "${s.slice(0, 80)}" looks like a street address that is not Springfield, IL. Every property in published material is fictional.` };
    }
    for (const m of s.matchAll(CITY_STATE)) {
      const [, city, state] = m;
      if (!IS_SPRINGFIELD.test(city) || state !== 'IL') {
        return { ok: false, offender: s, error: `refusing to run: "${city}, ${state}" is not Springfield, IL. Every property in published material is fictional.` };
      }
    }
  }
  return { ok: true };
}

// ── PURE: the never-log-in guard ────────────────────────────────────────────────────────────────
// The demo runs on the public surface. A script that needs auth is a script that would record an
// account, so it stops rather than quietly signing in.
const AUTH_URL = /\/(login|signin|sign-in|auth|account|dashboard|settings|portfolio|deals|reports|expenses|contacts)(\/|$|\?)/i;
const AUTH_FIELD = /pass(word)?|otp|two.?factor|verification.?code/i;

export function assertNoAuth(script) {
  for (const step of script?.steps || []) {
    const url = step.goto || (typeof step.url === 'string' ? step.url : null);
    if (url && AUTH_URL.test(String(url).replace(/^https?:\/\/[^/]+/i, ''))) {
      return { ok: false, error: `refusing to run: step navigates to "${url}", which needs a signed-in account. The demo uses the public surface only.` };
    }
    for (const field of Object.keys(step.set || {})) {
      if (AUTH_FIELD.test(field)) return { ok: false, error: `refusing to run: step sets "${field}", which is a credential field. The recorder never logs in.` };
    }
  }
  return { ok: true };
}

// ── PURE: script shape ──────────────────────────────────────────────────────────────────────────
const STEP_KEYS = ['goto', 'click', 'set', 'wait', 'hover', 'scrollTo', 'highlight', 'still', 'assert', 'capture', 'cue', 'zoom'];

export function validateScript(script) {
  const errors = [];
  if (!script || typeof script !== 'object') return { ok: false, errors: ['script is not an object'] };
  if (!script.id) errors.push('script.id is required — it names every output file');
  if (!Array.isArray(script.steps) || script.steps.length === 0) errors.push('script.steps must be a non-empty array');
  if (!script.outDir) errors.push('script.outDir is required');
  for (const [i, step] of (script.steps || []).entries()) {
    if (!step || typeof step !== 'object') { errors.push(`step ${i}: not an object`); continue; }
    const keys = Object.keys(step).filter((k) => k !== 'hold');
    const known = keys.filter((k) => STEP_KEYS.includes(k));
    if (known.length === 0) errors.push(`step ${i}: no known action in {${keys.join(', ')}} — expected one of ${STEP_KEYS.join(', ')}`);
  }
  const declared = new Set((script.stills || []).map((s) => s.name));
  for (const [i, step] of (script.steps || []).entries()) {
    if (step.still && !declared.has(step.still)) errors.push(`step ${i}: still "${step.still}" is not declared in script.stills`);
  }
  return { ok: errors.length === 0, errors };
}

// ── PURE: the selector map ──────────────────────────────────────────────────────────────────────
// Every selector lives in scripts/selectors.json, never inline in a script — one place to fix when
// the UI moves. A missing entry FAILS LOUDLY with the field name; it is never silently skipped,
// because a skipped step is a video that quietly stops proving what it claims to prove.
export class RecorderError extends Error {}

export function resolveSelector(map, field) {
  if (typeof field === 'string' && /^(text=|css=|xpath=|\/\/|#|\.|\[)/.test(field)) return field; // an explicit locator
  const sel = map && Object.prototype.hasOwnProperty.call(map, field) ? map[field] : undefined;
  if (!sel) throw new RecorderError(`selector map has no entry for "${field}" — add it to scripts/selectors.json`);
  return sel;
}

// ── PURE: the assert rule ───────────────────────────────────────────────────────────────────────
// Normalisation matters more than it looks. The product renders a typographic apostrophe and a
// U+2212 minus; a script is written with the ASCII ones. Comparing raw would fail every run for a
// reason that has nothing to do with the numbers being wrong, and the fix people reach for when
// that happens is to weaken the assert.
export function normaliseText(s) {
  return String(s ?? '')
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchAssert(expected, actual) {
  const e = normaliseText(expected), a = normaliseText(actual);
  if (!e) return false;
  return a === e || a.includes(e);
}

export function decideOutcome(asserts = []) {
  const failures = asserts.filter((a) => !a.pass);
  return { ok: failures.length === 0, failures };
}

// The guarantee, in one function: a failed run leaves no video behind. `fsLike` is injected so the
// eval can prove the deletion happened without recording anything.
//
// `hardError` matters as much as a failed assert. A step that THROWS — a selector that vanished, a
// click that timed out — is a run that never reached its asserts, so its video proves nothing. The
// first version of this module deleted on mismatch but not on throw, and a real run against the
// paywalled /analyze left a .webm sitting in out/ that had recorded nothing but a paywall. That is
// precisely the file someone uploads three weeks later.
export function finalizeRun({ asserts = [], videoPath = null, fsLike = fs, hardError = null } = {}) {
  const d = decideOutcome(asserts);
  const failures = d.failures;
  const ok = d.ok && !hardError;
  let videoDeleted = false;
  if (!ok && videoPath) {
    try { fsLike.rmSync(videoPath, { force: true }); videoDeleted = true; } catch { videoDeleted = false; }
  }
  return { ok, failures, videoDeleted, videoPath: ok ? videoPath : null };
}

// ── PURE: the run report ────────────────────────────────────────────────────────────────────────
export function reportMarkdown(r) {
  const L = [];
  L.push(`# ${r.id} — recorder run`);
  L.push('');
  L.push(`- **Result:** ${r.ok ? '✅ pass' : '❌ FAILED — video deleted'}`);
  if (r.error) L.push(`- **Aborted:** ${r.error}`);
  L.push(`- **Started:** ${r.startedAt}`);
  L.push(`- **Duration:** ${(r.durationMs / 1000).toFixed(1)}s`);
  L.push(`- **URL:** ${r.url || '—'}`);
  L.push(`- **Video:** ${r.videoPath || '— (none)'}`);
  L.push(`- **Stills:** ${(r.stillPaths || []).length}`);
  L.push('');
  if (r.asserts?.length) {
    L.push('## Asserts — live product output vs expected');
    L.push('');
    L.push('| | field | expected | actual |');
    L.push('|---|---|---|---|');
    for (const a of r.asserts) L.push(`| ${a.pass ? '✓' : '✗'} | \`${a.field}\` | ${a.expected} | ${a.actual === null ? '_(not found)_' : a.actual} |`);
    L.push('');
  }
  if (r.captures && Object.keys(r.captures).length) {
    L.push('## Captures — what the product actually said');
    L.push('');
    L.push('_Not asserted. These are unmeasured values; write copy from these numbers, not from memory._');
    L.push('');
    L.push('| label | value |');
    L.push('|---|---|');
    for (const [k, v] of Object.entries(r.captures)) L.push(`| \`${k}\` | ${v === null ? '_(not found)_' : v} |`);
    L.push('');
  }
  if (r.stillPaths?.length) {
    L.push('## Stills');
    L.push('');
    for (const p of r.stillPaths) L.push(`- ${p}`);
    L.push('');
  }
  if (r.warnings?.length) {
    L.push('## Warnings');
    L.push('');
    for (const w of r.warnings) L.push(`- ${w}`);
    L.push('');
  }
  L.push('## Steps');
  L.push('');
  for (const s of r.steps || []) L.push(`${String(s.i).padStart(2, '0')}. ${s.kind} ${s.detail}${s.ms != null ? ` _(${s.ms}ms)_` : ''}`);
  L.push('');
  return L.join('\n');
}

// ── The step engine — driver-injected, so it runs with or without a browser ──────────────────────
// A driver implements: goto(url), click(sel), fill(sel, value), text(sel), wait(ms), hover(sel),
// scrollTo(sel), highlight(sel, ms), still(name, clipSelector). In --dry-run the null driver does
// nothing but read text, which is exactly enough to prove the asserts.
export async function executeSteps({ script, selectors, driver, stillsOnly = false }) {
  const asserts = [], captures = {}, steps = [], stillPaths = [], warnings = [], cues = [];
  const clipOf = new Map((script.stills || []).map((s) => [s.name, s.clip || null]));
  const afterStep = new Map();
  for (const s of script.stills || []) if (Number.isInteger(s.afterStep)) afterStep.set(s.afterStep, s);
  const captured = new Set();

  // `clip` has three modes: a selector-map field clips to that element, "fullPage" shoots the whole
  // scrolling document, and null shoots the viewport. Null is the viewport rather than the full page
  // because these stills go on a marketplace listing: a 1920×1080 frame is the product, whereas a
  // full-page shot of a page with marketing copy below the fold is a screenshot of a web page.
  const shoot = async (name) => {
    const clip = clipOf.get(name) ?? null;
    const target = !clip ? null : clip === 'fullPage' ? 'fullPage' : resolveSelector(selectors, clip);
    const p = await driver.still(name, target);
    if (p) stillPaths.push(p);
    captured.add(name);
    return p;
  };

  for (const [i, step] of script.steps.entries()) {
    const t0 = Date.now();
    let kind = 'unknown', detail = '';

    if (step.goto !== undefined) { kind = 'goto'; detail = step.goto; await driver.goto(step.goto); }
    else if (step.click !== undefined) { kind = 'click'; detail = step.click; await driver.click(resolveSelector(selectors, step.click)); }
    else if (step.set !== undefined) {
      // Typed key-by-key by default. An instant fill is one frame of change and reads as a cut; a
      // number being typed recalculates the whole page live, which is the product's actual argument.
      kind = 'set'; detail = Object.entries(step.set).map(([k, v]) => `${k}=${v}`).join(', ') + (step.instant ? ' (instant)' : ' (typed)');
      for (const [field, value] of Object.entries(step.set)) await driver.fill(resolveSelector(selectors, field), String(value), { instant: !!step.instant });
    }
    else if (step.cue !== undefined) { kind = 'cue'; detail = step.cue; cues.push({ name: step.cue, atMs: await driver.cue(step.cue) }); }
    else if (step.zoom !== undefined) { kind = 'zoom'; detail = `${step.zoom} ×${step.scale ?? 1.15} hold ${step.hold ?? 2000}ms`; await driver.zoom(resolveSelector(selectors, step.zoom), step.scale ?? 1.15, step.hold ?? 2000); }
    else if (step.wait !== undefined) { kind = 'wait'; detail = `${step.wait}ms`; await driver.wait(step.wait); }
    else if (step.hover !== undefined) { kind = 'hover'; detail = step.hover; await driver.hover(resolveSelector(selectors, step.hover)); }
    else if (step.scrollTo !== undefined) { kind = 'scrollTo'; detail = step.scrollTo; await driver.scrollTo(resolveSelector(selectors, step.scrollTo)); }
    else if (step.highlight !== undefined) { kind = 'highlight'; detail = `${step.highlight} hold ${step.hold ?? 2000}ms`; await driver.highlight(resolveSelector(selectors, step.highlight), step.hold ?? 2000); }
    else if (step.still !== undefined) { kind = 'still'; detail = step.still; const p = await shoot(step.still); detail += p ? ` → ${path.basename(p)}` : ''; }
    else if (step.assert !== undefined) {
      kind = 'assert'; detail = Object.keys(step.assert).join(', ');
      for (const [field, expected] of Object.entries(step.assert)) {
        const actual = await driver.text(resolveSelector(selectors, field));
        const pass = actual !== null && matchAssert(expected, actual);
        asserts.push({ field, selector: resolveSelector(selectors, field), expected, actual: actual === null ? null : normaliseText(actual).slice(0, 400), pass });
      }
    }
    else if (step.capture !== undefined) {
      // NEVER fails a run. A capture that finds nothing records null and says so in the report.
      kind = 'capture'; detail = Object.keys(step.capture).join(', ');
      for (const [label, field] of Object.entries(step.capture)) {
        let actual = null;
        try { actual = await driver.text(resolveSelector(selectors, field)); } catch (e) { warnings.push(`capture "${label}": ${e.message}`); }
        captures[label] = actual === null ? null : normaliseText(actual).slice(0, 400);
      }
    }

    steps.push({ i, kind, detail, ms: Date.now() - t0 });
    if (afterStep.has(i) && !captured.has(afterStep.get(i).name)) await shoot(afterStep.get(i).name);
  }

  for (const name of clipOf.keys()) if (!captured.has(name)) warnings.push(`still "${name}" is declared but no step ever captured it`);
  if (stillsOnly) warnings.push('--stills-only: no video was recorded');
  return { asserts, captures, steps, stillPaths, warnings, cues };
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// IO below this line
// ════════════════════════════════════════════════════════════════════════════════════════════════

export function loadJson(p, { label = 'file' } = {}) {
  const tries = [path.resolve(process.cwd(), p), path.resolve(HERE, p), path.resolve(ROOT, p)];
  for (const t of tries) if (fs.existsSync(t)) { try { return { path: t, data: JSON.parse(fs.readFileSync(t, 'utf8')) }; } catch (e) { throw new RecorderError(`${label} ${t} is not valid JSON: ${e.message}`); } }
  throw new RecorderError(`${label} not found: ${p} (looked in ${tries.join(', ')})`);
}

// A pointer the viewer can follow, injected on every document. A screen recording has no real
// cursor in the frame, so without this the page appears to operate itself — which is the single
// biggest reason a product capture reads as "static" no matter how much is moving.
export const CURSOR_INIT = `(() => {
  const draw = () => {
    if (document.getElementById('__recCursor')) return;
    const c = document.createElement('div');
    c.id = '__recCursor';
    c.style.cssText = [
      'position:fixed','left:0','top:0','width:22px','height:22px','z-index:2147483647',
      'pointer-events:none','opacity:0','border-radius:50%',
      'background:radial-gradient(circle at 32% 32%, #ffffff 0%, #dbeafe 45%, #60a5fa 100%)',
      'box-shadow:0 0 0 3px rgba(96,165,250,.35), 0 6px 18px rgba(0,0,0,.55)',
      'transition:transform 700ms cubic-bezier(.33,.9,.28,1), opacity 300ms ease'
    ].join(';');
    (document.body || document.documentElement).appendChild(c);
  };
  const ready = () => { draw();
    window.__cursorTo = (x, y, show = true) => { const c = document.getElementById('__recCursor'); if (!c) return;
      c.style.opacity = show ? '1' : '0';
      c.style.transform = 'translate(' + (x - 11) + 'px,' + (y - 11) + 'px)'; };
    window.__cursorPulse = () => { const c = document.getElementById('__recCursor'); if (!c) return;
      c.animate([{ boxShadow: '0 0 0 3px rgba(96,165,250,.35)' }, { boxShadow: '0 0 0 16px rgba(96,165,250,0)' }], { duration: 550, easing: 'ease-out' }); };
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();
})()`;

// The real driver. Everything it does is visible in the video, which is why the waits are explicit
// rather than "networkidle" — a recording that races the UI is a recording nobody can reproduce.
function playwrightDriver({ page, outDir, id, cueAt = () => 0, scale = 2 }) {
  const settle = 350;

  // Move the pointer to an element and let the eye arrive before anything happens to it.
  const pointAt = async (sel, { pulse = false } = {}) => {
    const box = await page.locator(sel).first().boundingBox().catch(() => null);
    if (!box) return;
    const x = Math.round(box.x + Math.min(box.width / 2, 220)), y = Math.round(box.y + box.height / 2);
    await page.evaluate(([x, y]) => window.__cursorTo && window.__cursorTo(x, y), [x, y]).catch(() => {});
    await page.waitForTimeout(760);
    if (pulse) { await page.evaluate(() => window.__cursorPulse && window.__cursorPulse()).catch(() => {}); await page.waitForTimeout(220); }
  };

  // Native scrollIntoViewIfNeeded jumps. A smooth scroll is the difference between a slideshow and
  // a walkthrough, and it costs nothing but the wait.
  const glideTo = async (sel, block = 'center') => {
    await page.locator(sel).first().evaluate((n, b) => n.scrollIntoView({ behavior: 'smooth', block: b }), block).catch(() => {});
    await page.waitForTimeout(950);
  };

  return {
    async goto(url) {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(settle);
    },
    async click(sel) { await pointAt(sel, { pulse: true }); await page.locator(sel).first().click({ timeout: 15000 }); await page.waitForTimeout(settle); },
    async cue(name) { return cueAt(name); },
    async fill(sel, value, { instant = false } = {}) {
      const el = page.locator(sel).first();
      await glideTo(sel);
      await pointAt(sel, { pulse: true });
      await el.click({ timeout: 15000 });
      await el.fill('');                       // clear first: React controlled inputs keep the old value otherwise
      if (instant) await el.fill(String(value), { timeout: 15000 });
      else await el.pressSequentially(String(value), { delay: 105, timeout: 30000 });
      await el.blur().catch(() => {});
      await page.waitForTimeout(settle);
    },
    // A slow push-in on the element that matters. Transform-only, so it costs no layout and the
    // numbers underneath stay exactly the numbers the assert just checked.
    async zoom(sel, scaleTo = 1.15, hold = 2000) {
      const el = page.locator(sel).first();
      await glideTo(sel);
      await el.evaluate((n, s) => {
        n.dataset.recPrevTransform = n.style.transform || '';
        n.dataset.recPrevTransition = n.style.transition || '';
        n.style.transition = 'transform 900ms cubic-bezier(.2,.8,.2,1)';
        n.style.transform = `scale(${s})`;
      }, scaleTo).catch(() => {});
      await page.waitForTimeout(hold);
      await el.evaluate((n) => { n.style.transform = n.dataset.recPrevTransform || ''; }).catch(() => {});
      await page.waitForTimeout(700);
      await el.evaluate((n) => { n.style.transition = n.dataset.recPrevTransition || ''; }).catch(() => {});
    },
    async text(sel) {
      const el = page.locator(sel).first();
      if (await el.count() === 0) return null;
      try { return (await el.innerText({ timeout: 8000 })) ?? null; } catch { return null; }
    },
    async wait(ms) { await page.waitForTimeout(ms); },
    async hover(sel) { await pointAt(sel); await page.locator(sel).first().hover({ timeout: 15000 }); await page.waitForTimeout(settle); },
    async scrollTo(sel) { await glideTo(sel); await pointAt(sel); },
    // A soft outline drawn on the element, held, then removed — no layout shift, so the number the
    // viewer is being pointed at is the number the assert just checked.
    async highlight(sel, hold = 2000) {
      const el = page.locator(sel).first();
      await el.scrollIntoViewIfNeeded({ timeout: 15000 }).catch(() => {});
      await el.evaluate((node) => {
        node.dataset.recPrevOutline = node.style.outline || '';
        node.dataset.recPrevRadius = node.style.borderRadius || '';
        node.dataset.recPrevShadow = node.style.boxShadow || '';
        node.dataset.recPrevTrans = node.style.transition || '';
        node.style.transition = 'outline-color 400ms ease, box-shadow 400ms ease';
        node.style.borderRadius = node.style.borderRadius || '16px';
        node.style.outline = '2px solid rgba(96,165,250,.85)';
        node.style.boxShadow = '0 0 0 8px rgba(96,165,250,.14)';
      }).catch(() => {});
      await page.waitForTimeout(hold);
      await el.evaluate((node) => {
        node.style.outline = node.dataset.recPrevOutline || '';
        node.style.borderRadius = node.dataset.recPrevRadius || '';
        node.style.boxShadow = node.dataset.recPrevShadow || '';
        node.style.transition = node.dataset.recPrevTrans || '';
      }).catch(() => {});
      await page.waitForTimeout(200);
    },
    async still(name, clipSel) {
      const file = path.join(outDir, `${id}-${name}.png`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      if (clipSel && clipSel !== 'fullPage') {
        const el = page.locator(clipSel).first();
        await el.scrollIntoViewIfNeeded({ timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(250);
        await el.screenshot({ path: file, scale: 'device' });
      } else {
        await page.screenshot({ path: file, fullPage: clipSel === 'fullPage', scale: 'device' });
      }
      return file;
    },
    scale
  };
}

// A dry-run driver: reads nothing, does nothing, and reports every text lookup as not-found so the
// asserts fail. That is the point — `--dry-run` proves the assert wiring, it does not bless a run.
function dryDriver() {
  const noop = async () => {};
  return { goto: noop, click: noop, fill: noop, text: async () => null, wait: noop, hover: noop, scrollTo: noop,
           highlight: noop, zoom: noop, cue: async () => 0, still: async () => null };
}

// ── Capture ─────────────────────────────────────────────────────────────────────────────────────
// Playwright's own recordVideo is why the first cut looked soft: it encodes VP8 at a fixed, low,
// non-configurable quality, and 1080p came out at ~224 kb/s — banding and mosquito noise all over a
// dark UI full of small text. CDP screencast hands us the raw frames instead, so the only encoder
// in the path is one we control.
//
// Chrome emits a frame when the page CHANGES, not on a clock, so the timestamps are irregular and a
// long hold emits nothing at all. Encoding them at a fixed rate would speed up every still moment;
// the concat demuxer with per-frame durations reproduces the real timing.
function ffmpeg(args) {
  const attempts = [
    () => execFileSync('ffmpeg', args, { stdio: 'pipe', shell: process.platform === 'win32' }),
    () => execFileSync('npx', ['--yes', 'remotion', 'ffmpeg', ...args], { stdio: 'pipe', cwd: ROOT, shell: process.platform === 'win32' })
  ];
  const errors = [];
  for (const attempt of attempts) {
    try { attempt(); return { ok: true, error: null }; }
    catch (e) { errors.push(String(e.stderr || e.message || e).split('\n').slice(-3).join(' ').slice(0, 200)); }
  }
  return { ok: false, error: errors.join(' | ') };
}

// Measured on this machine: page.screenshot({type:'jpeg', quality:90}) sustains ~25fps at 1080p,
// where CDP screencast in headless produced 14 frames in 58 SECONDS. Chrome only emits a screencast
// frame when the compositor has damage, and headless never reports damage on an idle page — a rAF
// pacer and the usual render flags did not move it off 0fps, and headed Chrome cannot launch here
// (spawn UNKNOWN). So we drive the shutter ourselves. Every frame is a real screenshot at full
// quality, which is the whole point: the softness came from VP8, not from the resolution.
// fps here is the SHUTTER target, not the delivered rate. A screenshot takes ~40ms and the page is
// busy recalculating, so asking for 25 lands at ~15. Asking for 40 makes the loop re-fire the moment
// the previous frame lands (the inFlight guard prevents pile-up) and delivers ~22.
export async function startCapture(page, frameDir, { fps = 40, quality = 90 } = {}) {
  fs.mkdirSync(frameDir, { recursive: true });
  const frames = [];
  let n = 0, t0 = null, running = true, inFlight = false;

  const shoot = async () => {
    if (!running || inFlight) return;
    inFlight = true;
    try {
      // scale:'css' → 1920×1080 even though the surface is 2x. Chrome rasterises at 2x and
      // downsamples, so the frames are supersampled and the small text is crisper than a native
      // 1x capture would be.
      const buf = await page.screenshot({ type: 'jpeg', quality, scale: 'css', timeout: 5000 });
      const now = Date.now();
      if (t0 === null) t0 = now;
      const file = path.join(frameDir, `f${String(++n).padStart(6, '0')}.jpg`);
      fs.writeFileSync(file, buf);
      frames.push({ file, at: (now - t0) / 1000 });
    } catch { /* a screenshot during navigation can fail; skipping one frame is correct */ }
    inFlight = false;
  };

  const timer = setInterval(shoot, Math.max(20, Math.round(1000 / fps)));
  return {
    frames,
    elapsedMs: () => (t0 === null ? 0 : Date.now() - t0),
    async stop() { running = false; clearInterval(timer); for (let i = 0; i < 40 && inFlight; i++) await new Promise((r) => setTimeout(r, 25)); }
  };
}

// Frames → H.264. CRF 18 at 30fps, and the source is JPEG q92 rather than VP8, so text stays crisp.
function encodeFrames({ frames, outPath, fps = 30 }) {
  if (frames.length < 2) return { ok: false, error: `only ${frames.length} frame(s) captured` };
  const listFile = path.join(path.dirname(frames[0].file), 'frames.txt');
  const lines = [];
  for (let i = 0; i < frames.length; i++) {
    const dur = (i < frames.length - 1 ? frames[i + 1].at - frames[i].at : 1 / fps);
    lines.push(`file '${path.basename(frames[i].file).replace(/'/g, "'\\''")}'`);
    lines.push(`duration ${Math.max(1 / 120, Math.min(10, dur)).toFixed(5)}`);
  }
  lines.push(`file '${path.basename(frames[frames.length - 1].file)}'`); // concat needs the last frame twice
  fs.writeFileSync(listFile, lines.join('\n'));
  // in_range=full: the source is JPEG, so without this the output is tagged yuvj420p and players
  // that honour the flag crush the blacks on an already-dark UI.
  return ffmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', listFile,
    '-vf', `fps=${fps},scale=1920:1080:flags=lanczos:in_range=full:out_range=tv,format=yuv420p`,
    '-color_range', 'tv', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18',
    '-movflags', '+faststart', '-an', outPath]);
}

// Mix the SFX cues onto the finished picture. Each cue is delayed to the moment the step ran, so
// the click lands on the keystroke and the chime lands on the score, not near them.
const SFX_DIR = path.join(process.env.USERPROFILE || process.env.HOME || '', '.claude', 'skills', 'media-use', 'audio', 'assets', 'sfx');
function mixCues({ videoPath, cues, outPath }) {
  const usable = cues.map((c) => ({ ...c, file: path.join(SFX_DIR, `${c.name}.mp3`) })).filter((c) => fs.existsSync(c.file));
  if (!usable.length) return { ok: false, error: cues.length ? 'no cue sound files found' : 'no cues in script' };
  const args = ['-y', '-i', videoPath];
  for (const c of usable) args.push('-i', c.file);
  // adelay=N:all=1 rather than "N|N" — on Windows the pipe is swallowed by the shell and the whole
  // mix dies with "'2554' is not recognized as an internal or external command".
  const chains = usable.map((c, i) => `[${i + 1}:a]adelay=${Math.round(c.atMs)}:all=1,volume=${c.gain ?? 0.55}[a${i}]`);
  const filter = `${chains.join(';')};${usable.map((_, i) => `[a${i}]`).join('')}amix=inputs=${usable.length}:normalize=0:dropout_transition=0[mix]`;
  args.push('-filter_complex', filter, '-map', '0:v', '-map', '[mix]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', outPath);
  const r = ffmpeg(args);
  return r.ok ? { ok: true, count: usable.length, error: null } : r;
}

// ── The run ─────────────────────────────────────────────────────────────────────────────────────
export async function record({ scriptPath, stillsOnly = false, dryRun = false } = {}) {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();

  const { path: resolvedScript, data: script } = loadJson(scriptPath, { label: 'script' });

  const shape = validateScript(script);
  if (!shape.ok) throw new RecorderError(`script ${resolvedScript} is invalid:\n  - ${shape.errors.join('\n  - ')}`);

  const fiction = assertFictionalAddresses(script);
  if (!fiction.ok) throw new RecorderError(fiction.error);

  const auth = assertNoAuth(script);
  if (!auth.ok) throw new RecorderError(auth.error);

  const { data: selectors } = loadJson(path.join(path.dirname(resolvedScript), 'selectors.json'), { label: 'selector map' });

  const outDir = path.resolve(ROOT, script.outDir);
  fs.mkdirSync(outDir, { recursive: true });

  let result = { asserts: [], captures: {}, steps: [], stillPaths: [], warnings: [] };
  let videoPath = null, hardError = null, frameCount = 0, sfxMixed = 0;
  const guard = async (fn) => { try { result = await fn(); } catch (e) { hardError = String(e.message || e).split('\n')[0].slice(0, 300); } };

  if (dryRun) {
    await guard(() => executeSteps({ script, selectors, driver: dryDriver(), stillsOnly: true }));
  } else {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-extensions', '--hide-scrollbars', '--force-color-profile=srgb', '--disable-notifications', '--disable-features=Translate,AcceptCHFrame']
    });
    // Fresh context every run: no cookie banner state, no notifications, no extensions, no
    // bookmarks bar. Same script + same product = same frames.
    const ctx = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,                  // stills ship at 2x; video frames ask for scale:'css' and get 1080p
      permissions: [],
      locale: 'en-US',
      timezoneId: 'America/Chicago',
      reducedMotion: 'no-preference',
      colorScheme: 'dark'
    });
    await ctx.addInitScript(CURSOR_INIT);    // the pointer must survive every navigation
    const page = await ctx.newPage();
    const frameDir = path.join(outDir, `.frames-${script.id}`);
    fs.rmSync(frameDir, { recursive: true, force: true });
    const cast = stillsOnly ? null : await startCapture(page, frameDir);
    const driver = playwrightDriver({ page, outDir, id: script.id, cueAt: () => (cast ? cast.elapsedMs() : 0) });
    try {
      await guard(() => executeSteps({ script, selectors, driver, stillsOnly }));
    } finally {
      if (cast) await cast.stop();
      await ctx.close();
      await browser.close().catch(() => {});
      if (cast) {
        frameCount = cast.frames.length;
        const raw = path.join(outDir, `${script.id}.mp4`);
        const enc = encodeFrames({ frames: cast.frames, outPath: raw });
        if (enc.ok) videoPath = raw; else result.warnings.push(`encode failed: ${enc.error}`);
      }
      fs.rmSync(frameDir, { recursive: true, force: true });   // frames are an intermediate, not an artifact
    }
  }

  // The guarantee: mismatch OR a thrown step → no video, non-zero exit.
  const final = finalizeRun({ asserts: result.asserts, videoPath, fsLike: fs, hardError });
  if (hardError) result.warnings.push(`run aborted: ${hardError}`);

  // SFX go on last, and only onto a video that passed. A cue mixed onto a failed take would just be
  // a nicer-sounding lie.
  if (final.ok && videoPath && result.cues?.length) {
    const withSfx = videoPath.replace(/\.mp4$/i, '-sfx.mp4');
    const mix = mixCues({ videoPath, cues: result.cues, outPath: withSfx });
    if (mix.ok) {
      fs.rmSync(videoPath, { force: true });
      fs.renameSync(withSfx, videoPath);
      sfxMixed = mix.count;
    } else result.warnings.push(`sfx mix skipped: ${mix.error}`);
  }
  if (!final.ok && videoPath) result.warnings.push(`${hardError ? 'run aborted' : 'assert failed'} — deleted ${path.basename(videoPath)}`);

  const report = {
    ok: final.ok,
    error: hardError,
    id: script.id,
    url: script.url || null,
    scriptPath: resolvedScript,
    dryRun,
    stillsOnly,
    startedAt,
    durationMs: Date.now() - t0,
    asserts: result.asserts,
    captures: result.captures,
    steps: result.steps,
    warnings: result.warnings,
    videoPath: final.ok ? videoPath : null,
    frameCount,
    sfxMixed,
    cues: result.cues || [],
    stillPaths: result.stillPaths
  };

  fs.writeFileSync(path.join(outDir, `${script.id}-report.json`), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(outDir, `${script.id}-report.md`), reportMarkdown(report));
  return report;
}

// ── CLI ─────────────────────────────────────────────────────────────────────────────────────────
const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.script) { console.error('usage: node pods/brand/record.mjs --script <script.json> [--stills-only] [--dry-run]'); process.exit(2); }
  try {
    const r = await record({ scriptPath: args.script, stillsOnly: args.stillsOnly, dryRun: args.dryRun });
    const bar = '─'.repeat(72);
    console.log(`\n${bar}\n${r.ok ? '✅' : '❌'} ${r.id}${r.dryRun ? ' (dry run)' : ''} · ${(r.durationMs / 1000).toFixed(1)}s\n${bar}`);
    if (r.error) console.log(`  ⛔ aborted: ${r.error}`);
    for (const a of r.asserts) console.log(`  ${a.pass ? '✓' : '✗'} ${a.field}: expected ${JSON.stringify(a.expected)}${a.pass ? '' : `  ← actual ${JSON.stringify(a.actual)}`}`);
    for (const [k, v] of Object.entries(r.captures)) console.log(`  ○ capture ${k} = ${JSON.stringify(v)}`);
    for (const w of r.warnings) console.log(`  ! ${w}`);
    if (r.videoPath) console.log(`  🎬 ${r.videoPath}`);
    for (const p of r.stillPaths) console.log(`  🖼  ${p}`);
    console.log(bar);
    process.exit(r.ok ? 0 : 1);
  } catch (e) {
    console.error(`\n❌ ${e instanceof RecorderError ? e.message : (e.stack || e.message)}\n`);
    process.exit(1);
  }
}
