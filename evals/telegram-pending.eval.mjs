// Regression suite for the Telegram "show me what's waiting" intent (companion/telegram-bridge.mjs
// wantsPending). Born from a real trust bug (2026-07-18): the digest truthfully said "Hector drafted 2 sub
// outreach — waiting on approval", but "pull me the 2 sub outreach" got ROUTED to a new task instead of
// READING the store the drafts live in — a self-contradiction. wantsPending routes those asks straight to
// /approvals/pending (the one source of truth). The two properties that matter:
//   1) it CATCHES the real retrieval phrasings (incl. the exact operator sentence), and
//   2) it does NOT hijack a CREATE ("draft a proposal") or ordinary chat — that would be worse than the bug.

import { wantsPending } from '../companion/telegram-bridge.mjs';

const ok = (pass, detail = '') => ({ pass, detail });

export default {
  agent: 'telegram-pending',
  cases: [
    { name: 'catches the exact operator sentence that exposed the bug',
      run: () => ok(wantsPending('Pull me the 2 sub outreach from hector so that I could read it') === true) },
    { name: '/pending, /drafts, /waiting, /approvals commands',
      run: () => ok(wantsPending('/pending') && wantsPending('/drafts') && wantsPending('/waiting') && wantsPending('/approvals')) },
    { name: 'natural retrieval phrasings',
      run: () => ok(wantsPending('show me the drafts') && wantsPending("what's waiting on me") && wantsPending('read me those outreach emails') && wantsPending('list my pending approvals')) },
    { name: '"the N sub outreach" / "my outreach" without an explicit verb',
      run: () => ok(wantsPending('the 2 sub outreach') && wantsPending('those outreach drafts') && wantsPending('my pending')) },
    { name: 'does NOT hijack a CREATE request (draft a proposal)',
      run: () => ok(wantsPending('draft a proposal for the USACE bid') === false && wantsPending('write the outreach email fresh') === false ? true : false, 'create intents must fall through to the brain') },
    { name: 'does NOT hijack ordinary chat or empty input',
      run: () => ok(wantsPending('what should I focus on today') === false && wantsPending('how much did we collect this week') === false && wantsPending('') === false && wantsPending(null) === false) },
  ],
};
