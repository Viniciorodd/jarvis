// facts-check.mjs — the LAST-STEP guard on anything drafted in Rodgate's name (doctrine Canonical Facts +
// Lessons Ledger L-005/L-006/L-007). LLM proposes; CODE disposes: a proposal/email is scanned for
// identity/certification claims Rodgate does NOT hold, and a match is a hard flag BEFORE staging. This
// exists because a pod draft once claimed "Pennsylvania-certified SDB" — misrepresentation in a federal
// proposal. Never again, structurally. Pure + eval-pinned; the gov worker runs it after every draft.

// Each rule: a regex OR a test fn, plus what it means. Over-flagging is SAFE here (a human reviews).
const RULES = [
  { re: /8\s*\(\s*a\s*\)/i, rule: 'claims 8(a)', why: 'Rodgate does not hold 8(a)' },
  { re: /hubzone/i, rule: 'claims HUBZone', why: 'not held' },
  { re: /sdvosb|service[-\s]?disabled|veteran[-\s]?owned/i, rule: 'claims SDVOSB / veteran-owned', why: 'not held' },
  { re: /wosb|women[-\s]?owned|edwosb/i, rule: 'claims WOSB / women-owned', why: 'not held' },
  { re: /(pennsylvania|state|\bpa\b)[-\s]?certified/i, rule: 'claims state/PA-certified', why: 'Rodgate is SELF-certified SDB only (L-005)' },
  // A bare "certified <SDB/minority/disadvantaged>" that is NOT "self-certified" (strip self-certified first).
  { test: (t) => /\bcertified\b[^.\n]{0,45}(sdb|small\s+disadvantaged|disadvantaged\s+business|minorit)/i.test(String(t).toLowerCase().replace(/self[-\s]?certified/g, 'selfcert')),
    rule: 'claims "certified" SDB/minority (not self-certified)', why: 'Rodgate is SELF-certified only (L-005)' },
  { re: /(coi|certificate of insurance)[^.\n]{0,25}(on file|attached|enclosed|current|in place)/i, rule: 'claims COI on file', why: 'no GL policy yet — write "COI available upon binding" (L-007)' },
  { re: /prompt(ly)?\s+(payment|pay)|pay(s|ment)?\s+promptly|promptly\s+pay/i, rule: 'promises prompt payment', why: 'Net-30 reality — no payment-term promises to subs (L-006)' },
];

// PURE: scan a draft. Returns { ok, violations:[{ match, rule, why }] }. ok=true means clean. Eval-pinned.
export function factsCheck(text = '') {
  const t = String(text || '');
  const violations = [];
  for (const r of RULES) {
    if (r.re) { const m = t.match(r.re); if (m) violations.push({ match: m[0].trim().slice(0, 60), rule: r.rule, why: r.why }); }
    else if (r.test && r.test(t)) violations.push({ match: '(certified claim)', rule: r.rule, why: r.why });
  }
  return { ok: violations.length === 0, violations };
}

// One-line human summary for a gate / notification.
export function factsCheckSummary(res) {
  if (!res || res.ok) return '✓ facts-check clean';
  return `⚠ FACTS-CHECK FAILED (${res.violations.length}): ` + res.violations.map((v) => v.rule).join('; ');
}
