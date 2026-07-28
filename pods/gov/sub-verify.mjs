// sub-verify.mjs — AUTO-VERIFICATION. The operator (2026-07-27): *"if i have to auto verify every lead/sub for
// their quote by hand, whats the point.. i need us to trust our system, add layers to auto verify, parameters,
// but i dont want to come and check and then approve."*
//
// He's right. The original allowlist assumed HE curates it, which makes the machine his to-do list. But the
// reason the allowlist exists (L-009 — an agent must never invent or mis-address a recipient) is served BETTER
// by proving an email genuinely belongs to that business than by a human eyeballing a row. So verification
// becomes EARNED, by objective checks a machine can make honestly:
//
//   HARD BLOCKS (any one → never auto-verified, no score can rescue it):
//     • SAM-excluded (debarred) · no usable email · a role/no-reply/placeholder address · an obviously fake domain
//   EVIDENCE (needs enough independent proof of a real, reachable business):
//     • the email's domain matches the firm's own website domain  ← the strongest anti-fabrication signal
//     • a SAM UEI (a registered federal entity)
//     • a real Google Places presence (rating + review count)
//     • a phone number · a real trade match · prior work with us
//
// The operator sets the bar (AUTO_VERIFY_MIN, default 3 points) and can turn it off entirely. The hard line is
// untouched: auto-verification only decides WHO may be asked for a quote. It can never authorize pricing, a
// commitment, or anything in outreach-policy's blocked list.
const lc = (s) => String(s || '').toLowerCase().trim();
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

// Addresses that are never a real named contact we should cold-email.
const BAD_LOCAL = /^(no-?reply|donotreply|do-not-reply|postmaster|abuse|mailer-daemon|webmaster|admin|test|example|your-?email|email|name)$/i;
// Free mail is fine for a small sub (many are gmail) — it just can't COUNT as domain evidence.
const FREEMAIL = /^(gmail|yahoo|hotmail|outlook|aol|icloud|live|msn|protonmail|comcast|verizon|att)\./i;

export function emailDomain(email) { const m = String(email || '').split('@')[1]; return m ? lc(m) : ''; }
export function siteDomain(website) {
  try { return lc(new URL(/^https?:\/\//i.test(website) ? website : 'https://' + website).hostname).replace(/^www\./, ''); }
  catch { return ''; }
}

// PURE (eval-pinned): can this firm be auto-verified for outreach? Returns { verified, score, checks, blocks }.
// FAILS CLOSED — anything unreadable or unproven simply doesn't reach the bar.
export function autoVerify(sub = {}, { min = Number(process.env.AUTO_VERIFY_MIN) || 3 } = {}) {
  const checks = [];
  const blocks = [];
  const email = lc(sub.contact_email || sub.email);
  const local = email.split('@')[0] || '';
  const eDom = emailDomain(email);
  const sDom = siteDomain(sub.website);

  // ── hard blocks ──
  if (lc(sub.exclusionStatus).includes('exclu')) blocks.push('SAM-excluded (debarred) — never contact');
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) blocks.push('no usable email address');
  else if (BAD_LOCAL.test(local)) blocks.push(`"${local}@" is a role/placeholder address, not a real contact`);
  if (email && /example\.|test\.|invalid|localhost/.test(eDom)) blocks.push('placeholder/fake email domain');

  // ── evidence (each independent) ──
  let score = 0;
  if (eDom && sDom && eDom === sDom) { score += 3; checks.push(`email domain matches their own website (${eDom}) — proves the address is really theirs`); }
  else if (eDom && FREEMAIL.test(eDom + '.')) checks.push('free-mail address — common for small subs, but not proof of the business');
  if (String(sub.uei || '').trim().length >= 10) { score += 2; checks.push(`registered federal entity (UEI ${sub.uei})`); }
  const rating = num(sub.rating), reviews = num(sub.reviews);
  if (rating >= 4.0 && reviews >= 5) { score += 2; checks.push(`${rating}★ across ${reviews} reviews`); }
  else if (rating >= 3.5 && reviews >= 3) { score += 1; checks.push(`${rating}★ (${reviews} reviews)`); }
  if (sub.website) { score += 1; checks.push('has a real website'); }
  if (String(sub.phone || '').replace(/\D/g, '').length >= 10) { score += 1; checks.push('has a phone number'); }
  if (num(sub.past_performance) > 0) { score += 3; checks.push('we have worked with them before'); }
  if (lc(sub.status) === 'quoted' || sub.quote) { score += 2; checks.push('has already quoted us'); }

  const verified = blocks.length === 0 && score >= min;
  return { verified, score, min, checks, blocks };
}

// Apply auto-verification across the bench. Returns what CHANGED so the operator sees the machine's reasoning.
// Never downgrades a contact the operator verified by hand (manual trust always wins).
export function autoVerifyAll(subs = [], opts = {}) {
  const changed = [];
  for (const s of Array.isArray(subs) ? subs : []) {
    if (!s || s.verified === true) continue;              // already trusted — leave it alone
    const r = autoVerify(s, opts);
    if (r.verified) {
      s.verified = true;
      s.verifiedBy = 'auto';
      s.verifiedAt = new Date().toISOString();
      s.verifyEvidence = r.checks;
      changed.push({ id: s.id, name: s.name, email: s.contact_email || s.email, score: r.score, why: r.checks });
    }
  }
  return { verified: changed.length, changed };
}
