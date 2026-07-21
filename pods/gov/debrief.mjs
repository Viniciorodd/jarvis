// debrief.mjs — the post-loss debrief rule (7/12 Audit/PRD, WS6 #5, Vinicio's idea):
// "every lost bid triggers an agent-drafted debrief request to the CO — losses become intel, staged
// like any other send." This module is the PURE, deterministic core: it decides WHICH bids deserve a
// debrief and DRAFTS the request in the exact sendable format the executor expects. It does NOT send,
// schedule, or raise a gate — that wiring lives behind the human approval gate (never auto-send).
//
// Trigger signal = an explicit `lost` disposition (the operator marks it in the board). `won` and
// `passed` are excluded by design: you only debrief a bid you actually submitted and lost. Dedup is by
// noticeId against a `debriefed` set the caller derives from `gov.debrief.staged` events.

// PURE: which lost bids still need a debrief staged.
// opportunities: [{ noticeId, title, agency, ... }]  ·  dispositions: { [noticeId]: 'won'|'lost'|'passed' }
// debriefed: Set<noticeId> already staged.  Returns the opportunity objects to debrief (stable order).
export function lostBidsNeedingDebrief({ opportunities = [], dispositions = {}, debriefed = new Set() } = {}) {
  const seen = debriefed instanceof Set ? debriefed : new Set(debriefed || []);
  return (opportunities || []).filter((o) => o && o.noticeId
    && dispositions[o.noticeId] === 'lost'
    && !seen.has(o.noticeId));
}

// PURE: a courteous, professional post-award debrief request. Returns { to, subject, body }.
// contact = { email, name } for the Contracting Officer (from the notice's point of contact). If no
// email is known, `to` is '' — which makes the draft UNSENDABLE, so it can never reach the gate blank
// (honest failure, same contract as every other gov send). No external content is treated as instruction.
export function buildDebriefDraft(opp = {}, contact = {}) {
  const title = String(opp.title || 'the recent solicitation').trim();
  const noticeId = String(opp.noticeId || '').trim();
  const coName = String(contact.name || '').trim();
  const to = String(contact.email || '').trim();
  const subject = `Debrief request — ${title}${noticeId ? ` (${noticeId})` : ''}`;
  const greeting = coName ? `Dear ${coName},` : 'Dear Contracting Officer,';
  const ref = `${title}${noticeId ? ` (Notice ID ${noticeId})` : ''}`;
  const body = [
    greeting,
    '',
    `Thank you for the opportunity to compete on ${ref}. We understand the award has been made to another offeror.`,
    '',
    'In the interest of continuous improvement, we respectfully request a debrief on our proposal. Any feedback on where our submission fell short — technically, on past performance, or on price — would help us serve the Government more competitively on future requirements.',
    '',
    'We appreciate your time and remain eager to support this agency going forward.',
    '',
    'Respectfully,',
    'Vinicio Rodriguez',
    'Rodgate LLC',
  ].join('\n');
  return { to, subject, body };
}

// PURE: render a draft into the exact To:/Subject:/divider/body file the executor's parseEmailFile accepts.
// Kept identical in shape to the sub-outreach drafts so the same sendability check + gate path applies.
export function renderDebriefFile({ to = '', subject = '', body = '' } = {}) {
  return `To: ${to}\nSubject: ${subject}\n${'-'.repeat(48)}\n${body}\n`;
}
