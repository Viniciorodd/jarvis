// Regression suite for the Rodgate inbox classifier (pods/gov/inbox.mjs).
// If 'award' detection regresses, you could miss a WIN landing in the inbox — the costliest miss possible.

import { classifyMail } from '../pods/gov/inbox.mjs';

export default {
  agent: 'gov-inbox',
  cases: [
    { name: 'a Notice of Award is an AWARD', run: () => ({ pass: classifyMail({ from: 'co@army.mil', subject: 'Notice of Award — W911 Custodial' }) === 'award', detail: '' }) },
    { name: '"you have been awarded the contract" is an AWARD', run: () => ({ pass: classifyMail({ subject: 'Congratulations', body: 'You have been awarded the contract effective Sept 1.' }) === 'award', detail: '' }) },
    { name: 'an unsuccessful-offeror notice is no_award', run: () => ({ pass: classifyMail({ subject: 'Award decision', body: 'You are an unsuccessful offeror for this solicitation.' }) === 'no_award', detail: '' }) },
    { name: 'mail from a .gov/.mil address is CO correspondence', run: () => ({ pass: classifyMail({ from: 'jane.doe@gsa.gov', subject: 'Question on your quote' }) === 'co', detail: '' }) },
    { name: 'a solicitation amendment is CO correspondence', run: () => ({ pass: classifyMail({ from: 'x@example.com', subject: 'Amendment 0002 to the solicitation' }) === 'co', detail: '' }) },
    { name: 'an ordinary email is other', run: () => ({ pass: classifyMail({ from: 'newsletter@store.com', subject: 'Weekend sale' }) === 'other', detail: '' }) },
  ],
};
