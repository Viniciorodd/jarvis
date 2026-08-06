// templates.mjs — the approved message set. Slot-filling ONLY; an agent never free-composes
// anything that could auto-send. Every template throws on a missing slot (fail closed) rather than
// rendering a message with a hole in it.
//
// Key prefixes are load-bearing — pods/redos/policy.mjs classifies by them:
//   cold-*   never auto-sends, at any tier
//   reply-*  tier 1, and only to someone whose record says replied === true
//   post-*   tier 1, and only to an owned channel
//   bump-*   tier 2, and only on a thread the operator opened
//
// Prices are NEVER written into a template. `{{price*}}` and `{{commission*}}` are filled from
// pods/redos/pricing.mjs at render time, which reads DealCalc/lib/pricing.ts.
//
// `share` is a required slot on every outward template. The shared Deal Score link is the whole
// argument — a message without it is a claim, a message with it is a demo. Making it required
// means a draft cannot physically go out with the placeholder still in it.

export const TEMPLATES = {
  'cold-affiliate': {
    tier: null,
    subject: '{{subject}}',
    requiredSlots: ['subject', 'name', 'hook', 'hookSource', 'share', 'deadline'],
    body: `{{name}},

{{hook}}

I built REDOS to do the part after that. It scores a deal and then says in plain words which
assumption is holding the return up. Here is one it graded as a failure, with the reasoning:
{{share}}

Opens with no account. Nothing touches a server.

On money: I pay 50% on a one-time price, so {{commission1}}, {{commission2}} or {{commission3}} a
sale. No renewal for the buyer to cancel, and no retention risk for you.

I will send you a top-tier key so you can try to break it before you decide. If it does not hold up
against your own deals, tell me and I will go away.

Could you let me know either way by {{deadline}}?

Vinicio
redoshq.com`,
  },

  'cold-followup': {
    tier: null,
    subject: 'Re: {{subject}}',
    requiredSlots: ['subject', 'name', 'share'],
    body: `{{name}}, following up once and then I will leave you alone.

The link is still live if you want to look: {{share}}

If the answer is no, no reply needed.

Vinicio`,
  },

  // Reported 40% response rate. Fires after a no. Never keeps selling — that is the point of it.
  'cold-rejection-reply': {
    tier: null,
    subject: '',
    requiredSlots: ['name'],
    body: `{{name}},

Thanks for taking the time to respond.

What could I have done to win your business? I know you are busy, but any guidance helps me improve.

Vinicio

PS. Mind if I touch base in two months?`,
  },

  'reply-partner-question': {
    tier: 1,
    subject: '',
    requiredSlots: ['name', 'answer'],
    body: `{{name}},

{{answer}}

Anything else, just reply here. I answer these myself.

Vinicio`,
  },

  // For the call request that follows every yes. The operator is an introvert; this is the out.
  'reply-decline-call': {
    tier: 1,
    subject: '',
    requiredSlots: ['name'],
    body: `{{name}},

Thanks for the offer. I will pass on a call, I am better over email.

Happy to answer anything in short replies, and I can send a recorded walkthrough if that is easier.

Vinicio`,
  },

  'post-teardown': {
    tier: 1,
    subject: '',
    requiredSlots: ['finding', 'share'],
    body: `Ran a real listing through the numbers this week.

{{finding}}

Full score and the reasoning: {{share}}

No account needed to open it.`,
  },

  'post-shortform-script': {
    tier: 1,
    subject: '',
    requiredSlots: ['finding', 'share'],
    body: `[0-3s] This deal looks fine. It is not.

[3-40s] {{finding}}

[40-55s] Screen recording: the score, then the coach explaining which assumption carries it.

[55-60s] Link in the description, opens with no account: {{share}}`,
  },

  'bump-partner': {
    tier: 2,
    subject: 'Re: {{subject}}',
    requiredSlots: ['subject', 'name', 'share'],
    body: `{{name}}, checking back on this one.

{{share}}

If it is a no, say so and I will stop.

Vinicio`,
  },
};

const SLOT = /\{\{(\w+)\}\}/g;

/**
 * Render an approved template. Throws on an unknown key, a missing slot, or a slot left empty.
 * Price and commission slots are injected from the caller's verified plan set, never from slots.
 *
 * @param {string} key
 * @param {object} slots
 * @param {{plans:Array,commissions:Array}} pricing  from pods/redos/pricing.mjs readPlans()
 * @returns {{key:string, subject:string, body:string}}
 */
export function renderTemplate(key, slots = {}, pricing = null) {
  const t = TEMPLATES[key];
  if (!t) throw new Error(`unknown template "${key}"`);

  const filled = { ...slots };
  if (pricing && pricing.ok) {
    pricing.commissions.forEach((c, i) => {
      filled[`price${i + 1}`] = `$${c.price}`;
      filled[`commission${i + 1}`] = `$${c.commission.toFixed(2).replace(/\.00$/, '')}`;
    });
  }

  const missing = t.requiredSlots.filter((s) => !String(filled[s] ?? '').trim());
  if (missing.length) throw new Error(`template "${key}" missing slot(s): ${missing.join(', ')}`);

  const fill = (text) => String(text).replace(SLOT, (m, name) => {
    if (filled[name] == null || String(filled[name]).trim() === '') {
      throw new Error(`template "${key}" left slot "${name}" unfilled`);
    }
    return String(filled[name]);
  });

  return { key, subject: t.subject ? fill(t.subject) : '', body: fill(t.body) };
}
