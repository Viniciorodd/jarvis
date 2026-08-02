// Regression suite for subcontractor reply triage (pods/gov/reply-triage.mjs). The hole this closes: a sub
// who asks a QUESTION produced no quote, so the reply was silently discarded — the sub got no answer, the
// operator never heard, and the bid died weeks later for no visible reason. Nothing errored. That is the
// failure mode to pin hardest.

import { triageReply, extractQuestions, replyAlert } from '../pods/gov/reply-triage.mjs';

const ok = (pass, detail = '') => ({ pass, detail });
const T = (body, parsed = null, subject = '') => triageReply({ body, parsed, subject });

export default {
  agent: 'gov-reply-triage',
  cases: [
    { name: 'THE HOLE: a question with no quote is HIS move, not silence', run: () => {
      const r = T('Hi Vinicio — happy to look at this. What is the square footage of the building?');
      return ok(r.kind === 'question' && r.who === 'you' && r.questions.length === 1, JSON.stringify(r));
    } },

    { name: 'the actual question is pulled out, so the alert says what they asked', run: () => {
      const r = T('Thanks for reaching out. How many days per week is service required? Also, when does the contract start?');
      return ok(r.questions.length === 2 && /days per week/i.test(r.questions[0]), JSON.stringify(r.questions));
    } },

    // He asked for this one BY NAME: "the most important ones, which is we receive a quote for x contractor
    // for x opportunity." A quote landing is the definition of worth interrupting him for.
    { name: 'A QUOTE ARRIVING DOES ping him — he asked for this one by name', run: () => {
      const r = T('We can do it for $2,400 per month.', { quote: '$2,400/mo', can_perform: true });
      const a = replyAlert({ subName: 'Acme', triage: r });
      return ok(r.kind === 'quote' && a && /QUOTE IN/.test(a) && /2,400/.test(a), JSON.stringify({ r, a }));
    } },

    { name: 'a quote WITH a question still needs him (priced, but wants something confirmed)', run: () => {
      const r = T('We can do $2,400/mo. Does that include the windows?', { quote: '$2,400/mo' });
      return ok(r.kind === 'quote' && r.who === 'you' && r.questions.length === 1, JSON.stringify(r));
    } },

    { name: 'AN OUT-OF-OFFICE IS NOT CONTACT — it must not look like a responsive sub', run: () => {
      const r = T('I am out of the office until Monday with limited access to email.', null, 'Automatic reply');
      return ok(r.kind === 'auto' && r.who === 'jarvis' && r.questions.length === 0, JSON.stringify(r));
    } },

    { name: 'a bounce full of question marks is not a sub asking anything', run: () => {
      const r = T('Delivery Status Notification (Failure). Was the address correct? Did you mean?', null, 'Undeliverable');
      return ok(r.kind === 'auto', JSON.stringify(r));
    } },

    { name: 'a decline closes the loop so the backup gets activated', run: () => {
      const r = T('Thanks but we are not interested in this one.');
      return ok(r.kind === 'decline' && r.who === 'jarvis', JSON.stringify(r));
    } },

    { name: '"interested, no number yet" is chased by Jarvis, not escalated', run: () => {
      const r = T('Yes we can handle that scope.', { can_perform: true, quote: '' });
      return ok(r.kind === 'interested' && r.who === 'jarvis', JSON.stringify(r));
    } },

    { name: 'a real reply we cannot classify goes to HIM — never quietly binned', run: () => {
      const r = T('Received.');
      return ok(r.kind === 'unclear' && r.who === 'you', JSON.stringify(r));
    } },

    { name: 'quoted email history is not mistaken for their question', run: () => {
      const qs = extractQuestions('Sounds good.\n> On Mon, Vinicio wrote:\n> What is your rate for floor care?');
      return ok(qs.length === 0, JSON.stringify(qs));
    } },

    { name: 'a statement with a question mark but no ask is not a question', run: () =>
      ok(extractQuestions('Great, right?').length === 0, JSON.stringify(extractQuestions('Great, right?'))) },

    { name: 'ONLY the ones that need him produce a Telegram line', run: () => {
      // Quotes and questions interrupt him. Declines, autoresponders and "interested, no number" wait for
      // the end-of-day report — that is the noise he asked to stop receiving live.
      const alerts = [
        T('What is the square footage?'),
        T('We can do $2,400/mo.', { quote: '$2,400/mo' }),
        T('Not interested.'),
        T('Out of office until Monday.', null, 'Automatic reply'),
        T('Yes we can handle that scope.', { can_perform: true, quote: '' }),
      ].map((t) => replyAlert({ subName: 'Acme', triage: t }));
      return ok(alerts[0] && alerts[1] && alerts[2] === null && alerts[3] === null && alerts[4] === null, JSON.stringify(alerts.map((a) => !!a)));
    } },

    { name: 'the quote alert carries the number and the opportunity', run: () => {
      const a = replyAlert({ subName: 'Acme', oppTitle: 'B100 Deep Clean', triage: T('$2,400/mo. Does that include windows?', { quote: '$2,400/mo' }) });
      return ok(/QUOTE IN/.test(a) && /Acme/.test(a) && /B100/.test(a) && /windows/i.test(a), a);
    } },

    { name: 'empty / garbage input does not throw', run: () =>
      ok(T('').kind === 'unclear' && triageReply().kind === 'unclear' && extractQuestions().length === 0 && replyAlert() === null) },
  ],
};
