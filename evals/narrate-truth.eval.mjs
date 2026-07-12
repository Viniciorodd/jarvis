// Truth-contract regression suite for pods/narrate.mjs — born from a real trust breach: the vault's
// "Jarvis Telegram Discrepancy Log" caught Telegram announcing "🤝 Reached out to a subcontractor —
// Hector (Procurement Lead)" when NO email was ever sent (the event was sub.outreach.DRAFT, the send
// was gated, GOV_AUTO_SEND was off). These pins make the four narration rules permanent:
//   1. gate (approval.request)  → "waiting on YOUR approval (nothing sent)" — never a completed act
//   2. dry-run                  → "NOT sent (auto-send is off)"
//   3. "Sent"/"Reached out"     → ONLY with hard evidence (messageId / accepted / sent:true / status:'sent')
//   4. ambiguous                → the weaker claim, or null
// If any of these fail, the feeds are lying to the operator again. Do not weaken them.

import { narrationFor, narrationLine, hasSendEvidence, isDryRun } from '../pods/narrate.mjs';

const ok = (pass, detail = '') => ({ pass, detail });
const LIES = /reached out|sent an email|✉️ Sent|answered|completed|done\b/i;

// The EXACT historical event shape that produced the false Telegram line (pods/gov/connector.mjs
// emits this when Hector merely WRITES the outreach file — nothing has gone out yet).
const HECTOR_DRAFT = {
  kind: 'action', actor: 'CONNECT-01', pod: 'gov', action: 'sub.outreach.draft', cost_usd: 0.01,
  reversible: true, rationale: 'plumbing outreach drafted (asks for past performance + quote)',
  payload: { noticeId: 'N123', trade: 'plumbing', top: 'sub-7', file: 'gov-drafts/outreach-n123-plumbing.md' },
};

// The executor's dry-run event (control-plane/server.js emits action:'email.preview' when
// GOV_AUTO_SEND is off and an approved send is only previewed).
const DRY_RUN_PREVIEW = {
  kind: 'action', actor: 'GOV-SEND', pod: 'gov', action: 'email.preview', reversible: false, status: 'done',
  rationale: 'Auto-send off (set GOV_AUTO_SEND=1) — previewed "Teaming request" → hector@subco.com',
  payload: { file: 'gov-drafts/outreach-n123-plumbing.md', to: 'hector@subco.com', sent: false, messageId: null },
};

export default {
  agent: 'narrate-truth',
  cases: [
    { name: 'gate: approval.request narrates as waiting on YOUR approval — never sent/reached-out', run: () => {
      const text = narrationFor({ kind: 'approval.request', actor: 'CONNECT-01', pod: 'gov', action: 'send', status: 'pending',
        reversible: false, rationale: 'Send plumbing outreach (SOW + ask for past performance + quote) for Ft. Dix Repairs.',
        payload: { noticeId: 'N123', trade: 'plumbing', file: 'gov-drafts/outreach-n123-plumbing.md' } });
      return ok(!!text && /waiting on YOUR approval/.test(text) && /nothing sent/.test(text) && !LIES.test(text), text || 'null');
    } },
    { name: 'dry-run: executor email.preview narrates NOT sent (auto-send is off)', run: () => {
      const text = narrationFor(DRY_RUN_PREVIEW);
      return ok(!!text && /NOT sent \(auto-send is off\)/.test(text) && /hector@subco\.com/.test(text) && !LIES.test(text)
        && isDryRun(DRY_RUN_PREVIEW) && !hasSendEvidence(DRY_RUN_PREVIEW), text || 'null');
    } },
    { name: 'dry-run: payload.dryRun=true (sender ground truth) also narrates NOT sent', run: () => {
      const text = narrationFor({ kind: 'action', pod: 'gov', action: 'email.send', payload: { dryRun: true, to: 'a@b.com', title: 'Quote request' } });
      return ok(!!text && /NOT sent/.test(text) && !LIES.test(text), text || 'null');
    } },
    { name: 'evidence-bearing send (messageId/sent:true) MAY say Sent; outreach with evidence MAY say Reached out', run: () => {
      const sent = narrationFor({ kind: 'action', action: 'email.sent', payload: { to: 'co@usace.army.mil', sent: true, messageId: '<x1@rodgate>', accepted: ['co@usace.army.mil'] } });
      const reach = narrationFor({ kind: 'action', action: 'sub.outreach', payload: { title: 'JAN-PRO teaming', sent: true, messageId: '<x2@rodgate>' } });
      return ok(/Sent an email → co@usace/.test(sent || '') && /Reached out to a subcontractor — JAN-PRO teaming/.test(reach || ''), [sent, reach].join(' | '));
    } },
    { name: 'THE historical false line: sub.outreach.draft (Hector) now narrates a DRAFT, signed truthfully', run: () => {
      const text = narrationFor(HECTOR_DRAFT);
      const line = narrationLine(HECTOR_DRAFT);
      return ok(!!text && !/Reached out/i.test(text) && /Drafted sub outreach/.test(text) && /nothing sent/.test(text)
        && /— Hector \(Procurement Lead\)$/.test(line || ''), line || 'null');
    } },
    { name: 'ambiguous events get the weaker claim: bare outreach = NOT confirmed; email.sent w/o receipt = UNCONFIRMED', run: () => {
      const bare = narrationFor({ action: 'sub.outreach' });
      const noRcpt = narrationFor({ action: 'email.sent', payload: { to: 'a@b.com' } });
      return ok(!!bare && !/Reached out/i.test(bare) && /NOT confirmed sent/.test(bare)
        && !!noRcpt && !/^✉️ Sent/.test(noRcpt) && /UNCONFIRMED/.test(noRcpt), [bare, noRcpt].join(' | '));
    } },
    { name: 'same lie-class fixed for sources-sought: .draft narrates gated, evidence narrates Answered; failures say so', run: () => {
      const draft = narrationFor({ kind: 'action', actor: 'GOV-ANALYST', pod: 'gov', action: 'sources_sought.draft', reversible: true,
        rationale: 'Capability response drafted for sources-sought: VA Custodial', payload: { noticeId: 'S9', file: 'gov-drafts/ss-s9.md' } });
      const answered = narrationFor({ action: 'sources_sought.reply', status: 'sent', payload: { title: 'VA Custodial', messageId: '<x3@rodgate>' } });
      const failed = narrationFor({ action: 'email.failed', payload: { to: 'a@b.com', sent: false } });
      return ok(!!draft && !/Answered/.test(draft) && /nothing sent/.test(draft)
        && /Answered a sources-sought/.test(answered || '')
        && /FAILED/.test(failed || '') && /nothing went out/.test(failed || ''), [draft, answered, failed].join(' | '));
    } },
  ],
};
