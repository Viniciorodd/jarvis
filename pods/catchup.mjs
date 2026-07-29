// catchup.mjs — HELD NOTICES (Trillion Tier 5: "don't drop what I wasn't there to see"). Anything
// noteworthy that happened while the operator was away is HELD and shown on return as a calm,
// dismissible "While you were away" panel — never fired into the void and lost. Pure filter over the
// control-plane event log (the system of record), eval-pinned; the companion serves it at /api/catchup.
//
// The voice is Trillion's: brief, direct, numbers where they exist — the pods' `rationale` strings are
// already written that way ("Priced X: bid $4,956 (18% over $4,200 — profit $756)"), so we surface them.
import { isGateBoilerplate } from './narrate.mjs';
import { approvalSubject } from './approvals-view.mjs';

// Only these earn a place in the catch-up (quiet by default — noise stays in the activity log):
const SURFACE = new Set([
  'approval.request',     // something is waiting on HIS yes
  'proposal.draft',       // a proposal got drafted
  'proposal.submitted',   // a submission was recorded
  'deal.priced',          // a bid got priced (quote × markup)
  'sub.reply.parsed',     // a sub sent quote / past performance
  'sow.pull',             // scope of work pulled
  'briefs.push',          // top opportunities sent to his phone
  'inbox.triage',         // inbox digest ran
  'money',                // money moved
]);

// ── PURE: pick what's worth showing since he last looked, newest first, capped. Eval-pinned. ────────
export function catchupItems(events, sinceISO, { cap = 10 } = {}) {
  const since = sinceISO ? new Date(sinceISO).getTime() : 0;
  const rows = (events || [])
    .filter((e) => e && e.ts && new Date(e.ts).getTime() > since)
    .filter((e) => e.kind === 'approval.request' || SURFACE.has(e.action) || e.status === 'error')
    .sort((a, b) => new Date(b.ts) - new Date(a.ts))
    .map((e) => ({
      ts: e.ts,
      kind: e.status === 'error' ? 'error' : e.kind === 'approval.request' ? 'needs-you' : 'update',
      who: e.actor || '',
      pod: e.pod || '',
      text: line(e),
    }));
  // "6 things" that were really 3 things said twice is not a catch-up, it is padding. A repeated line carries
  // no new information, so keep the NEWEST occurrence only — and count the rest onto it rather than lying.
  const out = [];
  const byText = new Map();
  for (const r of rows) {
    const key = r.kind + '¦' + r.text;
    const seen = byText.get(key);
    if (seen) { seen.count += 1; continue; }
    const row = { ...r, count: 1 };
    byText.set(key, row);
    out.push(row);
    if (out.length >= cap) break;
  }
  return out;
}

// ── PURE: one brief, direct line per item (the Trillion voice — no corporate filler). Eval-pinned. ──
export function line(e) {
  const r = String((e && e.rationale) || '').trim();
  if (!r) return String((e && e.action) || 'update').replace(/[._]/g, ' ');
  // The gate's own doctrine boilerplate is not news. Shown verbatim it rendered as "Treated as irreversible
  // — gated for your approval (doctrine §9 rule 2)" three times on the operator's Home screen, saying nothing
  // about WHAT is waiting. Same defect as the Telegram repeats and the approval-queue titles.
  if (isGateBoilerplate(r)) return approvalSubject(e || {});
  return r.length > 150 ? r.slice(0, 147) + '…' : r;
}
