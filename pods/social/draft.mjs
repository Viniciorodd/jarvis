// draft.mjs — Marta. Local-only rewriting, structurally incapable of spending his Claude allowance.
//
// Master PRD §7 phase 2: "local drafting via a new agent (no ANTHROPIC_API_KEY in vault)". The point is
// that $0 is not a promise made in a prompt, it is a property of the wiring: SOCIAL-01's vault ACL does
// not contain ANTHROPIC_API_KEY, so `haveClaude('SOCIAL-01')` throws inside the router and the provider
// chain comes back without claude in it. `assertFree` then refuses to run if it ever appears anyway.
//
// ── WHAT MARTA IS ALLOWED TO DO ─────────────────────────────────────────────────────────────────────
// Shorten a variant that busts a platform limit. That is all. She does not originate posts — he wrote
// 15 of those by hand and they are better than anything a 7B local model will produce in his voice.
//
// ── 🚨 THE INVARIANT THAT MAKES A LOCAL REWRITE SAFE ────────────────────────────────────────────────
// A model asked to shorten a post about money will, sooner or later, change a number. It is the single
// most likely way this module hurts him: "2,650 on the listing, 4,100 after" becomes "2,600 and 4,000"
// because those are rounder, and now a figure he never wrote is published under his name.
//
// So every rewrite is checked: the set of figures in the output must be a SUBSET of the figures in the
// input. Dropping a number while shortening is fine. Inventing or altering one is a hard reject, and
// the rewrite is discarded rather than repaired — a model that just did that does not get a second
// pass at the same text.
//
// TRUNCATION IS NEVER A FALLBACK. If Marta cannot fit it, the variant is dropped and the post goes out
// on the platforms where it fits. A post cut off mid-sentence is a post he did not write.

import { llm, pickChain } from '../model-router.mjs';
import { checkPost, LIMITS } from './gate.mjs';
import { figuresIn } from './library.mjs';

export const AGENT = 'SOCIAL-01';

/**
 * PURE: refuse a provider chain that could bill him.
 *
 * Called before every request. The ACL is the real defence; this is the tripwire that fires if someone
 * later adds ANTHROPIC_API_KEY to SOCIAL-01 without reading why it was left out.
 */
export function assertFree(chain = []) {
  if (chain.includes('claude')) {
    throw new Error('social/draft: the provider chain contains claude — Marta drafts for $0 by design. '
      + 'Check the SOCIAL-01 entry in control-plane/vault.mjs ACL.');
  }
  return chain;
}

/** PURE: the chain Marta would use right now, given what keys exist. */
export function freeChain({ have = { claude: false, openrouter: true, local: true } } = {}) {
  return assertFree(pickChain({ tier: 'draft', have }));
}

/**
 * PURE: did a rewrite invent or alter a number?
 *
 * Returns the offending figures. Empty means clean. Note the direction: output ⊆ input. Losing a figure
 * is allowed (that is what shortening does), gaining one never is.
 */
export function inventedFigures(original = '', rewritten = '') {
  const before = new Set(figuresIn(original));
  return figuresIn(rewritten).filter((f) => !before.has(f));
}

const SYSTEM = [
  'You shorten social posts. You do not write them.',
  '',
  'RULES, in order of importance:',
  '1. NEVER change, round, or add a number. Not one digit. If a sentence with a number will not fit, delete the whole sentence.',
  '2. Keep the author\'s words. Cut sentences; do not rephrase the ones you keep.',
  '3. No em dashes. No emoji. No hashtags. No exclamation marks.',
  '4. Never add a claim, a promise, a result, or a call to action that is not already in the text.',
  '5. Keep the last line. It is the point of the post.',
  '',
  'Reply with the shortened post and nothing else. No preamble, no quotes around it, no explanation.',
].join('\n');

/**
 * Shorten one variant to fit its platform. Returns { ok, text, why, attempts }.
 *
 * Never throws on a model failure — a scheduled publish job must degrade to "this platform is skipped",
 * not to a stack trace at 09:00.
 */
export async function adapt(text, platform, { attempts = 2, agent = AGENT } = {}) {
  const cfg = LIMITS[platform];
  if (!cfg) return { ok: false, text: '', why: `unknown platform "${platform}"`, attempts: 0 };

  const first = checkPost(platform, { text, community: 'x', linkInReply: 'n/a' });
  if (first.room >= 0) return { ok: true, text, why: 'already fits', attempts: 0 };

  let tried = 0;
  for (let i = 0; i < attempts; i++) {
    tried++;
    let out;
    try {
      const r = await llm({
        agent,
        tier: 'draft',
        maxTokens: 700,
        system: SYSTEM,
        user: `Shorten this to ${cfg.max} characters or fewer for ${cfg.label}. It is currently ${first.length}.\n\n${text}`,
      });
      out = String((r && (r.text ?? r.content ?? r)) || '').trim();
    } catch (e) {
      return { ok: false, text: '', why: 'local model unavailable: ' + (e && e.message ? e.message : e), attempts: tried };
    }

    // Models like to wrap the answer in a fence or quotes however firmly you ask them not to.
    out = out.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '').trim();
    if (out.length > 1 && /^["'].*["']$/s.test(out)) out = out.slice(1, -1).trim();

    if (!out) continue;

    // 🚨 The invariant. A model that just invented a number does not get another pass at this text.
    const bad = inventedFigures(text, out);
    if (bad.length) {
      return { ok: false, text: '', why: `rewrite introduced figures not in the original: ${bad.join(', ')}`, attempts: tried };
    }

    const r = checkPost(platform, { text: out, community: 'x', linkInReply: 'n/a' });
    if (r.ok) return { ok: true, text: out, why: 'shortened locally', attempts: tried };
    // Still failing: only worth retrying if it was length. A compliance block will not fix itself.
    if (r.fails.some((f) => /compliance/.test(f))) {
      return { ok: false, text: '', why: 'rewrite tripped compliance: ' + r.fails.join('; '), attempts: tried };
    }
  }
  return { ok: false, text: '', why: `could not fit ${cfg.label} in ${tried} attempt(s) — dropping this platform rather than truncating`, attempts: tried };
}

/**
 * Fix every over-limit variant in a `variantsFor()` result. Returns the same shape with the ones that
 * could be fixed folded back in, plus a `dropped` list naming what did not make it and why.
 */
export async function adaptAll(built = {}, { agent = AGENT } = {}) {
  const posts = { ...(built.posts || {}) };
  const dropped = [], fixed = [];

  for (const item of (built.overLimit || [])) {
    const source = item.text || '';
    if (!source) { dropped.push({ platform: item.platform, why: 'no source text to shorten' }); continue; }
    const r = await adapt(source, item.platform, { agent });
    if (r.ok) {
      const p = { text: r.text };
      if (item.platform === 'threads') p.community = built.community || 'Real estate investing';
      posts[item.platform] = p;
      fixed.push({ platform: item.platform, attempts: r.attempts });
    } else {
      dropped.push({ platform: item.platform, why: r.why });
    }
  }
  return { ...built, posts, fixed, dropped };
}
