// pending-intent.mjs — the ONE place that recognizes "show me what's already waiting" and renders it.
//
// WHY THIS IS SHARED (2026-07-18, the deeper fix): a trust bug had two code paths disagree — the daily
// digest truthfully said "Hector drafted 2 sub outreach — waiting on approval" (20 real pending gates in the
// control-plane store), but "pull me the 2 sub outreach" was RE-CLASSIFIED as a new task and ROUTED to
// Hector, so the system contradicted itself. The Telegram bridge got a first fix; this module is the deeper
// one: BOTH the bridge AND the Chief-of-Staff router import `wantsPending` from here, and the router checks it
// BEFORE classifying — so no path (Telegram, cockpit, scheduler) can route-a-create when the operator asked to
// RETRIEVE. Single source of truth for the intent AND for the store it reads (control-plane pendingApprovals).
//
// Pure + dependency-free + eval-pinned. No IO here — callers pass the pending list in.

// PURE: does this message ask to SEE what's waiting (drafts / outreach / pending approvals)? Deliberately does
// NOT match a CREATE ("draft a proposal", "write it fresh") — routing a retrieve as a create is the bug.
export function wantsPending(text) {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return false;
  if (/^\/(pending|drafts?|waiting|approvals?|outreach)\b/.test(t)) return true;
  // A CREATE intent → let it go to the brain, UNLESS it also clearly asks to SEE the existing one.
  if (/\b(draft|write|create|compose|make|generate|prepare|new)\b/.test(t)
      && !/\b(show|pull|read|see|list|pending|waiting|existing|already)\b/.test(t)) return false;
  const verb = /\b(pull|show|read|see|list|give|send|open|fetch|where|which|what)\b/.test(t);
  const noun = /\b(outreach|drafts?|pending|approvals?|waiting|gates?|to\s+(approve|sign|decide))\b/.test(t);
  if (verb && noun) return true;
  if (/\b(the|those|these|my|any)\s+(\d+\s+)?(sub\s+)?(outreach|drafts?|pending|approvals?)\b/.test(t)) return true;
  return false;
}

// Is this pending gate a gov send/outreach (the "drafts" people usually mean)? Used only for ordering.
function isSendGate(a) {
  return !!a && a.pod === 'gov' && ['send', 'email'].includes(String(a.action || '').toLowerCase());
}

// PURE: a plain-English reply that affirms these ALREADY EXIST (the anti-contradiction) and lists them.
// The reply is the same whether the router or a chat surface asks; the Telegram bridge additionally re-sends
// each with tap-buttons (that needs IO, so it stays in the bridge). `list` = control-plane pendingApprovals().
export function describePending(list, { max = 8 } = {}) {
  const items = Array.isArray(list) ? list : [];
  if (!items.length) return '✓ Nothing is waiting on you right now — no pending drafts or approvals.';
  const sorted = items.slice().sort((a, b) => (isSendGate(b) ? 1 : 0) - (isSendGate(a) ? 1 : 0) || String(b.ts || '').localeCompare(String(a.ts || '')));
  const lines = sorted.slice(0, max).map((a, i) => {
    const p = a.payload || {};
    const title = p.title || a.rationale || a.action || 'Needs approval';
    const trade = p.trade ? ` (${p.trade})` : '';
    return `${i + 1}. ${String(title).replace(/\s+/g, ' ').trim().slice(0, 120)}${trade}`;
  });
  const more = items.length > max ? `\n…and ${items.length - max} more.` : '';
  return `You have ${items.length} waiting on you — these already exist, nothing was lost:\n\n`
    + `${lines.join('\n')}${more}\n\n`
    + `Approve or skip them in the app (Home → what needs you, or the Gov board), or say “show my pending” in Telegram to get them with tap-buttons.`;
}
