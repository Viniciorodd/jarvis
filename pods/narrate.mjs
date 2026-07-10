// narrate.mjs — turn a control-plane event into a short, AGENT-SIGNED line for the operator's feeds
// (Telegram DM + Slack #floor). The whole point: Vinicio FEELS the team working — "🔭 Scanned SAM — 8
// opportunities — Gideon (Gov Scout)". Milestones only (scans/drafts/sends/finds/wins), never the noise.
// Pure + eval-pinned; shared by the Telegram and Slack bridges so there's ONE source of the team's voice.

import { findPerson } from './org.mjs';

// PURE: who did it → "Nickname (Title)". Eval-pinned.
export function personaFor(actor) {
  const p = findPerson(actor);
  if (p) return `${p.nickname} (${p.title})`;
  return actor === 'operator' ? 'You' : 'Jarvis';
}

// PURE: event → a one-line narration, or null to skip (scores, scan-starts, spend checks, traces). Eval-pinned.
export function narrationFor(ev = {}) {
  const a = String(ev.action || '').toLowerCase();
  const p = ev.payload || {};
  const t = p.title ? ` — ${p.title}` : '';
  if (a === 'scan.done') return `🔭 Scanned SAM — ${p.count != null ? p.count : 'new'} opportunities`;
  if (a === 'sow.pull') return `📄 Pulled the scope of work${t}`;
  if (a === 'proposal.draft') return `📝 Drafted a proposal${t}`;
  if (a === 'proposal.submitted') return `📤 Submitted a proposal${t}`;
  if (/sources?[-_. ]?sought/.test(a)) return `📋 Answered a sources-sought${t}`;
  if (a === 'email.sent') return `✉️ Sent an email${p.to ? ` → ${p.to}` : ''}`;
  if (/outreach|reach[-_. ]?out/.test(a)) return `🤝 Reached out to a subcontractor${t}`;
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
