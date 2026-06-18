// SaaS pod worker (Theo / RECON-DEV) — triages a support ticket and drafts a reply.
// Ticket → Claude drafts an accurate, friendly reply (and flags anything legal/refund/abuse for you
// instead of promising it) → HITL "send reply?" gate. Nothing is sent without your review.

import { emit, mirror, hqApproval, gateApproval, claude } from '../lib.mjs';

const SYS = `You are the support lead for ReconTweaks, a Windows gaming-optimization tweak utility. Draft a concise, friendly, technically accurate reply to a customer support ticket.
- If it's a how-to / config question: answer it directly and clearly.
- If it's a bug: acknowledge, give one safe workaround if obvious, and ask for the SINGLE most useful diagnostic (Windows build + which tweak + what changed).
- If it's a refund, chargeback, legal, or abuse issue: DO NOT promise or commit anything — write one line flagging it for the owner to handle personally.
Output ONLY the reply text.`;

export async function runTriage({ ticket, ticketId = 'tkt-' + Date.now() } = {}) {
  await mirror('RECON-DEV', 'work', `Triaging: ${String(ticket).slice(0, 56)}`, 'saas');
  await emit({ kind: 'action', actor: 'RECON-DEV', pod: 'saas', action: 'ticket.triage', rationale: String(ticket).slice(0, 120), payload: { ticketId } });

  const r = await claude(SYS, String(ticket), { tier: 'draft', maxTokens: 500, agent: 'RECON-DEV' });
  const reply = (r.text || '(no reply drafted — model unavailable)').trim();
  const sensitive = /\b(refund|chargeback|charge back|lawyer|legal|sue|gdpr|dmca)\b/i.test(String(ticket));

  await emit({ kind: 'action', actor: 'RECON-DEV', pod: 'saas', action: 'ticket.reply.draft', cost_usd: r.cost || 0, reversible: true, rationale: `reply drafted for ${ticketId}${sensitive ? ' (flagged sensitive)' : ''}`, payload: { ticketId, sensitive, reply: reply.slice(0, 600) } });
  await gateApproval(
    { kind: 'approval.request', actor: 'RECON-DEV', pod: 'saas', action: 'reply', status: 'pending', reversible: false, rationale: `Support reply drafted for: ${String(ticket).slice(0, 60)}${sensitive ? ' — SENSITIVE, review carefully' : ''}`, payload: { ticketId, reply } },
    { pod: 'Software Lab', title: `${sensitive ? '⚠ ' : ''}Reply to ticket: ${String(ticket).slice(0, 42)}`, detail: reply.slice(0, 160), xp: 10, verb: 'Review & send' });
  await mirror('RECON-DEV', 'need', `Reply drafted — review & send`, 'saas');
  return { ticketId, reply, sensitive, ok: !!r.text };
}

if (process.argv[1] && process.argv[1].endsWith('worker.mjs') && process.argv[1].includes('saas')) {
  const ticket = process.argv.slice(2).join(' ') || 'After the latest Windows update ReconTweaks wont apply the FPS tweak, it just hangs. Help?';
  runTriage({ ticket }).then((r) => console.log(JSON.stringify(r, null, 2))).catch((e) => { console.error(e); process.exitCode = 1; });
}
