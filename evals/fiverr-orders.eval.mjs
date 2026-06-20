// Regression suite for the Fiverr order watcher's PURE core (pods/fiverr/inbox.mjs): does it correctly
// spot a new order, pull the order id + buyer brief, and ignore noise? If this regresses, Remy could
// auto-draft from a newsletter, miss a real gig, or design the literal email footer. No network — just
// the deterministic classifier + extractor.

import { classifyFiverrMail, extractOrder } from '../pods/fiverr/inbox.mjs';

export default {
  agent: 'fiverr-orders',
  cases: [
    { name: 'classifies a new-order email',
      run: () => { const c = classifyFiverrMail({ from: 'no-reply@fiverr.com', subject: 'Good news! You received a new order (FO8412SR9X)', body: 'buyer purchased your gig' }); return { pass: c === 'order', detail: c }; } },
    { name: 'classifies a requirements email',
      run: () => { const c = classifyFiverrMail({ from: 'no-reply@fiverr.com', subject: 'buyerjoe sent the requirements for order FO9921ZZ', body: 'buyer message...' }); return { pass: c === 'requirements', detail: c }; } },
    { name: 'ignores a non-Fiverr newsletter',
      run: () => { const c = classifyFiverrMail({ from: 'newsletter@medium.com', subject: 'Your weekly digest', body: 'unrelated' }); return { pass: c === 'other', detail: c }; } },
    { name: 'classifies a buyer message (not an order)',
      run: () => { const c = classifyFiverrMail({ from: 'no-reply@fiverr.com', subject: 'buyerjoe sent you a message', body: 'hi' }); return { pass: c === 'message', detail: c }; } },
    { name: 'extracts the FO order id',
      run: () => { const e = extractOrder({ subject: 'You received a new order (FO8412SR9X)', body: 'x' }); return { pass: e.orderId === 'FO8412SR9X', detail: String(e.orderId) }; } },
    { name: 'extracts the buyer brief from a requirements block',
      run: () => { const e = extractOrder({ subject: 'requirements', body: 'Requirements: I need a MrBeast style thumbnail about making money with AI, shocked face. Unsubscribe here.' }); return { pass: /MrBeast style thumbnail/.test(e.brief) && !/Unsubscribe/.test(e.brief), detail: e.brief }; } },
    { name: 'strips HTML + footer boilerplate from the brief',
      run: () => { const e = extractOrder({ subject: 's', body: "Buyer's message: <b>Make a dark thriller cover</b>. Fiverr International Ltd. terms of service" }); return { pass: e.brief === 'Make a dark thriller cover.', detail: JSON.stringify(e.brief) }; } },
    { name: 'returns no brief when the email lacks one (triggers needs-brief, not a junk draft)',
      run: () => { const e = extractOrder({ subject: 'You have a new order FO5500AB', body: 'Open Fiverr to view the buyer requirements. Manage notifications.' }); return { pass: !e.brief || e.brief.length < 25, detail: JSON.stringify(e.brief) }; } },
  ],
};
