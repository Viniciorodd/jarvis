// escalation.mjs — keeps a deal MOVING without the operator babysitting it. His ask (2026-07-27):
// *"our prioritized form of communication is email, phone will only be a fall back, and for that we must have
// scalations, and to also let me know that we are blocked due to a unforsaw event."*
//
// The ladder (email-first, phone as the fallback, and an honest hand-back when the machine is out of moves):
//   day 0   sent           — the quote request went out
//   day 3   follow-up #1   — auto (Tier 1 template, same guardrails)
//   day 7   follow-up #2   — auto, final nudge
//   day 10  PHONE          — the machine cannot call. It hands the operator a task WITH the number and context.
//   day 14  stalled        — stop chasing this one; it's noise now. Say so plainly and move on.
// A REPLY at any point ends the ladder immediately — we never bump someone who already answered.
//
// Doctrine: PURE + eval-pinned. Escalation only decides WHEN to nudge; every send still runs the full
// outreach-policy gauntlet, so nothing here can bypass a guard, a cap, or the kill switch.
const DAY = 86400000;
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

// The ladder, in days since first contact. Operator-tunable via env, clamped to sane order.
export function ladder(env = process.env) {
  const f1 = Math.max(1, num(env.ESCALATE_FOLLOWUP1_DAYS) || 3);
  const f2 = Math.max(f1 + 1, num(env.ESCALATE_FOLLOWUP2_DAYS) || 7);
  const phone = Math.max(f2 + 1, num(env.ESCALATE_PHONE_DAYS) || 10);
  const stall = Math.max(phone + 1, num(env.ESCALATE_STALL_DAYS) || 14);
  return { f1, f2, phone, stall };
}

// PURE (eval-pinned): what is the next move on this outreach thread, and is it ours or his?
// thread = { to, name, phone, sentAt, lastContactAt, replied, followUps, noticeId, title }
export function nextMove(thread = {}, { now = new Date(), env = process.env } = {}) {
  const L = ladder(env);
  const start = thread.sentAt ? new Date(thread.sentAt).getTime() : NaN;
  if (!Number.isFinite(start)) return { action: 'none', who: 'jarvis', reason: 'nothing sent yet — nothing to chase' };
  if (thread.replied) return { action: 'none', who: 'jarvis', reason: 'they replied — ladder closed, no more nudges' };

  const days = Math.floor((new Date(now).getTime() - start) / DAY);
  const sinceLast = thread.lastContactAt ? Math.floor((new Date(now).getTime() - new Date(thread.lastContactAt).getTime()) / DAY) : days;
  const done = num(thread.followUps);

  if (days >= L.stall) return { action: 'stalled', who: 'jarvis', days, reason: `no reply in ${days} days after ${done} follow-up(s) and a phone hand-off — stop chasing, log it and move on` };
  // PHONE — the machine can't call. Hand it to the operator with everything he needs, don't pretend.
  if (days >= L.phone) return { action: 'phone', who: 'you', days, phone: thread.phone || '', reason: thread.phone ? `email is exhausted (${done} follow-ups, ${days} days) — a 2-minute call is the move now` : `email is exhausted (${done} follow-ups, ${days} days) and we have NO phone number on file — find one or drop them` };
  if (days >= L.f2 && done < 2 && sinceLast >= 2) return { action: 'follow-up', who: 'jarvis', days, n: 2, reason: `no reply in ${days} days — final email nudge` };
  if (days >= L.f1 && done < 1 && sinceLast >= 2) return { action: 'follow-up', who: 'jarvis', days, n: 1, reason: `no reply in ${days} days — first email nudge` };
  return { action: 'wait', who: 'jarvis', days, reason: `sent ${days} day(s) ago — inside the wait window` };
}

// PURE (eval-pinned): everything blocking THIS opportunity that the machine cannot resolve on its own.
// This is the "let me know we're blocked by an unforeseen event" list — stated plainly, with the fix.
export function blockers(ctx = {}, { now = new Date() } = {}) {
  const out = [];
  const { opp = {}, subs = [], matrix = null, siteVisit = null, quotes = 0 } = ctx;

  const deadline = opp.deadline ? new Date(opp.deadline) : null;
  if (deadline && !isNaN(deadline)) {
    const daysLeft = Math.ceil((deadline.getTime() - new Date(now).getTime()) / DAY);
    if (daysLeft < 0) out.push({ severity: 'blocked', what: 'The response deadline has passed', fix: 'Nothing to do — release it and move to the next one.' });
    else if (daysLeft <= 3 && quotes === 0) out.push({ severity: 'urgent', what: `Due in ${daysLeft} day(s) and NO sub has quoted yet`, fix: 'Call the top subs today, or no-bid it deliberately rather than by accident.' });
  }
  const reachable = subs.filter((s) => s && (s.contact_email || s.email)).length;
  if (!subs.length) out.push({ severity: 'blocked', what: 'No subcontractors found for this trade/area', fix: 'Widen the search radius or the trade, or self-perform.' });
  else if (!reachable) out.push({ severity: 'blocked', what: `${subs.length} sub(s) found but NONE has a usable email`, fix: 'Enrichment found no addresses — these need a phone call or a website form.' });
  else if (reachable < 3) out.push({ severity: 'warn', what: `Only ${reachable} reachable sub(s) — thin coverage for a competitive quote`, fix: 'Source more before relying on this pricing.' });

  if (siteVisit && siteVisit.required && !siteVisit.scheduled) {
    const sv = siteVisit.date ? new Date(siteVisit.date) : null;
    const passed = sv && !isNaN(sv) && sv.getTime() < new Date(now).getTime();
    out.push(passed
      ? { severity: 'blocked', what: `The MANDATORY site visit (${String(siteVisit.date).slice(0, 10)}) has already passed unattended`, fix: 'This is almost certainly a no-bid now — confirm with the CO before spending more time.' }
      : { severity: 'urgent', what: `A MANDATORY site visit${siteVisit.date ? ` on ${String(siteVisit.date).slice(0, 10)}` : ''} is not scheduled`, fix: 'Register/RSVP with the contracting officer now — missing it disqualifies the bid.' });
  }
  if (matrix && num(matrix.gap) > 0 && deadline && !isNaN(deadline) && Math.ceil((deadline.getTime() - new Date(now).getTime()) / DAY) <= 5) {
    out.push({ severity: 'urgent', what: `${matrix.gap} unanswered requirement(s) with the deadline close`, fix: 'Close the gaps in the compliance matrix before submitting — an unanswered "shall" is a non-responsive bid.' });
  }
  if (opp.portal && /piee|login|pennbid|bonfire|registered/i.test(String(opp.portal)) && !opp.portalReady) {
    out.push({ severity: 'warn', what: `Submission is portal-gated (${opp.portal}) and registration isn't confirmed`, fix: 'Register + download the package now — a login wall is how bids die unfiled.' });
  }
  return out;
}

// PURE (eval-pinned): pull a MANDATORY site visit out of solicitation text. Returns { required, date, mandatory,
// quote } or null. Never invents a date — no parseable date means date:null, not a guess.
const MONTHS = 'january|february|march|april|may|june|july|august|september|october|november|december';
export function siteVisitFrom(text = '') {
  const t = String(text || '');
  const m = t.match(new RegExp(`[^.\\n]{0,160}\\b(?:site\\s*visit|site\\s*inspection|pre-?bid\\s*(?:conference|meeting|walk)|walk\\s*-?\\s*through)\\b[^.\\n]{0,160}`, 'i'));
  if (!m) return null;
  const quote = m[0].replace(/\s+/g, ' ').trim();
  const mandatory = /\bmandatory\b|\brequired\b|\bmust\s+attend\b/i.test(quote);
  // a date only if the text actually states one
  const d = quote.match(new RegExp(`\\b(${MONTHS})\\s+(\\d{1,2}),?\\s*(\\d{4})?`, 'i')) || quote.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
  let date = null;
  if (d) { const parsed = new Date(d[0] + (d[3] ? '' : ` ${new Date().getFullYear()}`)); if (!isNaN(parsed)) date = parsed.toISOString().slice(0, 10); }
  // "no site visit will be offered" is the opposite of a requirement
  if (/\bno\s+(?:government-?facilitated\s+)?site\s*visit\b|will\s+not\s+be\s+(?:offered|conducted|held)/i.test(quote)) return { required: false, mandatory: false, date, quote, scheduled: false };
  return { required: true, mandatory, date, quote, scheduled: false };
}
