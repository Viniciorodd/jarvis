// Regression suite for the shared agent-narration (pods/narrate.mjs) — the team's voice on Telegram + the
// Slack #floor. Pins which events become a signed line vs. get skipped, and the actor→persona mapping.

import { narrationFor, personaFor, narrationLine } from '../pods/narrate.mjs';

const ok = (pass, detail = '') => ({ pass, detail });

export default {
  agent: 'narrate',
  cases: [
    { name: 'milestones narrate: scan / draft / sent / outreach / submitted', run: () =>
      ok(/Scanned SAM — 8/.test(narrationFor({ action: 'scan.done', payload: { count: 8 } }))
        && /Drafted a proposal — West Point/.test(narrationFor({ action: 'proposal.draft', payload: { title: 'West Point' } }))
        && /Sent an email → co@usace/.test(narrationFor({ action: 'email.sent', payload: { to: 'co@usace.army.mil' } }))
        && /Reached out to a subcontractor/.test(narrationFor({ action: 'sub.outreach' }))
        && /Submitted a proposal/.test(narrationFor({ action: 'proposal.submitted' }))) },
    { name: 'noise is skipped (null): scores, scan-starts, spend checks, traces', run: () =>
      ok(narrationFor({ action: 'bid.score' }) === null && narrationFor({ action: 'scan.start' }) === null
        && narrationFor({ action: 'spend.check' }) === null && narrationFor({ kind: 'trace', action: 'router.classify' }) === null) },
    { name: 'disposition narrates only a WIN', run: () =>
      ok(/WON/.test(narrationFor({ action: 'disposition', rationale: 'marked won' })) && narrationFor({ action: 'disposition', rationale: 'marked lost' }) === null) },
    { name: 'facts-check failure is surfaced', run: () =>
      ok(/failed the facts-check/.test(narrationFor({ action: 'facts.violation', payload: { title: 'X' } }))) },
    { name: 'personaFor maps codenames to Nickname (Title)', run: () =>
      ok(personaFor('SAM-SCOUT') === 'Gideon (Gov Scout)' && personaFor('GOV-ANALYST') === 'Patricia (Bid Analyst)'
        && personaFor('operator') === 'You' && personaFor('GHOST-99') === 'Jarvis') },
    { name: 'narrationLine appends the signature; null for skipped events', run: () =>
      ok(/— Gideon \(Gov Scout\)$/.test(narrationLine({ action: 'scan.done', actor: 'SAM-SCOUT', payload: { count: 3 } })) && narrationLine({ action: 'bid.score' }) === null) },
  ],
};
