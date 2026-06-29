// Evals for the vault idea-miner's PURE logic (pods/vault/idea-miner.mjs). The LLM proposes ideas, but
// dedupe/ranking/id-stability are deterministic code (doctrine #1) — these lock that so a dismissed idea
// never resurfaces and low-effort wins float to the top. No vault I/O, no model calls.

import { ideaId, parseToAbsorb, rankIdeas, dedupe } from '../pods/vault/idea-miner.mjs';

export default {
  agent: 'idea-miner',
  cases: [
    { name: 'ideaId is stable + normalizes case/punctuation',
      run: () => { const a = ideaId('Bundle janitorial + grounds!'); const b = ideaId('bundle  janitorial   grounds'); return { pass: a === b && a.startsWith('idea_'), detail: a }; } },

    { name: 'ideaId differs for different ideas',
      run: () => ({ pass: ideaId('Email the CO') !== ideaId('Call the CO'), detail: 'distinct' }) },

    { name: 'parseToAbsorb pulls link titles + headers, drops short noise',
      run: () => {
        const md = '# Marketing ideas\n- [Cold email playbook for gov primes](https://x.com)\n- ok\n> A longer plain line worth keeping here';
        const got = parseToAbsorb(md);
        return { pass: got.includes('Marketing ideas') && got.includes('Cold email playbook for gov primes') && !got.includes('ok'), detail: got.join(' | ') };
      } },

    { name: 'rankIdeas floats low-effort (S) above high-effort (L), stable within a tier',
      run: () => {
        const r = rankIdeas([{ title: 'big', effort: 'L' }, { title: 'quick', effort: 'S' }, { title: 'mid', effort: 'M' }, { title: 'quick2', effort: 'S' }]);
        return { pass: r[0].title === 'quick' && r[1].title === 'quick2' && r[3].title === 'big', detail: r.map((x) => x.title + ':' + x.effort).join(' › ') };
      } },

    { name: 'dedupe drops already-seen ideas',
      run: () => {
        const seen = new Set([ideaId('Reuse past-performance writeups')]);
        const out = dedupe([{ title: 'Reuse past-performance writeups' }, { title: 'Start a referral program' }], seen);
        return { pass: out.length === 1 && out[0].title === 'Start a referral program' && out[0].id, detail: out.map((o) => o.title).join(',') };
      } },

    { name: 'dedupe drops intra-list duplicates too',
      run: () => {
        const out = dedupe([{ title: 'Same idea' }, { title: 'same  IDEA' }]);
        return { pass: out.length === 1, detail: 'kept ' + out.length };
      } },
  ],
};
