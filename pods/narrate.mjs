// narrate.mjs — turn a control-plane event into a short, AGENT-SIGNED line for the operator's feeds
// (Telegram DM + Slack #floor). The whole point: Vinicio FEELS the team working — "🔭 Scanned SAM — 8
// opportunities — Gideon (Gov Scout)". Milestones only (scans/drafts/sends/finds/wins), never the noise.
//
// ── THE TRUTH CONTRACT (trust-critical — the "Hector lied" fix) ────────────────────────────────────
// The vault's discrepancy log caught Telegram announcing "🤝 Reached out to a subcontractor — Hector
// (Procurement Lead)" when NO email ever left the building: the event was sub.outreach.DRAFT (a file on
// disk, gated behind approval, GOV_AUTO_SEND off) but the old regex matched "outreach" and claimed the
// deed was done. One false line and the operator can't trust ANY line. So narration now keys on what
// PROVABLY happened, never on an action-name substring:
//   1. kind:'approval.request' (a gate) → "✏️ … waiting on YOUR approval (nothing sent)". Always.
//   2. A dry-run (payload.dryRun, status:'dry-run', or the executor's email.preview) → "🧪 Dry-run: …
//      NOT sent (auto-send is off)". Prepared ≠ sent.
//   3. "Sent" / "Reached out" / "Answered" are only uttered when the event carries HARD send evidence —
//      hasSendEvidence(): an SMTP messageId, accepted recipients, payload.sent === true, or an explicit
//      status:'sent'. pods/gov/sender.mjs supplies exactly these fields (its side of the contract).
//   4. When in doubt → the weaker claim ("drafted", "prepared", "UNCONFIRMED") or silence (null).
// Pure + eval-pinned (evals/narrate.eval.mjs + evals/narrate-truth.eval.mjs); shared by the Telegram and
// Slack bridges so there's ONE source of the team's voice.

import { findPerson } from './org.mjs';

// PURE: who did it → "Nickname (Title)". Eval-pinned.
export function personaFor(actor) {
  const p = findPerson(actor);
  if (p) return `${p.nickname} (${p.title})`;
  return actor === 'operator' ? 'You' : 'Jarvis';
}

// PURE: does this event carry HARD evidence that a real send happened? This is the ONLY key that
// unlocks completed-act wording ("Sent", "Reached out", "Answered"). Eval-pinned.
export function hasSendEvidence(ev = {}) {
  const p = ev.payload || {};
  if (typeof p.messageId === 'string' && p.messageId) return true;          // SMTP receipt
  if (Array.isArray(p.accepted) && p.accepted.length > 0) return true;      // SMTP accepted rcpt(s)
  if (p.sent === true) return true;                                         // executor's explicit flag
  if (String(ev.status || '').toLowerCase() === 'sent') return true;        // explicit status
  if (String(p.status || '').toLowerCase() === 'sent') return true;
  return false;
}

// PURE: was this a dry-run (send attempted with auto-send off — prepared, previewed, NOT sent)? Eval-pinned.
export function isDryRun(ev = {}) {
  const p = ev.payload || {};
  if (p.dryRun === true) return true;
  const st = String(ev.status || '').toLowerCase();
  const pst = String(p.status || '').toLowerCase();
  if (st === 'dry-run' || st === 'dryrun' || pst === 'dry-run' || pst === 'dryrun') return true;
  return String(ev.action || '').toLowerCase() === 'email.preview';         // the executor's dry-run event
}

// tiny helper: a one-line subject from title/rationale, capped so feeds stay glanceable
const short = (s, n = 90) => {
  const x = String(s || '').replace(/\s+/g, ' ').trim();
  return x.length > n ? x.slice(0, n - 1).trimEnd() + '…' : x;
};

// PURE: event → a one-line TRUTHFUL narration, or null to skip (scores, scan-starts, spend checks,
// traces). Eval-pinned. Order matters: gate and dry-run checks run BEFORE any action-name matching so
// an intended/gated/previewed act can never borrow completed-act wording.
export function narrationFor(ev = {}) {
  if (ev.kind === 'trace') return null;                                     // traces are never milestones
  const a = String(ev.action || '').toLowerCase();
  const p = ev.payload || {};
  const t = p.title ? ` — ${p.title}` : '';
  const what = short(p.title || ev.rationale || '');

  // Rule 1 — a GATE narrates the wait, never the act.
  if (ev.kind === 'approval.request') {
    return `✏️ Drafted${what ? ': ' + what : ' an action'} — waiting on YOUR approval (nothing sent)`;
  }
  // Rule 2 — a dry-run PREPARED something; auto-send is off, nothing left the building.
  if (isDryRun(ev)) {
    const dest = p.to ? `email to ${p.to}` : (what || 'the action');
    return `🧪 Dry-run: ${dest} prepared — NOT sent (auto-send is off)`;
  }
  if (a === 'email.failed') return `⚠️ An email send FAILED${p.to ? ` → ${p.to}` : ''} — nothing went out`;

  if (a === 'scan.done') return `🔭 Scanned SAM — ${p.count != null ? p.count : 'new'} opportunities`;
  if (a === 'sow.pull') return `📄 Pulled the scope of work${t}`;
  if (a === 'proposal.draft') return `📝 Drafted a proposal${t}`;
  if (a === 'proposal.submitted') return `📤 Submitted a proposal${t}`;

  // Rule 3 — completed-act wording only with evidence; otherwise say what truly happened (Rule 4).
  if (/sources?[-_. ]?sought/.test(a)) {
    if (hasSendEvidence(ev)) return `📋 Answered a sources-sought${t}`;
    return `📋 Drafted a sources-sought response${t} — gated for your sign-off (nothing sent)`;
  }
  if (a === 'email.sent') {
    if (hasSendEvidence(ev)) return `✉️ Sent an email${p.to ? ` → ${p.to}` : ''}`;
    return `✉️ An email was queued${p.to ? ` → ${p.to}` : ''} — no delivery receipt attached (UNCONFIRMED)`;
  }
  if (/outreach|reach[-_. ]?out/.test(a)) {
    if (hasSendEvidence(ev)) return `🤝 Reached out to a subcontractor${t}`;
    if (/draft/.test(a)) return `🤝 Drafted sub outreach${t} — waiting on YOUR approval (nothing sent)`;
    return `🤝 Sub outreach prepared${t} — NOT confirmed sent`;
  }

  if (a === 'facts.violation') return `⚠️ A draft failed the facts-check${t} — needs a fix before it goes out`;
  if (a === 'market.journal') return `📊 Journaled the watchlist${Array.isArray(p.notable) && p.notable.length ? ` — ${p.notable.length} notable move(s)` : ''}`;
  if (a === 'disposition') return /won/i.test(ev.rationale || '') ? `🏆 A bid WON${t}` : null;
  if (a === 'invoice.created') return '💵 Created a payment link';
  return null;
}

// Convenience: full signed line, or null. `— Nickname (Title)` on its own line.
export function narrationLine(ev) {
  const text = narrationFor(ev);
  return text ? `${text}\n— ${personaFor(ev.actor)}` : null;
}

// ── BATCHED NARRATION (the anti-spam rollup) ────────────────────────────────────────────────────────
// The operator, verbatim: "instead of spamming me with scope-of-work pull, scope-of-work pull... just
// brief: X pulled Y amount of Z." So one poll cycle's events collapse into ONE Telegram message:
// same actor + same action FAMILY → one grouped line ("Gideon (Gov Scout): 📄 Pulled the scope of work
// for 4 opportunities — A, B, C +1 more"); singletons keep their normal truthful narration line.
// Every line still flows through narrationFor, so the truth contract above survives the rollup —
// a grouped batch of drafts can never say "Reached out". Pure + eval-pinned (evals/narrate-rollup.eval.mjs).

// PURE: which family an event groups under. Gates and dry-runs group by TRUTH CLASS (not action name)
// so a collapsed line can carry one honest claim for the whole group; everything else by its action.
export function familyFor(ev = {}) {
  if (ev.kind === 'approval.request') return 'gate';
  if (isDryRun(ev)) return 'dryrun';
  return String(ev.action || '').toLowerCase();
}

// best-effort title for the grouped listing: payload.title, else the sow.pull rationale pattern the
// gov worker emits ("SOW pulled for <title> (N attachment(s))") — real sow.pull events carry no title.
const titleOf = (ev = {}) => {
  const p = ev.payload || {};
  if (p.title) return short(p.title, 60);
  const m = String(ev.rationale || '').match(/^SOW pulled for (.+) \(\d+ attachment/);
  return m ? short(m[1], 60) : '';
};

// PURE: "A, B, C +K more" — up to `max` distinct titles, then the honest remainder count.
export function titleList(evs = [], max = 3) {
  const seen = [];
  for (const ev of evs) { const t = titleOf(ev); if (t && !seen.includes(t)) seen.push(t); }
  const shown = seen.slice(0, max);
  const more = evs.length - shown.length;
  return shown.length ? shown.join(', ') + (more > 0 ? ` +${more} more` : '') : '';
}

// PURE: one collapsed line for N same-family events (persona prefix added by the caller). Named
// phrasings for the frequent flyers; the generic path re-narrates a TITLE-STRIPPED representative
// (evidence/dry-run fields kept intact) so the truth contract still picks the verb, then appends ×N.
function collapsedLine(family, evs) {
  const n = evs.length;
  const list = titleList(evs);
  const tail = list ? ` — ${list}` : '';
  if (family === 'gate') return `✏️ Drafted ${n} actions${tail} — each waiting on YOUR approval (nothing sent)`;
  if (family === 'dryrun') return `🧪 Dry-run ×${n}: prepared${tail} — NOT sent (auto-send is off)`;
  if (family === 'sow.pull') return `📄 Pulled the scope of work for ${n} opportunities${tail}`;
  if (family === 'proposal.draft') return `📝 Drafted ${n} proposals${tail}`;
  if (family === 'scan.done') {
    const total = evs.reduce((s, ev) => s + (Number((ev.payload || {}).count) || 0), 0);
    return `🔭 Scanned SAM ×${n}${total ? ` — ${total} opportunities` : ''}`;
  }
  const rep = { ...evs[0], rationale: '', payload: { ...(evs[0].payload || {}), title: '' } };
  const base = narrationFor(rep) || narrationFor(evs[0]) || '';
  return `${base} ×${n}${tail}`;
}

// PURE: one poll cycle's NEW events → ONE message string (or null if nothing narratable).
//   • 1 narratable event  → the classic single narration + signature (no header)
//   • 1 group only        → that one grouped line (the line itself carries the count)
//   • 2+ lines            → "🤖 Team update — N actions" header + bulleted lines
export function rollupNarrations(events = []) {
  const narratable = (Array.isArray(events) ? events : []).filter((ev) => narrationFor(ev) != null);
  if (!narratable.length) return null;
  if (narratable.length === 1) return narrationLine(narratable[0]);
  const groups = new Map(); // key = actor|family, first-seen order preserved
  for (const ev of narratable) {
    const key = `${ev.actor || ''}|${familyFor(ev)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(ev);
  }
  const lines = [];
  for (const evs of groups.values()) {
    const persona = personaFor(evs[0].actor);
    if (evs.length === 1) lines.push(`${narrationFor(evs[0])} — ${persona}`);
    else lines.push(`${persona}: ${collapsedLine(familyFor(evs[0]), evs)}`);
  }
  if (lines.length === 1) return lines[0];
  return [`🤖 Team update — ${narratable.length} actions`, ...lines.map((l) => '• ' + l)].join('\n');
}
