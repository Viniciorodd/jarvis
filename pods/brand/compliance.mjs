// compliance.mjs — the never-publish guard for anything going out as Vinicio.
//
// Rogoff's system has nothing like this. He autopublishes to LinkedIn on a 9am cron and, when Claude
// offered him an approval step, he declined it. That is a reasonable call for someone with no legal
// exposure. It is not the call here.
//
// The operative constraint, from the v2 voice profile: the $0-income filings are live, and his own
// note says "these posts can be used against me." So a published claim is not a marketing decision,
// it is a discoverable document. This module is the reason a draft cannot reach a queue without
// clearing a check, and it fails closed on anything ambiguous.
//
// The rule is deliberately blunt: would a hostile reader be able to quote this as evidence of income
// or assets? If a pattern could be read that way, it blocks. A false positive costs one rewrite. A
// false negative costs a deposition.
//
// Pairs with pods/redos/policy.mjs, which guards REDOS product claims. This one guards HIM.

/** Every published claim gets logged. An append-only record is worth more than the growth engine. */
export const CLAIM_LOG = 'claims-log.jsonl';

// ── Money that describes him ────────────────────────────────────────────────
// A dollar figure inside deal arithmetic is fine and is most of what he writes.
// A dollar figure attached to a first-person possessive is not.
const INCOME = [
  [/\bI\s+(made|earn|earned|make|gross|grossed|net|netted|pulled|banked|cleared)\b/i, 'first-person income claim'],
  [/\b(my|our)\s+(revenue|income|profit|earnings|salary|take-home|net worth|portfolio|assets?|equity)\b/i, 'describes his own money or assets'],
  [/\b(we|I)\s+(did|hit|crossed|passed)\s+\$?\d/i, 'revenue milestone claim'],
  [/\$[\d,]+\s*(\/|per\s+)?\s*(mo|month|yr|year|k\/mo)\b.*\b(I|we|my|our)\b/i, 'recurring figure tied to himself'],
  [/\b(I|we)\s+(own|hold|control|manage)\s+\d+\s*(door|unit|propert|home|house|rental)/i, 'asset count claim'],
  [/\b\d+\s*(doors?|units?|properties|rentals)\s+(I|we)\s/i, 'asset count claim'],
  [/\b(六|my)\s*portfolio\s+(does|makes|generates|returns)/i, 'portfolio performance claim'],
  // ⚠ The k/m/b suffix used to defeat this. "from 0 to 10k in 90 days" passed, because \b sits
  // between the digits and the k, so the second [\d,]+ never reached a word boundary. Found by
  // running all 897 archived posts through the guard.
  [/\bfrom\s+\$?[\d,]+(?:\.\d+)?\s*[kmb]?\+?\s+to\s+\$?[\d,]+(?:\.\d+)?\s*[kmb]?\b/i, 'transformation figure, the banned hook form'],
];

// ── Traction and audience ───────────────────────────────────────────────────
const TRACTION = [
  [/\b\d[\d,]*\s*\+?\s*(followers?|subscribers?|impressions?|views?)\b/i, 'publishes a platform metric'],
  [/\b\d[\d,]*\s*\+?\s*(customers?|users?|clients?|members?|students?|investors?|readers?|agents?)\b/i, 'customer or client count'],
  [/\b(used|trusted|read|joined) by\s+[\d,]+/i, 'usage or audience claim'],
  [/\b(grew|went|scaled)\s+(from|to)\s+[\d,]+\s*(followers?|subscribers?|users?|customers?)/i, 'growth claim'],
  [/\b\d[\d,]*\s*\+?\s*(reviews?|ratings?|testimonials?|five[- ]stars?)\b/i, 'review count'],
  [/\b(sold out|fully booked|waitlist of|joined by)\s*\d/i, 'demand claim'],
  // ── PERCENTAGE GROWTH, added 2026-08-06 ──────────────────────────────────
  // The rules above all key on a COUNT ("10,000 followers"). His actual top-performing post was
  // "I increased my Twitter engagement by 116,308% in 28 days" — a first-person traction claim with
  // no count in it, which sailed straight through. So did "I grew my account 400% last month" and
  // "my engagement is up 250%".
  //
  // Every one of these is tied to FIRST PERSON on purpose. Deal arithmetic is most of what he writes
  // and a bare percentage is the language of it — "cap rate went from 6% to 7%" is analysis, not a
  // claim about him, and a guard that blocks it would be turned off within a week.
  [/\b(I|we)\s+(increased|grew|scaled|boosted|doubled|tripled|quadrupled)\b/i, 'first-person growth claim'],
  [/\b(my|our)\s+(?:\w+\s+){0,3}?(engagement|reach|following|followers|audience|traffic|account|list|impressions)\b[^.!?]{0,40}?[\d,]+(?:\.\d+)?\s*%/i, 'growth percentage on his own account'],
  [/\b(engagement|reach|following|audience|traffic|impressions)\b[^.!?]{0,30}?\b(up|by|increased|grew)\b[^.!?]{0,15}?[\d,]+(?:\.\d+)?\s*%/i, 'platform growth percentage'],
];

// ── Guru register. Not illegal, but off-voice and it invites the wrong reader.
// Rogoff's own dashboard found results-flexing attracts peers and repels buyers.
const GURU = [
  [/\b(6|7|8|six|seven|eight)[- ]figure/i, 'figure-tier framing'],
  [/\b(financial freedom|passive income|quit my job|fire(d)? my boss|escape the rat race)\b/i, 'guru framing'],
  [/\b(10x|hustle|grind|empire|crush(ing)? it|game[- ]?changer|unlock)\b/i, 'vocabulary he does not use'],
  [/\bhow I (built|scaled|grew) (a|my)\b/i, 'results-led opener, the banned hook form'],
];

// ── Privacy. From his own rule: protecting the tenants, protecting the assets.
const PRIVACY = [
  [/\b\d{2,6}\s+(?:[A-Z][a-z]+\s+){1,3}(St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Ln|Lane|Blvd|Ct|Court|Way|Pl|Ter|Cir)\b/, 'street address'],
  [/\b(my|our)\s+tenant\b/i, 'identifiable tenant reference'],
  [/\bHAP\s+(payment|amount|check)\s+(of|is|was)\s*\$/i, 'housing assistance amount'],
];

const FICTIONAL = /springfield,?\s*(il|illinois)/i;

const GROUPS = [
  ['income', INCOME, 'BLOCK'],
  ['traction', TRACTION, 'BLOCK'],
  ['privacy', PRIVACY, 'BLOCK'],
  ['guru', GURU, 'WARN'],
];

/**
 * PURE. Returns { ok, blocks, warnings, checked }.
 * `ok` is true only when there are zero BLOCK-level hits. Warnings do not stop a post; they are
 * surfaced so he can decide, because the guru list is taste and the others are exposure.
 */
export function complianceCheck(text = '') {
  const body = String(text);
  const blocks = [];
  const warnings = [];

  for (const [group, patterns, level] of GROUPS) {
    for (const [re, why] of patterns) {
      const m = body.match(re);
      if (!m) continue;
      // A street address inside the fictional example set is allowed.
      if (group === 'privacy' && FICTIONAL.test(body.slice(Math.max(0, m.index - 120), m.index + 200))) continue;
      const hit = { group, why, matched: m[0].slice(0, 80) };
      (level === 'BLOCK' ? blocks : warnings).push(hit);
    }
  }

  if (/\p{Extended_Pictographic}/u.test(body)) {
    // His personal account carries emoji in about 10% of posts and that is his call.
    // Anything speaking for REDOS does not. Caller sets `redos` to escalate.
    warnings.push({ group: 'tone', why: 'contains emoji; fine on the personal account, never for REDOS', matched: '' });
  }

  return {
    ok: blocks.length === 0,
    blocks,
    warnings,
    checked: GROUPS.reduce((n, g) => n + g[1].length, 0) + 1,
  };
}

/** Stricter variant for anything published as REDOS rather than as him. */
export function complianceCheckRedos(text = '') {
  const r = complianceCheck(text);
  const emoji = /\p{Extended_Pictographic}/u.test(String(text));
  return emoji
    ? { ...r, ok: false, blocks: [...r.blocks, { group: 'tone', why: 'emoji is banned in REDOS copy; the build enforces it', matched: '' }] }
    : r;
}

/** One line for the approval card. */
export function complianceLine(r) {
  if (r.ok && !r.warnings.length) return 'CLEAR';
  const b = r.blocks.map((x) => `${x.group}: ${x.why}`);
  const w = r.warnings.map((x) => `${x.group}: ${x.why}`);
  return `${r.ok ? 'CLEAR with notes' : 'BLOCKED'}${b.length ? ` | ${b.join(' | ')}` : ''}${w.length ? ` | note: ${w.join(' | ')}` : ''}`;
}
