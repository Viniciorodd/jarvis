// Regression suite for what earns a phone buzz (pods/notify-policy.mjs).
//
// The failure this exists to prevent is measured, not theoretical: zero of the operator's last 200 events
// show an approval decision. The queue grew to 30 while he tuned the channel out entirely — "I'm just
// ignoring everything." A notification he ignores is worse than none, because we then believe he was told.
// So the tests bias hard toward SILENCE, and only let through decisions with money or a deadline attached.

import { worthABuzz, buzzText, pickBuzzes } from '../pods/notify-policy.mjs';

const ok = (pass, detail = '') => ({ pass, detail });
const ev = (action, over = {}) => ({ id: Math.random().toString(36).slice(2), action, ...over });

export default {
  agent: 'notify-policy',
  cases: [
    // ── the noise that trained him to ignore it ──
    { name: 'THE NOISE: routine outreach, scans and triage NEVER buzz', run: () => {
      const noisy = ['outreach.auto_sent', 'outreach.followup', 'scan.done', 'inbox.triage', 'sub.reply.parsed', 'sub.reply.auto', 'approvals.nudged', 'gov.digest.sent'];
      const loud = noisy.filter((a) => worthABuzz(ev(a)));
      return ok(loud.length === 0, 'still buzzing: ' + loud.join(', '));
    } },

    { name: 'a routine outreach GATE does not stop his day either', run: () =>
      ok(!worthABuzz({ kind: 'approval.request', action: 'send', rationale: 'Send sub-quote to Acme' })) },

    { name: 'doctrine boilerplate can never reach his phone', run: () =>
      ok(buzzText({ kind: 'approval.request', action: 'submit', rationale: 'Treated as irreversible — gated for your approval (doctrine §9 rule 2).' }) === null) },

    // ── what genuinely earns it ──
    { name: 'a SUBMIT decision buzzes — deadline and money attached', run: () =>
      ok(worthABuzz({ kind: 'approval.request', action: 'submit', payload: { title: 'B100 Deep Clean' } })) },

    { name: 'a sub waiting on HIM buzzes — they cannot quote until he answers', run: () =>
      ok(worthABuzz(ev('sub.reply.needs_you', { rationale: '❓ Acme needs an answer' }))) },

    { name: 'a priced deal buzzes — that is real money moving', run: () =>
      ok(worthABuzz(ev('deal.priced', { rationale: 'B100: bid $4,956' }))) },

    { name: 'an ERROR always buzzes, whatever it is', run: () =>
      ok(worthABuzz(ev('scan.done', { status: 'error', rationale: 'SAM scan failed' }))) },

    { name: 'money actions buzz (invoice, payment, award)', run: () =>
      ok(['invoice.created', 'payment.received', 'contract.award'].every((a) => worthABuzz(ev(a))))},

    // ── failing closed ──
    { name: 'FAILS CLOSED: an unknown action stays SILENT', run: () =>
      ok(!worthABuzz(ev('something.brand.new')) && !worthABuzz({}) && !worthABuzz()) },

    { name: 'a buzz with no real subject is suppressed, never sent blank', run: () =>
      ok(buzzText(ev('deal.priced', { rationale: '' })) === null && buzzText() === null) },

    // ── the burst guard ──
    { name: 'THE BURST GUARD: a backlog cannot dump 30 messages on him', run: () => {
      const many = Array.from({ length: 30 }, (_, i) => ev('deal.priced', { rationale: 'deal ' + i }));
      return ok(pickBuzzes(many).length === 3, String(pickBuzzes(many).length));
    } },

    { name: 'the same message twice is noise by definition — deduped', run: () => {
      const dupes = [ev('deal.priced', { rationale: 'same thing' }), ev('deal.priced', { rationale: 'same thing' })];
      return ok(pickBuzzes(dupes).length === 1, JSON.stringify(pickBuzzes(dupes)));
    } },

    { name: 'a quiet stream produces NOTHING at all', run: () =>
      ok(pickBuzzes([ev('scan.done'), ev('outreach.auto_sent'), ev('trace')]).length === 0) },

    { name: 'empty / garbage input does not throw', run: () =>
      ok(pickBuzzes().length === 0 && pickBuzzes(null).length === 0) },
  ],
};
