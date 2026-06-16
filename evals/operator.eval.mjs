// Regression suite for the Operator's pure milestone logic (pods/gov/operator.mjs).
// If overdue-detection regresses, a slipped deliverable goes unflagged — and CPARS (your past-performance
// rating, the thing that wins the next contract) quietly suffers. That's the failure this pins.

import { overdueMilestones } from '../pods/gov/operator.mjs';

const award = {
  milestones: [
    { name: 'Mobilization', due: '2026-01-10', status: 'done' },   // past but done -> not overdue
    { name: 'Month 1 report', due: '2026-01-20', status: 'pending' }, // past + pending -> overdue
    { name: 'Month 6 report', due: '2099-01-01', status: 'pending' }, // future -> not overdue
  ],
};
const now = new Date('2026-02-01T00:00:00Z');

export default {
  agent: 'operator',
  cases: [
    { name: 'flags the one past-due pending milestone', run: () => { const o = overdueMilestones(award, now); return { pass: o.length === 1 && o[0].name === 'Month 1 report', detail: o.map((m) => m.name).join(',') }; } },
    { name: 'a completed past milestone is NOT overdue', run: () => { const o = overdueMilestones(award, now); return { pass: !o.some((m) => m.name === 'Mobilization'), detail: '' }; } },
    { name: 'a future milestone is NOT overdue', run: () => { const o = overdueMilestones(award, now); return { pass: !o.some((m) => m.name === 'Month 6 report'), detail: '' }; } },
    { name: 'no milestones → nothing overdue (safe)', run: () => { const o = overdueMilestones({}, now); return { pass: o.length === 0, detail: '' }; } },
  ],
};
